import OpenAI from 'openai';

export const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * The real SDK client exposes far more than we use. Narrowed to the one
 * shape chatLoop depends on, so fakes in tests satisfy this directly
 * without needing to match the full SDK response type.
 */
export interface OpenAIResponsesClient {
  responses: {
    create(params: {
      model: string;
      instructions: string;
      input: unknown[];
      tools?: unknown[];
    }): Promise<{ output_text?: string; output?: unknown[] }>;
  };
}

export function createOpenAIClient(): OpenAIResponsesClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  // Optional: some OpenAI-compatible gateways (e.g. OpenRouter) issue keys
  // that only work against their own endpoint. Left unset, the SDK talks to
  // the standard OpenAI API.
  const baseURL = process.env.OPENAI_BASE_URL || undefined;
  return new OpenAI({ apiKey, baseURL, timeout: 20_000, maxRetries: 2 }) as unknown as OpenAIResponsesClient;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

/**
 * The SDK's own error messages sometimes embed a partially-masked fragment
 * of the API key (e.g. "Incorrect API key provided: sk-***...abcd") for
 * support purposes. We never want even that fragment reaching logs.
 */
export function redactSecrets(text: string): string {
  return text.replace(/sk-[A-Za-z0-9*_-]{6,}/gi, '[REDACTED]');
}
