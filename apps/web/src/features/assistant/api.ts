// Client for the assistant endpoints.
//
// The chat call cannot use `EventSource`: that is GET-only and cannot send headers, and we
// need to POST the message plus session context. So it is `fetch` + a manual read of the
// SSE frames off the response body — same protocol, more control.
import {
  assistantErrorMessage,
  isAssistantStreamEvent,
  type AssistantContext,
  type AssistantErrorCode,
  type AssistantHistoryMessage,
  type AssistantStreamEvent,
  type LlmConfigUpsert,
  type LlmConfigPublic,
  type LlmConfigTestResult,
} from '@roundtable/shared';

import { api } from '../../lib/api';
import { getToken } from '../../lib/auth';

export function fetchLlmConfig(): Promise<{ config: LlmConfigPublic | null }> {
  return api.get('/api/me/llm-config');
}

export function saveLlmConfig(input: LlmConfigUpsert): Promise<{ config: LlmConfigPublic }> {
  return api.put('/api/me/llm-config', input);
}

export function deleteLlmConfig(): Promise<{ ok: boolean }> {
  return api.delete('/api/me/llm-config');
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

  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, context, history }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) {
      onEvent({ type: 'done', reason: 'aborted' });
      return;
    }
    onEvent(clientError('NETWORK_ERROR', describe(cause)));
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  // Validation and auth failures come back as ordinary JSON, before any stream starts.
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
      details?: unknown;
    } | null;
    if (body?.code) {
      onEvent({
        type: 'error',
        message: body.error ?? assistantErrorMessage('REQUEST_FAILED'),
        code: body.code,
        ...(typeof body.details === 'string' ? { detail: body.details } : {}),
      });
    } else {
      // No JSON from our own server: something in between answered. A gateway error from
      // the dev proxy means the API server is not running, which is a reach problem.
      const gateway = response.status === 502 || response.status === 503 || response.status === 504;
      onEvent(clientError(gateway ? 'NETWORK_ERROR' : 'REQUEST_FAILED', `HTTP ${response.status}`));
    }
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  if (!response.body) {
    onEvent(clientError('STREAM_EMPTY'));
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  // Every stream the server writes ends with `done`, errors included. One that stops short
  // was cut off — in development, typically the server restarting on a file save.
  let finished = false;
  try {
    for await (const payload of readSseFrames(response.body)) {
      const parsed = safeParse(payload);
      if (parsed && isAssistantStreamEvent(parsed)) {
        if (parsed.type === 'done') finished = true;
        onEvent(parsed);
        // A tool-running frame often shares a TCP chunk with the artifacts that
        // follow it. Yielding a frame lets the status line paint before those
        // results fold into the same React batch.
        if (parsed.type === 'tool') await yieldForPaint();
      }
    }
  } catch (cause) {
    if (signal.aborted) {
      onEvent({ type: 'done', reason: 'aborted' });
      return;
    }
    onEvent(clientError('STREAM_INTERRUPTED', describe(cause)));
    onEvent({ type: 'done', reason: 'error' });
    return;
  }

  if (!finished && !signal.aborted) {
    onEvent(clientError('STREAM_INTERRUPTED', 'The stream ended without its closing frame.'));
    onEvent({ type: 'done', reason: 'error' });
  }
}

/** An error frame for failures the server never got to describe. */
function clientError(
  code: AssistantErrorCode,
  detail?: string,
): Extract<AssistantStreamEvent, { type: 'error' }> {
  return {
    type: 'error',
    message: assistantErrorMessage(code),
    code,
    ...(detail ? { detail } : {}),
  };
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

function describe(cause: unknown): string | undefined {
  return cause instanceof Error && cause.message ? cause.message : undefined;
}

function yieldForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}
