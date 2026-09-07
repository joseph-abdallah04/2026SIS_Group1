import { afterEach, describe, expect, it, vi } from 'vitest';

import { joinUrl, readSseData, streamChatCompletion, type LlmStreamChunk } from './llm.js';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const payload of readSseData(stream)) out.push(payload);
  return out;
}

describe('joinUrl', () => {
  it('normalises the separator', () => {
    expect(joinUrl('https://api.openai.com/v1', 'chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
    expect(joinUrl('https://api.openai.com/v1/', '/chat/completions')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
});

describe('readSseData', () => {
  it('reads whole frames', async () => {
    expect(await collect(streamOf('data: one\n\ndata: two\n\n'))).toEqual(['one', 'two']);
  });

  it('reassembles a frame split across chunks', async () => {
    // This is the case that breaks naive parsers: providers flush mid-frame constantly.
    expect(await collect(streamOf('data: {"a"', ':1}\n', '\ndata: {"b":2}\n\n'))).toEqual([
      '{"a":1}',
      '{"b":2}',
    ]);
  });

  it('tolerates CRLF frame separators', async () => {
    expect(await collect(streamOf('data: one\r\n\r\ndata: two\r\n\r\n'))).toEqual(['one', 'two']);
  });

  it('ignores comments and event-name lines', async () => {
    expect(await collect(streamOf(': keep-alive\n\nevent: ping\ndata: payload\n\n'))).toEqual([
      'payload',
    ]);
  });

  it('joins multiple data lines in one frame', async () => {
    expect(await collect(streamOf('data: a\ndata: b\n\n'))).toEqual(['a\nb']);
  });

  it('yields a trailing frame with no blank line after it', async () => {
    expect(await collect(streamOf('data: [DONE]'))).toEqual(['[DONE]']);
  });

  it('handles a multi-byte character split across chunks', async () => {
    const encoded = new TextEncoder().encode('data: "é"\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 7)); // splits the two-byte é
        controller.enqueue(encoded.slice(7));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual(['"é"']);
  });
});

describe('streamChatCompletion', () => {
  function respondWith(...frames: string[]) {
    return vi.fn().mockResolvedValue(
      new Response(streamOf(...frames.map((frame) => `data: ${frame}\n\n`), 'data: [DONE]\n\n'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
  }

  async function drain(): Promise<LlmStreamChunk[]> {
    const chunks: LlmStreamChunk[] = [];
    const stream = streamChatCompletion(
      { baseUrl: 'https://example.test/v1', apiKey: 'k', model: 'm' },
      { messages: [{ role: 'user', content: 'hi' }] },
    );
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Reasoning models split their output across two channels. Only `content` belongs in the
  // chat, but `reasoning` has to be carried out so a content-less turn can fall back to it
  // instead of showing the user nothing at all.
  it('carries reasoning deltas on the finish chunk without yielding them as content', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith(
        '{"choices":[{"delta":{"reasoning":"The user asks "}}]}',
        '{"choices":[{"delta":{"reasoning":"about proposals."}}]}',
        '{"choices":[{"delta":{"content":"Two so far."},"finish_reason":"stop"}]}',
      ),
    );

    const chunks = await drain();
    expect(chunks.filter((c) => c.type === 'content')).toEqual([
      { type: 'content', text: 'Two so far.' },
    ]);
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      toolCalls: [],
      finishReason: 'stop',
      reasoningText: 'The user asks about proposals.',
    });
  });

  it('reads the `reasoning_content` spelling too', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith('{"choices":[{"delta":{"reasoning_content":"mm"},"finish_reason":"stop"}]}'),
    );

    expect(await drain()).toEqual([
      { type: 'finish', toolCalls: [], finishReason: 'stop', reasoningText: 'mm' },
    ]);
  });

  it('omits reasoningText entirely when the model streamed none', async () => {
    vi.stubGlobal(
      'fetch',
      respondWith('{"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}'),
    );

    expect(await drain()).toEqual([
      { type: 'content', text: 'hi' },
      { type: 'finish', toolCalls: [], finishReason: 'stop' },
    ]);
  });
});
