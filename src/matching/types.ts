import { z } from 'zod';

export type JobDecision = 'match' | 'maybe' | 'reject';

export type JobCategory =
  | 'technicien_specialise'
  | 'it_general'
  | 'both'
  | 'irrelevant';

export const JudgeEvaluationSchema = z.object({
  decision: z.enum(['match', 'maybe', 'reject']),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100),
  category: z.enum([
    'technicien_specialise',
    'it_general',
    'both',
    'irrelevant',
  ]),
  reasons: z.union([z.string(), z.array(z.string())]).transform((val) =>
    Array.isArray(val) ? val.join('; ') : val
  ),
  qualification_assessment: z.string().default('Not specified'),
  missing_information: z.string().default('None'),
});

export type JudgeEvaluation = z.infer<typeof JudgeEvaluationSchema>;

export interface AiJudge {
  evaluateJob(job: ScrapedJob): Promise<JudgeEvaluation>;
  categorizeError(err: unknown): JudgeError;
  getModelName(): string;
}

export interface ScrapedJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  url: string;
  deadline?: string;
  specialite?: string;
  description: string;
  publishedDate?: string;
  rawText?: string;
}

export type JudgeErrorType =
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'AUTH_FAILURE'
  | 'INVALID_MODEL'
  | 'UNSUPPORTED_TASK'
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface JudgeErrorContext {
  statusCode?: number;
  requestId?: string;
  model?: string;
  providerResponse?: unknown;
  requestUrl?: string;
  isRetryable?: boolean;
}

export class JudgeError extends Error {
  public readonly statusCode?: number;
  public readonly requestId?: string;
  public readonly model?: string;
  public readonly providerResponse?: unknown;
  public readonly requestUrl?: string;
  public readonly isRetryable: boolean;

  constructor(
    public readonly type: JudgeErrorType,
    message: string,
    context?: number | JudgeErrorContext,
    isRetryableFallback: boolean = false
  ) {
    super(`[${type}] ${message}`);
    this.name = 'JudgeError';

    if (typeof context === 'number') {
      this.statusCode = context;
      this.isRetryable = isRetryableFallback;
    } else if (context && typeof context === 'object') {
      this.statusCode = context.statusCode;
      this.requestId = context.requestId;
      this.model = context.model;
      this.providerResponse = context.providerResponse;
      this.requestUrl = context.requestUrl;
      this.isRetryable = context.isRetryable ?? isRetryableFallback;
    } else {
      this.isRetryable = isRetryableFallback;
    }
  }

  public getDiagnosticString(): string {
    const parts: string[] = [
      `Type: ${this.type}`,
      `Message: ${this.message}`,
    ];
    if (this.statusCode !== undefined) parts.push(`HTTP Status: ${this.statusCode}`);
    if (this.model) parts.push(`Model: ${this.model}`);
    if (this.requestId) parts.push(`Request ID: ${this.requestId}`);
    if (this.requestUrl) parts.push(`URL: ${this.requestUrl}`);
    if (this.providerResponse !== undefined) {
      try {
        parts.push(`Provider Response: ${JSON.stringify(this.providerResponse)}`);
      } catch {
        parts.push(`Provider Response: [Unserializable]`);
      }
    }
    parts.push(`Retryable: ${this.isRetryable ? 'Yes' : 'No'}`);
    return parts.join(' | ');
  }
}
