import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JobMonitoringAgent } from '../monitor.ts';
import { HuggingFaceJudge } from '../matching/huggingface-judge.ts';
import { OpenRouterJudge } from '../matching/openrouter-judge.ts';
import { TelegramNotifier } from '../notifier/telegram.ts';
import { ScraperCoordinator, SAMPLE_MOROCCO_JOBS } from '../scraper/scraper.ts';
import { StateManager } from '../state/state-manager.ts';
import { InferenceClient } from '@huggingface/inference';
import { JudgeError } from '../matching/types.ts';

const TEST_ORCH_STATE = path.resolve(process.cwd(), 'data/test-orch-seen.json');

describe('JobMonitoringAgent End-to-End Orchestration', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_ORCH_STATE)) {
      fs.unlinkSync(TEST_ORCH_STATE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_ORCH_STATE)) {
      fs.unlinkSync(TEST_ORCH_STATE);
    }
  });

  it('runs successfully with mocked components and respects notification limits', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockImplementation(async ({ messages }) => {
        const userMsg = messages[1].content;
        if (userMsg.includes('infirmier') || userMsg.includes('medical')) {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: 'reject',
                    confidence: 95,
                    category: 'irrelevant',
                    reasons: 'Healthcare job',
                    qualification_assessment: 'Santé',
                    missing_information: 'None',
                  }),
                },
              },
            ],
          };
        }
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: 'match',
                  confidence: 88,
                  category: 'technicien_specialise',
                  reasons: 'IT Role',
                  qualification_assessment: 'Bac+2 DTS',
                  missing_information: 'None',
                }),
              },
            },
          ],
        };
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 101 } }),
    });

    const notifier = new TelegramNotifier({
      botToken: 'bot_token',
      chatId: '12345',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const scraper = new ScraperCoordinator({ useDemoFixtures: true });
    const stateManager = new StateManager({
      stateFilePath: TEST_ORCH_STATE,
      firstRunMaxNotifications: 2, // limit to 2
    });

    const agent = new JobMonitoringAgent({
      judge,
      notifier,
      scraper,
      stateManager,
    });

    const summary = await agent.run();
    expect(summary.success).toBe(true);
    expect(summary.totalScraped).toBe(SAMPLE_MOROCCO_JOBS.length);
    expect(summary.notificationsSent).toBeLessThanOrEqual(2);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('halts gracefully when Hugging Face quota is exhausted without marking un-evaluated jobs as rejected', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockRejectedValue({
        name: 'ProviderApiError',
        httpResponse: { status: 402 },
        message: 'Payment required: out of inference quota',
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 0,
    });

    const scraper = new ScraperCoordinator({ useDemoFixtures: true });
    const stateManager = new StateManager({ stateFilePath: TEST_ORCH_STATE });

    const agent = new JobMonitoringAgent({
      judge,
      scraper,
      stateManager,
    });

    const summary = await agent.run();
    expect(summary.quotaExhausted).toBe(true);
    expect(summary.evaluatedWithAi).toBe(0);

    // Verify jobs were not marked as evaluated or rejected
    const records = stateManager.getAllRecords();
    const evaluatedRecords = Object.values(records).filter((r) => r.evaluated);
    expect(evaluatedRecords.length).toBe(0);
  });

  it('caches evaluations on second run and does not call inference API again', async () => {
    const mockChat = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: 'match',
              confidence: 90,
              category: 'technicien_specialise',
              reasons: 'IT Role',
              qualification_assessment: 'Bac+2 DTS',
              missing_information: 'None',
            }),
          },
        },
      ],
    });

    const mockClient = { chatCompletion: mockChat } as unknown as InferenceClient;
    const judge = new HuggingFaceJudge({ apiKey: 'test_token', client: mockClient });
    const scraper = new ScraperCoordinator({ useDemoFixtures: true });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 202 } }),
    });
    const notifier = new TelegramNotifier({
      botToken: 'test_token',
      chatId: '123',
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const stateManager = new StateManager({ stateFilePath: TEST_ORCH_STATE });
    const agent = new JobMonitoringAgent({ judge, scraper, stateManager, notifier });

    // Run 1
    const summary1 = await agent.run();
    const callCountAfterRun1 = mockChat.mock.calls.length;
    expect(callCountAfterRun1).toBeGreaterThan(0);

    // Run 2 with same state
    const agent2 = new JobMonitoringAgent({ judge, scraper, stateManager, notifier });
    const summary2 = await agent2.run();
    expect(summary2.cachedEvaluationsUsed).toBeGreaterThan(0);
    // Should NOT have made any new chat calls
    expect(mockChat.mock.calls.length).toBe(callCountAfterRun1);
  });

  it('ensures failed inference requests leave jobs eligible for future processing without marking them rejected or notified', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockRejectedValue({
        name: 'ProviderApiError',
        httpResponse: {
          status: 404,
          requestId: 'Root=1-fail-test',
          body: {
            error: {
              message: 'The model Qwen/Qwen2.5-7B-Instruct does not exist on router',
              type: 'invalid_request_error',
            },
          },
        },
        message:
          'Failed to perform inference: an HTTP error occurred when requesting the provider.',
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 0,
    });

    const mockFetch = vi.fn();
    const notifier = new TelegramNotifier({
      botToken: 'test_token',
      chatId: '123',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const scraper = new ScraperCoordinator({ useDemoFixtures: true });
    const stateManager = new StateManager({ stateFilePath: TEST_ORCH_STATE });

    const agent = new JobMonitoringAgent({
      judge,
      scraper,
      stateManager,
      notifier,
    });

    const summary = await agent.run();
    expect(summary.errors.length).toBeGreaterThan(0);
    expect(summary.notificationsSent).toBe(0);
    // Telegram was never invoked for failed jobs
    expect(mockFetch).not.toHaveBeenCalled();

    const records = stateManager.getAllRecords();
    const allJobList = Object.values(records);
    expect(allJobList.length).toBeGreaterThan(0);

    for (const record of allJobList) {
      // None of the jobs must be marked as successfully evaluated
      expect(record.evaluated).toBe(false);
      // None must have a reject or match decision recorded
      expect(record.evaluation).toBeUndefined();
      // None must be marked as notified
      expect(record.notified).toBe(false);
    }
  });

  it('orchestrates end-to-end with OpenRouter free model and delivers candidate alerts', async () => {
    const mockOpenRouterFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('chat/completions')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id: 'gen-or-123',
              model: 'openrouter/free',
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      decision: 'match',
                      confidence: 96,
                      category: 'technicien_specialise',
                      reasons: 'Strong IT match for Bac+2 DTS Technicien Spécialisé',
                      qualification_assessment: 'Bac+2 DTS OFPPT',
                      missing_information: 'None',
                    }),
                  },
                },
              ],
            }),
        };
      }
      return { ok: false, status: 404, text: async () => '' };
    });

    const openRouterJudge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-mock-key',
      fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
    });

    const mockTelegramFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 303 } }),
    });

    const notifier = new TelegramNotifier({
      botToken: 'bot_test',
      chatId: '456',
      fetchFn: mockTelegramFetch as unknown as typeof fetch,
    });

    const scraper = new ScraperCoordinator({ useDemoFixtures: true });
    const stateManager = new StateManager({
      stateFilePath: TEST_ORCH_STATE,
      firstRunMaxNotifications: 3,
    });

    const agent = new JobMonitoringAgent({
      judge: openRouterJudge,
      notifier,
      scraper,
      stateManager,
    });

    const summary = await agent.run();
    expect(summary.success).toBe(true);
    expect(summary.evaluatedWithAi).toBeGreaterThan(0);
    expect(summary.matchesFound).toBeGreaterThan(0);
    expect(summary.notificationsSent).toBeGreaterThan(0);
    expect(mockTelegramFetch).toHaveBeenCalled();
  });
});
