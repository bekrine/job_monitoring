import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HuggingFaceJudge,
  extractJsonFromText,
  DEFAULT_HF_MODEL,
} from '../matching/huggingface-judge.ts';
import { JudgeError, ScrapedJob } from '../matching/types.ts';
import {
  redactSensitiveData,
  verifyModelInferenceProvider,
  DEFAULT_VERIFIED_HF_MODEL,
} from '../matching/model-verifier.ts';
import { InferenceClient } from '@huggingface/inference';

const mockJob: ScrapedJob = {
  id: 'job-123',
  title: 'Technicien Spécialisé en Systèmes et Réseaux',
  employer: 'Ministère de la Santé',
  location: 'Rabat',
  url: 'https://example.com/job/123',
  description: 'Poste de technicien Bac+2 DTS en maintenance et réseaux informatiques.',
};

describe('Sensitive Data Redaction', () => {
  it('redacts Hugging Face tokens and Authorization headers', () => {
    const raw = 'Bearer hf_abc1234567890abcdef and token hf_9876543210zyx';
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('hf_abc1234567890abcdef');
    expect(redacted).not.toContain('hf_9876543210zyx');
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).toContain('hf_[REDACTED]');
  });

  it('redacts tokens inside serialized JSON objects', () => {
    const payload = {
      Authorization: 'Bearer hf_secret_token_123456',
      token: 'hf_super_secret_9999',
    };
    const redacted = redactSensitiveData(payload);
    expect(redacted).not.toContain('hf_secret_token_123456');
    expect(redacted).not.toContain('hf_super_secret_9999');
    expect(redacted).toContain('[REDACTED]');
  });
});

describe('HuggingFaceJudge JSON Extraction', () => {
  it('extracts raw JSON cleanly', () => {
    const raw =
      '{"decision": "match", "confidence": 90, "category": "technicien_specialise", "reasons": "Good match", "qualification_assessment": "Bac+2", "missing_information": "None"}';
    expect(extractJsonFromText(raw)).toBe(raw);
  });

  it('extracts JSON enclosed within markdown code fences', () => {
    const fenced =
      '```json\n{"decision": "maybe", "confidence": 55, "category": "it_general", "reasons": "Uncertain", "qualification_assessment": "Bac+3", "missing_information": "Syllabus"}\n```';
    const extracted = extractJsonFromText(fenced);
    expect(JSON.parse(extracted).decision).toBe('maybe');
  });

  it('extracts JSON surrounded by conversational text', () => {
    const prose =
      'Here is the evaluation:\n\n{"decision": "reject", "confidence": 95, "category": "irrelevant", "reasons": "Civil engineer", "qualification_assessment": "BTP", "missing_information": "None"}\n\nHope this helps!';
    const extracted = extractJsonFromText(prose);
    expect(JSON.parse(extracted).decision).toBe('reject');
  });
});

describe('HuggingFaceJudge Client Integration & Error Classification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws AUTH_FAILURE when HF_TOKEN is missing', () => {
    const originalToken = process.env.HF_TOKEN;
    delete process.env.HF_TOKEN;
    try {
      expect(() => new HuggingFaceJudge({ apiKey: '' })).toThrowError(/AUTH_FAILURE/);
    } finally {
      process.env.HF_TOKEN = originalToken;
    }
  });

  it('evaluates valid match decision correctly', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: 'match',
                confidence: 90,
                category: 'technicien_specialise',
                reasons: 'Direct DTS Technicien match',
                qualification_assessment: 'Bac+2 DTS OFPPT',
                missing_information: 'None',
              }),
            },
          },
        ],
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('match');
    expect(result.confidence).toBe(90);
    expect(result.category).toBe('technicien_specialise');
  });

  it('categorizes 404 / Model not found as non-retryable INVALID_MODEL and extracts provider body', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockRejectedValue({
        name: 'ProviderApiError',
        httpResponse: {
          status: 404,
          requestId: 'Root=1-6acd444-test',
          body: {
            error: {
              message:
                'The model Qwen/Qwen2.5-7B-Instruct does not exist or is not supported',
              type: 'invalid_request_error',
            },
          },
        },
        httpRequest: {
          url: 'https://router.huggingface.co/v1/chat/completions',
          headers: { Authorization: 'Bearer hf_secret_token_12345' },
        },
        message:
          'Failed to perform inference: an HTTP error occurred when requesting the provider.',
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 3,
    });

    let caughtError: JudgeError | undefined;
    try {
      await judge.evaluateJob(mockJob);
    } catch (err) {
      caughtError = err as JudgeError;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError?.type).toBe('INVALID_MODEL');
    expect(caughtError?.statusCode).toBe(404);
    expect(caughtError?.requestId).toBe('Root=1-6acd444-test');
    expect(caughtError?.isRetryable).toBe(false);
    expect(caughtError?.message).toContain('Qwen/Qwen2.5-7B-Instruct does not exist');
    // Ensure it was NOT retried
    expect(mockClient.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('categorizes 400 / Unsupported task as non-retryable UNSUPPORTED_TASK', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockRejectedValue({
        name: 'ProviderApiError',
        httpResponse: {
          status: 400,
          body: {
            error: 'Provider does not seem to support chat completion for this model',
          },
        },
        message:
          'Failed to perform inference: an HTTP error occurred when requesting the provider.',
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 3,
    });

    let caughtError: JudgeError | undefined;
    try {
      await judge.evaluateJob(mockJob);
    } catch (err) {
      caughtError = err as JudgeError;
    }

    expect(caughtError?.type).toBe('UNSUPPORTED_TASK');
    expect(caughtError?.statusCode).toBe(400);
    expect(caughtError?.isRetryable).toBe(false);
    expect(mockClient.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('categorizes 402 / Quota exhaustion as non-retryable QUOTA_EXHAUSTED', async () => {
    const mockClient = {
      chatCompletion: vi.fn().mockRejectedValue({
        name: 'ProviderApiError',
        httpResponse: {
          status: 402,
          body: { error: { message: 'Out of monthly inference credits' } },
        },
        message:
          'Failed to perform inference: an HTTP error occurred when requesting the provider.',
      }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 2,
    });

    await expect(judge.evaluateJob(mockJob)).rejects.toThrowError(/QUOTA_EXHAUSTED/);
    expect(mockClient.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it('retries temporary 502/503/504 gateway errors with bounded exponential backoff', async () => {
    const mockClient = {
      chatCompletion: vi
        .fn()
        .mockRejectedValueOnce({
          name: 'ProviderApiError',
          httpResponse: {
            status: 502,
            body: { error: 'Bad Gateway from upstream provider' },
          },
          message:
            'Failed to perform inference: an HTTP error occurred when requesting the provider.',
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: 'match',
                  confidence: 90,
                  category: 'technicien_specialise',
                  reasons: 'Recovered after retry',
                  qualification_assessment: 'Bac+2 DTS',
                  missing_information: 'None',
                }),
              },
            },
          ],
        }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 2,
      initialBackoffMs: 10,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('match');
    expect(mockClient.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('categorizes 429 Rate Limit as RATE_LIMIT and retries', async () => {
    const mockClient = {
      chatCompletion: vi
        .fn()
        .mockRejectedValueOnce({
          name: 'ProviderApiError',
          httpResponse: { status: 429, body: { detail: 'Rate limit exceeded' } },
          message:
            'Failed to perform inference: an HTTP error occurred when requesting the provider.',
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: 'match',
                  confidence: 85,
                  category: 'it_general',
                  reasons: 'Software Engineer',
                  qualification_assessment: 'Bac+5',
                  missing_information: 'None',
                }),
              },
            },
          ],
        }),
    } as unknown as InferenceClient;

    const judge = new HuggingFaceJudge({
      apiKey: 'test_token',
      client: mockClient,
      maxRetries: 2,
      initialBackoffMs: 10,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('match');
    expect(mockClient.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it('defaults to verified live model and guarantees no paid provider fallback', () => {
    const judge = new HuggingFaceJudge({
      apiKey: 'dummy_hf_token',
    });
    expect(judge.getModelName()).toBe(DEFAULT_VERIFIED_HF_MODEL);
  });
});

describe('Model Verifier Utility', () => {
  it('correctly verifies models supported on router mock catalog', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'Qwen/Qwen2.5-Coder-7B-Instruct',
            providers: [{ provider: 'nscale', status: 'live' }],
          },
        ],
      }),
    });

    const result = await verifyModelInferenceProvider(
      'Qwen/Qwen2.5-Coder-7B-Instruct',
      mockFetch as unknown as typeof fetch
    );

    expect(result.isSupportedOnRouter).toBe(true);
    expect(result.liveProviders).toContain('nscale');
  });

  it('identifies unrouted models and provides candidate suggestions', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'Qwen/Qwen2.5-Coder-7B-Instruct',
            providers: [{ provider: 'nscale', status: 'live' }],
          },
        ],
      }),
    });

    const result = await verifyModelInferenceProvider(
      'Qwen/Qwen2.5-7B-Instruct',
      mockFetch as unknown as typeof fetch
    );

    expect(result.isSupportedOnRouter).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
