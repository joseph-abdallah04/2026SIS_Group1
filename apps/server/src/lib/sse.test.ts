import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { SseWriter } from './sse.js';

/** Minimal stand-in for the bits of `res` SseWriter touches. */
function fakeResponse() {
  const written: string[] = [];
  const headers: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};

  const res = {
    writableEnded: false,
    status: vi.fn(),
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    flushHeaders: vi.fn(),
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    end: () => {
      res.writableEnded = true;
    },
    on: (event: string, handler: () => void) => {
      (listeners[event] ??= []).push(handler);
      return res;
    },
  };

  return {
    res: res as unknown as Response,
    written,
    headers,
    emit: (event: string) => listeners[event]?.forEach((handler) => handler()),
  };
}

describe('SseWriter', () => {
  it('sets the headers an SSE client needs', () => {
    const { res, headers } = fakeResponse();
    new SseWriter(res, { heartbeatMs: 0 });
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(headers['Cache-Control']).toContain('no-cache');
    expect(headers['X-Accel-Buffering']).toBe('no');
  });

  it('writes one data frame per event', () => {
    const { res, written } = fakeResponse();
    const stream = new SseWriter<{ type: string }>(res, { heartbeatMs: 0 });
    stream.send({ type: 'message' });
    stream.send({ type: 'done' });
    expect(written).toEqual(['data: {"type":"message"}\n\n', 'data: {"type":"done"}\n\n']);
  });

  it('keeps multi-line content inside a single frame', () => {
    const { res, written } = fakeResponse();
    const stream = new SseWriter<{ text: string }>(res, { heartbeatMs: 0 });
    stream.send({ text: 'line one\nline two' });
    // A literal newline would split the frame; JSON escapes it instead.
    expect(written[0]).toBe('data: {"text":"line one\\nline two"}\n\n');
    expect((written[0] as string).split('\n\n')).toHaveLength(2);
  });

  it('stops writing once the client disconnects', () => {
    const { res, written, emit } = fakeResponse();
    const stream = new SseWriter<{ type: string }>(res, { heartbeatMs: 0 });
    emit('close');
    stream.send({ type: 'message' });
    expect(written).toHaveLength(0);
    expect(stream.isClosed).toBe(true);
  });

  it('is safe to close twice', () => {
    const { res } = fakeResponse();
    const stream = new SseWriter(res, { heartbeatMs: 0 });
    stream.close();
    expect(() => stream.close()).not.toThrow();
  });

  it('emits heartbeat comments', async () => {
    vi.useFakeTimers();
    const { res, written } = fakeResponse();
    new SseWriter(res, { heartbeatMs: 10 });
    vi.advanceTimersByTime(25);
    expect(written.filter((chunk) => chunk.startsWith(': '))).toHaveLength(2);
    vi.useRealTimers();
  });
});
