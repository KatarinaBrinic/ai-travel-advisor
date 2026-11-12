import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/llm/openaiClient.ts';

describe('redactSecrets', () => {
  it('redacts an OpenAI-style key fragment embedded in an error message', () => {
    const message =
      'Incorrect API key provided: sk-or-v1*************************************************************fe2f. ' +
      'You can find your API key at https://platform.openai.com/account/api-keys.';
    expect(redactSecrets(message)).not.toContain('fe2f');
    expect(redactSecrets(message)).toContain('[REDACTED]');
  });

  it('leaves messages with no key-like content unchanged', () => {
    const message = 'Request timed out after 20000ms';
    expect(redactSecrets(message)).toBe(message);
  });
});
