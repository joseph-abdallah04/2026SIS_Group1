// What people see when their provider says no.
//
// Each case is a provider's own wording, because the status code alone cannot tell the
// failures apart — an empty OpenAI account and a busy Groq free tier are both 429s — and
// because what the provider said must survive as the detail, not be the headline.
import { APICallError } from '@ai-sdk/provider';
import { ASSISTANT_ERRORS, assistantErrorMessage } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { describeProviderError } from './provider.js';

const BASE_URL = 'https://api.groq.com/openai/v1';

function providerSaid(status: number, message: string): APICallError {
  return new APICallError({
    message,
    url: `${BASE_URL}/chat/completions`,
    requestBodyValues: {},
    statusCode: status,
    responseBody: JSON.stringify({ error: { message, type: 'invalid_request_error' } }),
  });
}

function describeIt(status: number, message: string) {
  const error = describeProviderError(providerSaid(status, message), BASE_URL);
  return { code: error.code, message: error.message, detail: error.details };
}

describe('describeProviderError', () => {
  it('names a refused request as ours to fix, with the provider’s words as the detail', () => {
    // The exact text that used to be the whole error bubble.
    const said =
      "'messages.2' : for 'role:assistant' the following must be satisfied[('messages.2' : property 'reasoning_content' is unsupported)]";

    const { code, message, detail } = describeIt(400, said);

    expect(code).toBe('LLM_REQUEST_REJECTED');
    expect(message).toBe(assistantErrorMessage('LLM_REQUEST_REJECTED'));
    expect(message).not.toContain('messages.2');
    expect(detail).toBe(`HTTP 400 — ${said}`);
  });

  it.each([
    [401, 'Invalid API Key', 'LLM_AUTH_FAILED'],
    [403, 'Forbidden', 'LLM_AUTH_FAILED'],
    [404, 'The model `llama-3.3-70b-versatile` does not exist', 'LLM_MODEL_NOT_FOUND'],
    [
      402,
      'Insufficient credits. Add more using https://openrouter.ai/settings/credits',
      'LLM_QUOTA_EXCEEDED',
    ],
    [
      429,
      'You exceeded your current quota, please check your plan and billing details.',
      'LLM_QUOTA_EXCEEDED',
    ],
    [
      429,
      'Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7900. Please try again in 1.2s. Need more tokens? Upgrade at https://console.groq.com/settings/billing',
      'LLM_RATE_LIMITED',
    ],
    [
      413,
      'Request too large for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Requested 9512, please reduce your message size and try again.',
      'LLM_CONTEXT_TOO_LONG',
    ],
    [
      400,
      "This model's maximum context length is 8192 tokens. However, your messages resulted in 9012 tokens.",
      'LLM_CONTEXT_TOO_LONG',
    ],
    [400, 'registry.ollama.ai/library/gemma2:2b does not support tools', 'LLM_TOOLS_UNSUPPORTED'],
    // OpenRouter's answer for a model without tool support is a 404 — not a missing model.
    [404, 'No endpoints found that support tool use.', 'LLM_TOOLS_UNSUPPORTED'],
    [
      400,
      '"auto" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set',
      'LLM_TOOLS_UNSUPPORTED',
    ],
    [422, 'Unprocessable entity', 'LLM_REQUEST_REJECTED'],
    [500, 'Internal Server Error', 'LLM_PROVIDER_ERROR'],
    [503, 'Service Unavailable', 'LLM_PROVIDER_ERROR'],
    [409, 'Conflict', 'LLM_HTTP_ERROR'],
  ])('HTTP %i "%s" → %s', (status, said, expected) => {
    const { code, message, detail } = describeIt(status, said);

    expect(code).toBe(expected);
    expect(message).toBe(assistantErrorMessage(expected as keyof typeof ASSISTANT_ERRORS));
    expect(detail).toContain(said);
  });

  it('keeps the host and error code when the provider cannot be reached', () => {
    const cause = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.groq.cmo'), { code: 'ENOTFOUND' }),
    });

    const error = describeProviderError(cause, 'https://api.groq.cmo/openai/v1');

    expect(error.code).toBe('LLM_UNREACHABLE');
    expect(error.details).toBe('api.groq.cmo: ENOTFOUND');
  });

  it('calls a timeout a timeout', () => {
    const cause = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });

    expect(describeProviderError(cause, BASE_URL).code).toBe('LLM_TIMEOUT');
  });

  it('never hands back a code the rail has no words for', () => {
    // Every code this can produce has a title and a hint (CLIENT_CLOSED is never shown:
    // the person who closed the rail is not there to read it).
    const produced = [
      describeProviderError(providerSaid(400, 'x'), BASE_URL).code,
      describeProviderError(providerSaid(401, 'x'), BASE_URL).code,
      describeProviderError(providerSaid(502, 'x'), BASE_URL).code,
      describeProviderError(new Error('boom'), BASE_URL).code,
    ];
    for (const code of produced) expect(ASSISTANT_ERRORS).toHaveProperty(code!);
  });
});
