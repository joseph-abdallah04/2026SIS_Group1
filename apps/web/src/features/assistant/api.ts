// Client for the assistant endpoints.
//
// The chat call cannot use `EventSource`: that is GET-only and cannot send headers, and we
// need to POST the message plus session context. So it is `fetch` + a manual read of the
// SSE frames off the response body — same protocol, more control.
import {
  isAssistantStreamEvent,
  type AssistantContext,
  type AssistantHistoryMessage,
  type AssistantStreamEvent,
  type LlmConfigUpsert,
  type LlmConfigPublic,
  type LlmConfigTestResult,
} from '@roundtable/shared';

import { api, authHeaders } from '../../lib/api';

export function fetchLlmConfig(): Promise<{ config: LlmConfigPublic | null }> {
  return api.get('/api/me/llm-config');
}

export function saveLlmConfig(input: LlmConfigUpsert): Promise<{ config: LlmConfigPublic }> {
  return api.put('/api/me/llm-config', input);
}

export function deleteLlmConfig(): Promise<{ ok: boolean }> {
  return api.del('/api/me/llm-config');
}

/**
 * Passing `input` tests what the user just typed; omitting it tests what is saved. Leave
 * `input.apiKey` off to test a new base URL or model against the key already stored.
 */
export function testLlmConfig(input?: LlmConfigUpsert): Promise<LlmConfigTestResult> {
  return api.post('/api/me/llm-config/test', input ?? {});
}

export interface StreamAssistantChatOptions {
  sessionId: string;
  message: string;
  context: AssistantContext;
  history: AssistantHistoryMessage[];
  signal: AbortSignal;
  onEvent: (event: AssistantStreamEvent) => void;
}

/**
 * Streams one assistant turn, invoking `onEvent` per frame. Resolves when the stream ends.
 *
 * Guarantees the caller sees a terminating frame even when the request fails outright, so
 * the UI never gets stuck in a "thinking" state.
 */
export async function streamAssistantChat(options: StreamAssistantChatOptions): Promise<void> {
  const { sessionId, message, context, history, signal, onEvent } = options;

  let response: Response;
  try {
    response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/assistant/chat`, {
      method: 'POST',
      headers: { ...authHeaders(), Accept: 'text/event-stream' },
      body: JSON.stringify({ message, context, history }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) {
      onEvent({ type: 'done', reason: 'aborted' });
      return;
    }
    onEvent({ type: 'error', message: describe(cause, 'Could not reach the server.') });
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  // Validation and auth failures come back as ordinary JSON, before any stream starts.
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    onEvent({
      type: 'error',
      message: body?.error ?? `Request failed (${response.status})`,
      ...(body?.code ? { code: body.code } : {}),
    });
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  if (!response.body) {
    onEvent({ type: 'error', message: 'The server returned an empty stream.' });
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  try {
    for await (const payload of readSseFrames(response.body)) {
      const parsed = safeParse(payload);
      if (parsed && isAssistantStreamEvent(parsed)) {
        onEvent(parsed);
      }
    }
  } catch (cause) {
    if (signal.aborted) {
      onEvent({ type: 'done', reason: 'aborted' });
      return;
    }
    onEvent({ type: 'error', message: describe(cause, 'The connection dropped mid-answer.') });
    onEvent({ type: 'done', reason: 'error' });
  }
}

/** Yields the payload of each `data:` frame. Frames can straddle chunk boundaries. */
async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
      split = buffer.indexOf('\n\n');
    }
  }
}

function safeParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function describe(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
