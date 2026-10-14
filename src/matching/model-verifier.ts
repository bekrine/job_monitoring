export const VERIFIED_OPENROUTER_FREE_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'cohere/north-mini-code:free',
  'liquid/lfm-2.5-2.6b:free',
] as const;

export const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';

export const VERIFIED_ROUTER_MODELS = [
  'Qwen/Qwen2.5-Coder-7B-Instruct',
  'Qwen/Qwen2.5-Coder-3B-Instruct',
  'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
  'google/gemma-3-4b-it',
  'meta-llama/Llama-3.1-8B-Instruct',
] as const;

export const DEFAULT_VERIFIED_HF_MODEL = 'Qwen/Qwen2.5-Coder-7B-Instruct';

export interface ModelVerificationResult {
  model: string;
  isSupportedOnRouter: boolean;
  liveProviders: string[];
  pricing?: { input: number; output: number };
  suggestions: string[];
  error?: string;
}

export interface OpenRouterModelVerificationResult {
  model: string;
  isAvailable: boolean;
  isFree: boolean;
  contextLength?: number;
  pricing?: { prompt: string; completion: string };
  suggestions: string[];
  error?: string;
}

/**
 * Redacts tokens, Authorization headers, and sensitive keys from any string or serialized object.
 */
export function redactSensitiveData(input: unknown): string {
  if (input === null || input === undefined) return '';

  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }

  // Redact Authorization headers or Bearer tokens
  text = text.replace(/(Bearer\s+)[^\s"';,}]+/gi, '$1[REDACTED]');

  // Redact OpenRouter API keys (sk-or-v1-...)
  text = text.replace(/sk-or-v1-[a-zA-Z0-9_-]{8,}/g, 'sk-or-[REDACTED]');

  // Redact Hugging Face tokens (hf_...)
  text = text.replace(/hf_[a-zA-Z0-9_]{4,}/g, 'hf_[REDACTED]');

  // Redact Telegram bot tokens (digits:letters)
  text = text.replace(/\b\d{8,10}:[a-zA-Z0-9_-]{30,}\b/g, '[REDACTED_TELEGRAM_TOKEN]');

  // Redact common secret patterns in JSON
  text = text.replace(
    /("(?:token|apiKey|api_key|password|secret|authorization)"\s*:\s*")([^"]+)(")/gi,
    '$1[REDACTED]$3'
  );

  return text;
}

/**
 * Checks if a model is currently available and free on OpenRouter.
 */
export async function verifyOpenRouterModel(
  model: string,
  fetchFn: typeof fetch = fetch
): Promise<OpenRouterModelVerificationResult> {
  const result: OpenRouterModelVerificationResult = {
    model,
    isAvailable: false,
    isFree: false,
    suggestions: [...VERIFIED_OPENROUTER_FREE_MODELS],
  };

  try {
    const res = await fetchFn('https://openrouter.ai/api/v1/models', {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      result.error = `Failed to query OpenRouter models catalog: HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };

    if (!data.data || !Array.isArray(data.data)) {
      result.error = 'OpenRouter returned malformed model catalog.';
      return result;
    }

    const matched = data.data.find((m) => m.id.toLowerCase() === model.toLowerCase());
    if (matched) {
      result.isAvailable = true;
      result.contextLength = matched.context_length;
      result.pricing = {
        prompt: matched.pricing?.prompt ?? '0',
        completion: matched.pricing?.completion ?? '0',
      };
      // Check if price is 0 or model ends with :free or is openrouter/free
      const isZeroPrice =
        parseFloat(matched.pricing?.prompt || '0') === 0 &&
        parseFloat(matched.pricing?.completion || '0') === 0;
      result.isFree = isZeroPrice || matched.id.endsWith(':free') || matched.id === 'openrouter/free';
    } else {
      // Find candidate free models
      const freeList = data.data
        .filter((m) => m.id.endsWith(':free') || m.id === 'openrouter/free')
        .map((m) => m.id)
        .slice(0, 6);

      if (freeList.length > 0) {
        result.suggestions = freeList;
      }
    }

    return result;
  } catch (err) {
    result.error = `Network error during OpenRouter model verification: ${(err as Error).message}`;
    return result;
  }
}

/**
 * Checks if a model is currently served by the Hugging Face Inference Providers router.
 */
export async function verifyModelInferenceProvider(
  model: string,
  fetchFn: typeof fetch = fetch
): Promise<ModelVerificationResult> {
  const result: ModelVerificationResult = {
    model,
    isSupportedOnRouter: false,
    liveProviders: [],
    suggestions: [...VERIFIED_ROUTER_MODELS],
  };

  try {
    const res = await fetchFn('https://router.huggingface.co/v1/models', {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      result.error = `Failed to query router models catalog: HTTP ${res.status}`;
      return result;
    }

    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        providers?: Array<{
          provider: string;
          status: string;
          pricing?: { input: number; output: number };
        }>;
      }>;
    };

    if (!data.data || !Array.isArray(data.data)) {
      result.error = 'Router returned malformed model catalog.';
      return result;
    }

    const matched = data.data.find((m) => m.id === model);
    if (matched) {
      const live = (matched.providers || []).filter((p) => p.status === 'live');
      result.isSupportedOnRouter = true;
      result.liveProviders = live.map((p) => p.provider);
      result.pricing = live[0]?.pricing;
    } else {
      // Find closest suggestions on router
      const candidates = data.data
        .filter(
          (m) =>
            m.id.toLowerCase().includes('qwen') ||
            m.id.toLowerCase().includes('coder') ||
            m.id.toLowerCase().includes('instruct')
        )
        .map((m) => m.id)
        .slice(0, 5);

      if (candidates.length > 0) {
        result.suggestions = candidates;
      }
    }

    return result;
  } catch (err) {
    result.error = `Network error during model verification: ${(err as Error).message}`;
    return result;
  }
}
