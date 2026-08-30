import { describe, expect, it } from 'vitest';

import {
  decodeEntities,
  parseDuckDuckGoHtml,
  parseInstantAnswer,
  resolveDuckDuckGoUrl,
  stripHtml,
} from './webSearch.js';

// Trimmed to the structure the parser depends on. If DuckDuckGo changes their markup this
// is the test that should be updated first — the live failure mode is silent (zero results).
const SAMPLE = `
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsocket.io%2Fdocs%2Fv4%2F&amp;rut=abc">Socket.IO <b>docs</b></a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fsocket.io%2Fdocs%2Fv4%2F">Realtime <b>bidirectional</b> event-based communication.</a>
</div>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fguide">Example guide</a>
  </h2>
  <a class="result__snippet">A second &amp; final result.</a>
</div>
`;

describe('parseDuckDuckGoHtml', () => {
  it('extracts title, unwrapped url and snippet', () => {
    const results = parseDuckDuckGoHtml(SAMPLE);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: 'Socket.IO docs',
      url: 'https://socket.io/docs/v4/',
      snippet: 'Realtime bidirectional event-based communication.',
    });
    expect(results[1]?.snippet).toBe('A second & final result.');
  });

  it('does not attach a snippet to the wrong result', () => {
    const results = parseDuckDuckGoHtml(SAMPLE);
    expect(results[1]?.title).toBe('Example guide');
    expect(results[1]?.snippet).not.toContain('bidirectional');
  });

  it('returns nothing for a page with no results', () => {
    expect(parseDuckDuckGoHtml('<html><body>No results.</body></html>')).toEqual([]);
  });
});

describe('resolveDuckDuckGoUrl', () => {
  it('unwraps the redirect parameter', () => {
    expect(resolveDuckDuckGoUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa')).toBe(
      'https://example.com/a',
    );
  });

  it('passes a direct link through', () => {
    expect(resolveDuckDuckGoUrl('https://example.com/b')).toBe('https://example.com/b');
  });

  it('drops internal duckduckgo links and junk', () => {
    expect(resolveDuckDuckGoUrl('//duckduckgo.com/y.js?ad=1')).toBeNull();
    expect(resolveDuckDuckGoUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('parseInstantAnswer', () => {
  it('reads the abstract and related topics', () => {
    const results = parseInstantAnswer(
      JSON.stringify({
        Heading: 'WebRTC',
        AbstractText: 'A free, open-source project.',
        AbstractURL: 'https://webrtc.org',
        RelatedTopics: [{ Text: 'LiveKit - an SFU', FirstURL: 'https://livekit.io' }],
      }),
    );
    expect(results[0]?.title).toBe('WebRTC');
    expect(results[1]).toEqual({
      title: 'LiveKit',
      url: 'https://livekit.io',
      snippet: 'LiveKit - an SFU',
    });
  });

  it('survives malformed json', () => {
    expect(parseInstantAnswer('{not json')).toEqual([]);
  });
});

describe('text helpers', () => {
  it('decodes entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#39;d&#39;')).toBe("a & b <c> 'd'");
  });

  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<b>Hello</b>\n   <i>world</i>')).toBe('Hello world');
  });
});
