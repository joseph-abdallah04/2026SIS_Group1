// Turns a user's stored credentials into a language model the agent can run.
//
// One integration covers every provider someone might bring (docs/03): OpenAI, Groq,
// OpenRouter, Together, Ollama, LM Studio, vLLM — anything speaking the OpenAI
// `/chat/completions` shape. The AI SDK owns the wire format, SSE framing, tool-call
// reassembly and retries; what stays here is the part that is ours:
//
//   - every request goes out through the SSRF-guarded fetch, never bare `fetch`
//   - provider failures become messages a user can act on, because the most likely cause
//     is something they typed
import { APICallError } from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, type LanguageModel } from 'ai';

import { env } from '../../env.js';
import { ApiError } from '../../middleware/error.js';
import { assertPublicUrl, BlockedHostError, guardedFetch } from './network/guardedFetch.js';

export interface LlmCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** How long a single "Test connection" probe may take. */
const PROBE_TIMEOUT_MS = 15_000;

function hostPolicy(): { allowPrivateHosts: boolean } {
  return { allowPrivateHosts: env.ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS };
}

/**
 * Validates the base URL against the SSRF policy.
 *
 * Called before a turn and before a config is saved, so a bad or disallowed host is a
 * clear 400 rather than a failed socket halfway through a stream.
 */
export async function assertCredentialsAllowed(credentials: LlmCredentials): Promise<void> {
  await assertPublicUrl(credentials.baseUrl, hostPolicy());
}

/** Builds the model the agent talks to. Cheap — safe to call once per turn. */
export function createAssistantModel(credentials: LlmCredentials): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'byo-provider',
    baseURL: credentials.baseUrl,
    apiKey: credentials.apiKey,
    fetch: guardedFetch(hostPolicy()),
    // Without this, providers omit the usage block from streamed responses and every turn
    // records zero tokens.
    includeUsage: true,
  });

  return provider.chatModel(credentials.model);
}

/**
 * Cheapest round trip that proves base URL + key + model work together — backs the
 * "Test connection" button (F33).
 */
export async function probeCredentials(
  credentials: LlmCredentials,
): Promise<{ latencyMs: number; model?: string }> {
  await assertCredentialsAllowed(credentials);

  const startedAt = Date.now();
  const result = await generateText({
    model: createAssistantModel(credentials),
    prompt: 'ping',
    maxOutputTokens: 1,
    maxRetries: 0,
    timeout: PROBE_TIMEOUT_MS,
  });

  const echoed = result.response?.modelId;
  return { latencyMs: Date.now() - startedAt, ...(echoed ? { model: echoed } : {}) };
}

/**
 * Turns whatever the provider or the network threw into an error worth showing.
 *
 * The user chose the base URL, the key and the model, so nearly every failure here is a
 * setup mistake they can fix — but only if the message says which one.
 */
export function describeProviderError(cause: unknown, baseUrl: string): ApiError {
  const blocked = findInCauseChain(cause, (error): error is BlockedHostError =>
    isNamed(error, 'BlockedHostError'),
  );
  if (blocked) {
    return new ApiError(
      400,
      `Refused to connect to ${blocked.host}: ${blocked.message}. The assistant only calls public hosts.`,
      'LLM_URL_PRIVATE_HOST',
    );
  }

  if (APICallError.isInstance(cause)) {
    return fromApiCallError(cause);
  }

  if (isNamed(cause, 'TimeoutError') || /timed? ?out/i.test(messageOf(cause))) {
    return new ApiError(504, 'The model provider timed out.', 'LLM_TIMEOUT');
  }

  if (isNamed(cause, 'AbortError')) {
    return new ApiError(499, 'Request cancelled', 'CLIENT_CLOSED');
  }

  // DNS failure, refused connection, TLS problem — usually a wrong base URL.
  const code = errnoOf(cause);
  if (code) {
    return new ApiError(502, `Could not reach ${hostOf(baseUrl)}: ${code}`, 'LLM_UNREACHABLE');
  }

  return new ApiError(502, `The model provider failed: ${messageOf(cause)}`, 'LLM_FAILED');
}

function fromApiCallError(error: APICallError): ApiError {
  const status = error.statusCode ?? 0;
  const detail = extractProviderMessage(error.responseBody);

  if (status === 401 || status === 403) {
    return new ApiError(
      400,
      `The provider rejected the API key (${status})${detail ? `: ${detail}` : ''}`,
      'LLM_AUTH_FAILED',
    );
  }

  if (status === 404) {
    // A 404 from chat/completions is nearly always a retired or misspelled model rather
    // than a wrong path, so lead with what the provider said.
    return new ApiError(
      400,
      detail
        ? `The provider returned 404: ${detail} (if the model name is right, check the base URL ends at /v1)`
        : 'Model endpoint not found (404) — check the model name, and that the base URL ends at /v1',
      'LLM_MODEL_NOT_FOUND',
    );
  }

  if (status === 429) {
    return new ApiError(
      429,
      `The provider rate-limited the request${detail ? `: ${detail}` : ''}`,
      'LLM_RATE_LIMITED',
    );
  }

  if (status >= 500) {
    return new ApiError(
      502,
      `The provider returned ${status}${detail ? `: ${detail}` : ''}`,
      'LLM_PROVIDER_ERROR',
    );
  }

  return new ApiError(
    502,
    detail || error.message || 'The model provider rejected the request',
    'LLM_HTTP_ERROR',
  );
}

/** Providers wrap their message differently; check the three common shapes. */
function extractProviderMessage(body: string | undefined): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const message =
      typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? parsed.message);
    if (message) return message.slice(0, 300);
  } catch {
    // Non-JSON body — an HTML error page from a proxy, usually.
  }
  return body.slice(0, 300);
}

/**
 * Walks `.cause` links looking for a specific error.
 *
 * `fetch` reports everything underneath it as `TypeError: fetch failed` and hangs the real
 * reason off `cause`, so without this a blocked host reads as a generic network blip.
 */
function findInCauseChain<T>(error: unknown, match: (value: unknown) => value is T): T | null {
  let current = error;
  for (let depth = 0; depth < 8 && current != null; depth += 1) {
    if (match(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message ? cause.message : 'unknown error';
}

function errnoOf(cause: unknown): string | undefined {
  const direct = (cause as NodeJS.ErrnoException | null)?.code;
  if (direct) return direct;
  const nested = (cause as { cause?: NodeJS.ErrnoException })?.cause?.code;
  return nested;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'the model provider';
  }
}
