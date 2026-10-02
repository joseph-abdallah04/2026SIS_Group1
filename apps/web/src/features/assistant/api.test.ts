// Failures the server never got to describe still get a code.
//
// These are the ones the browser sees on its own: the network, a proxy standing in for a
// server that is not running, and a stream cut off before its closing frame.
import { assistantErrorMessage, type AssistantStreamEvent } from '@roundtable/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamAssistantChat } from './api';

async function run(fetchImpl: () => Promise<Response>): Promise<AssistantStreamEvent[]> {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const events: AssistantStreamEvent[] = [];
  await streamAssistantChat({
    sessionId: 's1',
    message: 'hi',
    context: {},
    history: [],
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
  });
  return events;
}

function sse(frames: object[]): Response {
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamAssistantChat errors', () => {
  it('names an unreachable server, keeping what the browser said', async () => {
    const events = await run(() => Promise.reject(new TypeError('Failed to fetch')));

    expect(events).toEqual([
      {
        type: 'error',
        code: 'NETWORK_ERROR',
        message: assistantErrorMessage('NETWORK_ERROR'),
        detail: 'Failed to fetch',
      },
      { type: 'done', reason: 'error' },
    ]);
  });

  it('passes the server’s own code and details straight through', async () => {
    const events = await run(async () =>
      Response.json(
        {
          error: 'Invalid request: message: Required',
          code: 'VALIDATION_FAILED',
          details: 'message: Required',
        },
        { status: 400 },
      ),
    );

    expect(events[0]).toEqual({
      type: 'error',
      message: 'Invalid request: message: Required',
      code: 'VALIDATION_FAILED',
      detail: 'message: Required',
    });
  });

  it('reads a gateway error from the dev proxy as the server not running', async () => {
    const events = await run(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));

    expect(events[0]).toMatchObject({ code: 'NETWORK_ERROR', detail: 'HTTP 502' });
  });

  it('gives any other non-JSON failure a code and its status', async () => {
    const events = await run(async () => new Response('oops', { status: 500 }));

    expect(events[0]).toMatchObject({ code: 'REQUEST_FAILED', detail: 'HTTP 500' });
  });

  it('flags a stream that stopped before its closing frame', async () => {
    // What a server restart mid-answer looks like from here: some text, then nothing.
    const events = await run(async () =>
      sse([{ type: 'message', role: 'assistant', content: 'Half an ans' }]),
    );

    expect(events.map((event) => event.type)).toEqual(['message', 'error', 'done']);
    expect(events[1]).toMatchObject({ code: 'STREAM_INTERRUPTED' });
  });

  it('adds nothing to a stream that finished properly', async () => {
    const events = await run(async () =>
      sse([
        { type: 'message', role: 'assistant', content: 'Done.' },
        { type: 'done', reason: 'complete' },
      ]),
    );

    expect(events.map((event) => event.type)).toEqual(['message', 'done']);
  });
});
