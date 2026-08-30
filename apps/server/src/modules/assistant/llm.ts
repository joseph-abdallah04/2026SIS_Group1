// OpenAI-compatible chat client.
//
// One integration covers every provider a user might bring (docs/03): OpenAI, Groq,
// OpenRouter, Together, Ollama, LM Studio, vLLM — anything that speaks
// `POST {baseUrl}/chat/completions` with the OpenAI request/response shape.
//
// Nothing here touches the database or Express: it takes credentials, returns a stream.
import { ApiError } from '../../middleware/error.js';

export interface LlmCredentials {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Raw JSON string exactly as the model produced it — parsed by the caller. */
  arguments: string;
}

export interface LlmToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmApiToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name: string };

interface LlmApiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type LlmStreamChunk =
  | { type: 'content'; text: string }
  | { type: 'finish'; toolCalls: LlmToolCall[]; finishReason: string | null };

export interface StreamChatOptions {
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

/** How long we wait for the provider before giving up on a single call. */
const REQUEST_TIMEOUT_MS = 90_000;
const PROBE_TIMEOUT_MS = 15_000;

/**
 * Streams one assistant turn.
 *
 * Yields `content` chunks as they arrive (this is what makes the panel type out the reply
 * live), then exactly one `finish` carrying any tool calls the model asked for.
 */
export async function* streamChatCompletion(
  credentials: LlmCredentials,
  options: StreamChatOptions,
): AsyncGenerator<LlmStreamChunk> {
  const response = await postChatCompletions(
    credentials,
    {
      model: credentials.model,
      messages: options.messages,
      stream: true,
      ...(options.tools?.length ? { tools: options.tools, tool_choice: 'auto' } : {}),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    },
    options.signal,
    REQUEST_TIMEOUT_MS,
  );

  if (!response.body) {
    throw new ApiError(502, 'LLM provider returned an empty response body', 'LLM_EMPTY_BODY');
  }

  const toolCalls = new ToolCallAccumulator();
  let finishReason: string | null = null;

  for await (const payload of readSseData(response.body)) {
    if (payload === '[DONE]') break;

    let frame: ChatCompletionChunk;
    try {
      frame = JSON.parse(payload) as ChatCompletionChunk;
    } catch {
      // A provider that emits a malformed frame shouldn't kill the whole turn.
      continue;
    }

    // Some providers report mid-stream errors as a normal data frame.
    if (frame.error?.message) {
      throw new ApiError(502, `LLM provider error: ${frame.error.message}`, 'LLM_STREAM_ERROR');
    }

    const choice = frame.choices?.[0];
    if (!choice) continue;

    const text = choice.delta?.content;
    if (typeof text === 'string' && text.length > 0) {
      yield { type: 'content', text };
    }

    for (const partial of choice.delta?.tool_calls ?? []) {
      toolCalls.absorb(partial);
    }

    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }
  }

  yield { type: 'finish', toolCalls: toolCalls.toArray(), finishReason };
}

/**
 * Cheapest possible round trip that proves base URL + key + model all work together —
 * backs the "Test connection" button (F33).
 */
export async function probeChatCompletion(
  credentials: LlmCredentials,
  signal?: AbortSignal,
): Promise<{ latencyMs: number; model?: string }> {
  const startedAt = Date.now();
  const response = await postChatCompletions(
    credentials,
    {
      model: credentials.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    },
    signal,
    PROBE_TIMEOUT_MS,
  );

  const body = (await response.json().catch(() => null)) as { model?: string } | null;
  return { latencyMs: Date.now() - startedAt, ...(body?.model ? { model: body.model } : {}) };
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

async function postChatCompletions(
  credentials: LlmCredentials,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const url = joinUrl(credentials.baseUrl, 'chat/completions');
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (cause) {
    if (signal?.aborted) {
      throw new ApiError(499, 'Request cancelled', 'CLIENT_CLOSED');
    }
    if (timeout.aborted) {
      throw new ApiError(504, 'LLM provider timed out', 'LLM_TIMEOUT');
    }
    // DNS failure, refused connection, TLS problem — the user's base URL is usually wrong.
    throw new ApiError(
      502,
      `Could not reach ${safeHost(credentials.baseUrl)}: ${describeCause(cause)}`,
      'LLM_UNREACHABLE',
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status === 401 || response.status === 403 ? 400 : 502,
      await describeHttpError(response),
      'LLM_HTTP_ERROR',
    );
  }

  return response;
}

async function describeHttpError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => '');
  let detail = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const message =
      typeof parsed.error === 'string' ? parsed.error : (parsed.error?.message ?? parsed.message);
    if (message) detail = message;
  } catch {
    // Non-JSON error body (HTML error pages from proxies) — the raw slice is fine.
  }

  if (response.status === 401 || response.status === 403) {
    return `LLM provider rejected the API key (${response.status})${detail ? `: ${detail}` : ''}`;
  }
  if (response.status === 404) {
    // A 404 from chat/completions is usually a retired or misspelled model, not a bad URL —
    // lead with what the provider actually said rather than guessing at the cause.
    return detail
      ? `LLM provider returned 404: ${detail} (if the model name is right, check the base URL ends at /v1)`
      : 'LLM endpoint not found (404) — check the model name, and that the base URL ends at /v1';
  }
  if (response.status === 429) {
    return `LLM provider rate-limited the request (429)${detail ? `: ${detail}` : ''}`;
  }
  return `LLM provider returned ${response.status}${detail ? `: ${detail}` : ''}`;
}

/** Joins a base URL and path without doubling or dropping the separating slash. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'the LLM provider';
  }
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code ? `${code}` : cause.message;
  }
  return 'unknown error';
}

// ---------------------------------------------------------------------------
// SSE parsing (provider → us)
// ---------------------------------------------------------------------------

/**
 * Yields the payload of each `data:` frame from an SSE body.
 *
 * Chunk boundaries land anywhere, so frames are assembled from a buffer rather than
 * assumed to arrive whole.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; \r\n tolerated for stricter proxies.
      let boundary = findFrameBoundary(buffer);
      while (boundary !== null) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const payload = extractData(frame);
        if (payload !== null) yield payload;
        boundary = findFrameBoundary(buffer);
      }
    }

    const tail = extractData(buffer);
    if (tail !== null) yield tail;
  } finally {
    reader.releaseLock?.();
  }
}

function findFrameBoundary(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

function extractData(frame: string): string | null {
  const lines = frame.split(/\r?\n/);
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) return null;
  return dataLines.join('\n');
}

// ---------------------------------------------------------------------------
// Tool-call assembly
// ---------------------------------------------------------------------------

interface PartialToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface ChatCompletionChunk {
  error?: { message?: string };
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: PartialToolCall[] };
    finish_reason?: string | null;
  }>;
}

/**
 * Tool calls stream in fragments: the name arrives in one delta, the JSON arguments in
 * however many follow, keyed by `index`. This stitches them back into whole calls.
 */
class ToolCallAccumulator {
  private readonly calls = new Map<number, { id: string; name: string; args: string }>();

  absorb(partial: PartialToolCall): void {
    const index = partial.index ?? 0;
    const existing = this.calls.get(index) ?? { id: '', name: '', args: '' };
    this.calls.set(index, {
      id: partial.id ?? existing.id,
      name: partial.function?.name ?? existing.name,
      args: existing.args + (partial.function?.arguments ?? ''),
    });
  }

  toArray(): LlmToolCall[] {
    return [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name.length > 0)
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: call.args,
      }));
  }
}
