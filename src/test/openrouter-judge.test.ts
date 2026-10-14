import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OpenRouterJudge,
  extractContentFromOpenRouterChoice,
} from '../matching/openrouter-judge.ts';
import { JudgeError, ScrapedJob } from '../matching/types.ts';
import {
  redactSensitiveData,
  verifyOpenRouterModel,
  DEFAULT_OPENROUTER_MODEL,
} from '../matching/model-verifier.ts';

const mockJob: ScrapedJob = {
  id: 'job-or-101',
  title: 'Technicien Réseaux et Systèmes Informatiques',
  employer: 'Ministère de l’Éducation Nationale',
  location: 'Rabat',
  url: 'https://example.com/job/101',
  description: 'Concours de recrutement pour Technicien 3ème grade spécialité Informatique et Réseaux Bac+2 DTS.',
};

describe('OpenRouter Sensitive Data Redaction', () => {
  it('redacts OpenRouter API keys (sk-or-v1-...) and Bearer tokens', () => {
    const raw = 'Authorization: Bearer sk-or-v1-abcdef0123456789abcdef0123456789 and sk-or-v1-9999888877776666';
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain('abcdef0123456789abcdef0123456789');
    expect(redacted).not.toContain('9999888877776666');
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(redacted).toContain('sk-or-[REDACTED]');
  });

  it('redacts secret keys in structured JSON objects', () => {
    const payload = {
      apiKey: 'sk-or-v1-secret1234567890',
      token: 'hf_sample123456789',
    };
    const redacted = redactSensitiveData(payload);
    expect(redacted).not.toContain('sk-or-v1-secret1234567890');
    expect(redacted).toContain('[REDACTED]');
  });
});

describe('OpenRouterJudge Client & Error Handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws AUTH_FAILURE when OPENROUTER_API_KEY is missing', () => {
    const origKey = process.env.OPENROUTER_API_KEY;
    const origToken = process.env.OPENROUTER_TOKEN;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_TOKEN;
    try {
      expect(() => new OpenRouterJudge({ apiKey: '' })).toThrowError(/AUTH_FAILURE/);
    } finally {
      if (origKey) process.env.OPENROUTER_API_KEY = origKey;
      if (origToken) process.env.OPENROUTER_TOKEN = origToken;
    }
  });

  it('successfully parses valid JSON response from OpenRouter free model', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'gen-1',
          model: 'openrouter/free',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: 'match',
                  confidence: 94,
                  category: 'technicien_specialise',
                  reasons: 'Exact match for DTS Réseaux et Systèmes Informatiques',
                  qualification_assessment: 'Bac+2 DTS OFPPT / ISTA',
                  missing_information: 'None',
                }),
              },
            },
          ],
        }),
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-testkey',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('match');
    expect(result.confidence).toBe(94);
    expect(result.category).toBe('technicien_specialise');
    expect(judge.getModelName()).toBe(DEFAULT_OPENROUTER_MODEL);
  });

  it('strictly limits models fallback array to 3 items or fewer in the request payload', async () => {
    let capturedBody: any;
    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body as string);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: 'match',
                    confidence: 90,
                    category: 'technicien_specialise',
                    reasons: 'IT match',
                    qualification_assessment: 'Bac+2',
                    missing_information: 'None',
                  }),
                },
              },
            ],
          }),
      };
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-testkey',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await judge.evaluateJob(mockJob);
    expect(capturedBody).toBeDefined();
    expect(Array.isArray(capturedBody.models)).toBe(true);
    expect(capturedBody.models.length).toBeLessThanOrEqual(3);
    expect(capturedBody.models[0]).toBe('openrouter/free');
  });

  it('correctly handles response wrapped in markdown code fences', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '```json\n{\n  "decision": "maybe",\n  "confidence": 60,\n  "category": "it_general",\n  "reasons": "Unspecified syllabus",\n  "qualification_assessment": "Bac+3 Licence",\n  "missing_information": "Detailed module transcript"\n}\n```',
              },
            },
          ],
        }),
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-testkey',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('maybe');
    expect(result.confidence).toBe(60);
  });

  it('classifies HTTP 401 as non-retryable AUTH_FAILURE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          error: {
            code: 401,
            message: 'User key not found or invalid token',
          },
        }),
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-bad-key',
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    await expect(judge.evaluateJob(mockJob)).rejects.toThrowError(JudgeError);
    // Should NOT retry on auth failure (1 call only)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('classifies HTTP 402 as non-retryable QUOTA_EXHAUSTED', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () =>
        JSON.stringify({
          error: {
            code: 402,
            message: 'Payment required: insufficient credit balance',
          },
        }),
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-test',
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    try {
      await judge.evaluateJob(mockJob);
      expect.fail('Should have thrown JudgeError');
    } catch (err) {
      expect(err).toBeInstanceOf(JudgeError);
      expect((err as JudgeError).type).toBe('QUOTA_EXHAUSTED');
      expect((err as JudgeError).isRetryable).toBe(false);
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('classifies HTTP 429 as retryable RATE_LIMIT and retries up to maxRetries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({
          error: {
            code: 429,
            message: 'Rate limit exceeded: 20 requests per minute',
          },
        }),
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-test',
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
      initialBackoffMs: 10,
    });

    try {
      await judge.evaluateJob(mockJob);
      expect.fail('Should have thrown JudgeError');
    } catch (err) {
      expect(err).toBeInstanceOf(JudgeError);
      expect((err as JudgeError).type).toBe('RATE_LIMIT');
      expect((err as JudgeError).isRetryable).toBe(true);
    }

    // 1 initial attempt + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('classifies HTTP 503 as retryable PROVIDER_UNAVAILABLE and succeeds if subsequent attempt works', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 503,
          text: async () =>
            JSON.stringify({
              error: { message: 'Provider temporarily unavailable or busy' },
            }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: 'match',
                    confidence: 90,
                    category: 'both',
                    reasons: 'Recovered after retry',
                    qualification_assessment: 'Bac+2',
                    missing_information: 'None',
                  }),
                },
              },
            ],
          }),
      };
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-test',
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
      initialBackoffMs: 10,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('match');
    expect(callCount).toBe(2);
  });

  it('classifies HTTP 404 as non-retryable INVALID_MODEL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({
          error: {
            code: 404,
            message: 'Model nonexistent/model-xyz does not exist',
          },
        }),
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-test',
      model: 'nonexistent/model-xyz',
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
    });

    try {
      await judge.evaluateJob(mockJob);
      expect.fail('Should have thrown JudgeError');
    } catch (err) {
      expect(err).toBeInstanceOf(JudgeError);
      expect((err as JudgeError).type).toBe('INVALID_MODEL');
      expect((err as JudgeError).isRetryable).toBe(false);
    }

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe('extractContentFromOpenRouterChoice', () => {
    it('extracts direct string from message.content', () => {
      const choice = { message: { content: '{"decision": "match"}' } };
      expect(extractContentFromOpenRouterChoice(choice)).toBe('{"decision": "match"}');
    });

    it('extracts text from array of content chunks', () => {
      const choice = {
        message: {
          content: [
            { type: 'text', text: '{"decision":' },
            { type: 'text', text: ' "match"}' },
          ],
        },
      };
      expect(extractContentFromOpenRouterChoice(choice)).toBe('{"decision": "match"}');
    });

    it('extracts reasoning field when content is empty or null', () => {
      const choice = {
        message: {
          content: '',
          reasoning: '```json\n{"decision": "match", "confidence": 95, "category": "both", "reasons": "IT job", "qualification_assessment": "Bac+2", "missing_information": "None"}\n```',
        },
      };
      expect(extractContentFromOpenRouterChoice(choice)).toContain('{"decision": "match"');
    });

    it('extracts thinking field when content is empty', () => {
      const choice = {
        message: {
          content: null,
          thinking: '{"decision": "maybe", "confidence": 50, "category": "it_general", "reasons": "Partial match", "qualification_assessment": "None", "missing_information": "None"}',
        },
      };
      expect(extractContentFromOpenRouterChoice(choice)).toContain('{"decision": "maybe"');
    });

    it('extracts choice.text fallback format', () => {
      const choice = {
        text: '{"decision": "reject"}',
      };
      expect(extractContentFromOpenRouterChoice(choice)).toBe('{"decision": "reject"}');
    });
  });

  it('retries on empty response content with retryable=true and succeeds on subsequent attempt', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body);

      if (callCount === 1) {
        // First attempt returns empty content (e.g. reasoning exhausted 500 tokens or upstream glitch)
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: '',
                  },
                  finish_reason: 'length',
                },
              ],
            }),
        };
      }

      // Second attempt succeeds (with fallback model or rotated attempt)
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: 'match',
                    confidence: 90,
                    category: 'technicien_specialise',
                    reasons: 'Evaluated successfully after rotation',
                    qualification_assessment: 'Bac+2 DTS',
                    missing_information: 'None',
                  }),
                },
                finish_reason: 'stop',
              },
            ],
          }),
      };
    });

    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-test',
      model: 'openrouter/free',
      fetchFn: mockFetch as unknown as typeof fetch,
      maxRetries: 2,
      initialBackoffMs: 10,
    });

    const result = await judge.evaluateJob(mockJob);
    expect(result.decision).toBe('match');
    expect(result.confidence).toBe(90);
    expect(callCount).toBe(2);
  });

  it('parses JSON cleanly even if enclosed with <think>...</think> reasoning blocks', () => {
    const judge = new OpenRouterJudge({
      apiKey: 'sk-or-v1-test',
    });

    const rawResponse = `<think>
The job is Technicien Réseaux et Systèmes Informatiques.
This is clearly Category A (Technicien Spécialisé DTS Bac+2).
Decision should be match.
</think>
\`\`\`json
{
  "decision": "match",
  "confidence": 95,
  "category": "technicien_specialise",
  "reasons": "Direct match for DTS networking technician in public sector",
  "qualification_assessment": "Bac+2 DTS / ISTA",
  "missing_information": "None"
}
\`\`\``;

    const evaluation = judge.parseAndValidate(rawResponse);
    expect(evaluation.decision).toBe('match');
    expect(evaluation.confidence).toBe(95);
    expect(evaluation.category).toBe('technicien_specialise');
  });
});

describe('OpenRouter Model Verifier', () => {
  it('correctly identifies a live free model with $0 pricing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'openrouter/free',
            name: 'Free Models Router',
            context_length: 200000,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'google/gemma-4-31b-it:free',
            name: 'Google: Gemma 4 31B (free)',
            context_length: 262144,
            pricing: { prompt: '0', completion: '0' },
          },
        ],
      }),
    });

    const result = await verifyOpenRouterModel(
      'openrouter/free',
      mockFetch as unknown as typeof fetch
    );
    expect(result.isAvailable).toBe(true);
    expect(result.isFree).toBe(true);
    expect(result.contextLength).toBe(200000);
  });

  it('flags nonexistent model and provides free model suggestions', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openrouter/free', pricing: { prompt: '0', completion: '0' } },
          { id: 'google/gemma-4-31b-it:free', pricing: { prompt: '0', completion: '0' } },
        ],
      }),
    });

    const result = await verifyOpenRouterModel(
      'invalid-model-name',
      mockFetch as unknown as typeof fetch
    );
    expect(result.isAvailable).toBe(false);
    expect(result.suggestions).toContain('openrouter/free');
  });
});
