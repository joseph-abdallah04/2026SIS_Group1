import { describe, expect, it } from 'vitest';

import { joinUrl, readSseData } from './llm.js';

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
