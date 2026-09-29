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
import { assistantErrorMessage, type AssistantErrorCode } from '@roundtable/shared';
import { generateText, type LanguageModel } from 'ai';

import { env } from '../../env.js';
import { ApiError } from '../../middleware/error.js';
import { assertPublicUrl, BlockedHostError, guardedFetch } from './network/guardedFetch.js';
import { withReasoningReplayFallback } from './network/reasoningReplay.js';

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

export interface CreateAssistantModelOptions {
  /**
   * Test seam: the transport underneath everything this module layers on top. Defaults to
   * the SSRF-guarded fetch, which is what every real call uses.
   */
  baseFetch?: typeof fetch;
}

/** Builds the model the agent talks to. Cheap — safe to call once per turn. */
export function createAssistantModel(
  credentials: LlmCredentials,
  options: CreateAssistantModelOptions = {},
): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'byo-provider',
    baseURL: credentials.baseUrl,
    apiKey: credentials.apiKey,
    // Outermost: resend without replayed reasoning to providers that refuse it (Groq).
    // Innermost: every request, including that resend, goes through the SSRF guard.
    fetch: withReasoningReplayFallback(options.baseFetch ?? guardedFetch(hostPolicy())),
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
 * setup mistake they can fix — but only if the error says which one. So each one gets a
 * code from `ASSISTANT_ERRORS`, whose title and hint become the message, and what the
 * provider actually said rides along as `details`. It used to be the other way round: the
 * provider's raw text *was* the message, which put things like
 * "'messages.2' : for 'role:assistant' the following must be satisfied" in front of people.
 */
export function describeProviderError(cause: unknown, baseUrl: string): ApiError {
  const blocked = findInCauseChain(cause, (error): error is BlockedHostError =>
    isNamed(error, 'BlockedHostError'),
  );
  if (blocked) {
    return providerError(400, 'LLM_URL_PRIVATE_HOST', `${blocked.host}: ${blocked.message}`);
  }

  if (APICallError.isInstance(cause)) {
    return fromApiCallError(cause);
  }

  if (isNamed(cause, 'TimeoutError') || /timed? ?out/i.test(messageOf(cause))) {
    return providerError(504, 'LLM_TIMEOUT', messageOf(cause));
  }

  if (isNamed(cause, 'AbortError')) {
    return new ApiError(499, 'Request cancelled', 'CLIENT_CLOSED');
  }

  // DNS failure, refused connection, TLS problem — usually a wrong base URL.
  const code = errnoOf(cause);
  if (code) {
    return providerError(502, 'LLM_UNREACHABLE', `${hostOf(baseUrl)}: ${code}`);
  }

  return providerError(502, 'LLM_FAILED', messageOf(cause));
}

// What providers say when the account, the conversation, or the model is the problem. Each
// is matched against the provider's own message, because the status alone cannot tell them
// apart: OpenAI reports an empty account as a 429, the same status as a rate limit.
const QUOTA_EXCEEDED =
  /insufficient[_ ]quota|exceeded your current quota|insufficient (?:credits?|balance|funds)|credit balance is too low|out of credits?/i;
const CONTEXT_TOO_LONG =
  /context[_ ]length|context window|maximum context|too many tokens|prompt is too long|reduce the length|request too large/i;
const TOOLS_UNSUPPORTED =
  /does not support (?:tools|tool[ _-]?(?:use|calling|calls)|function[ _-]?calling)|tools? (?:are|is) not supported|no endpoints found that support tool use|tool[ _-]?choice requires/i;

function fromApiCallError(error: APICallError): ApiError {
  const status = error.statusCode ?? 0;
  const said = extractProviderMessage(error.responseBody) || error.message;
  const detail = `HTTP ${status || '?'}${said ? ` — ${said}` : ''}`;

  const clientError = status >= 400 && status < 500;

  if (status === 401 || status === 403) return providerError(400, 'LLM_AUTH_FAILED', detail);
  // Ahead of 429: an empty account and a busy one need different fixes.
  if (status === 402 || (clientError && QUOTA_EXCEEDED.test(said))) {
    return providerError(402, 'LLM_QUOTA_EXCEEDED', detail);
  }
  // Ahead of 404: OpenRouter answers a model without tool support with one.
  if (clientError && TOOLS_UNSUPPORTED.test(said)) {
    return providerError(400, 'LLM_TOOLS_UNSUPPORTED', detail);
  }
  // Otherwise a 404 from chat/completions is nearly always a retired or misspelled model.
  if (status === 404) return providerError(400, 'LLM_MODEL_NOT_FOUND', detail);
  if (status === 429) return providerError(429, 'LLM_RATE_LIMITED', detail);
  if (status === 413 || (clientError && CONTEXT_TOO_LONG.test(said))) {
    return providerError(400, 'LLM_CONTEXT_TOO_LONG', detail);
  }
  if (status === 400 || status === 422) return providerError(400, 'LLM_REQUEST_REJECTED', detail);
  if (status >= 500) return providerError(502, 'LLM_PROVIDER_ERROR', detail);
  return providerError(502, 'LLM_HTTP_ERROR', detail);
}

function providerError(status: number, code: AssistantErrorCode, detail?: string): ApiError {
  return new ApiError(status, assistantErrorMessage(code), code, detail || undefined);
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
    if (message) return message.slice(0, 500);
  } catch {
    // Non-JSON body — an HTML error page from a proxy, usually.
  }
  return body.slice(0, 500);
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
