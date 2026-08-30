// F36 tool 1 — web search.
//
// DuckDuckGo's HTML endpoint: no API key, no account, no cost (docs/03). It is also
// unofficial and rate-limits aggressively, so a failure here degrades to the Instant
// Answer API and finally to a plain "no results" — a flaky search must never take down
// the chat turn.
import type { WebSearchResult } from '@roundtable/shared';

const HTML_ENDPOINT = 'https://html.duckduckgo.com/html/';
const INSTANT_ANSWER_ENDPOINT = 'https://api.duckduckgo.com/';
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 5;

// DuckDuckGo returns an empty page to obviously-scripted clients.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export interface WebSearchOutcome {
  results: WebSearchResult[];
  /** Which path produced the results — surfaced in the tool-result frame for transparency. */
  source: 'duckduckgo-html' | 'duckduckgo-instant' | 'none';
  note?: string;
}

export async function searchWeb(query: string, signal?: AbortSignal): Promise<WebSearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], source: 'none', note: 'Empty query' };
  }

  try {
    const html = await fetchText(
      `${HTML_ENDPOINT}?q=${encodeURIComponent(trimmed)}&kl=wt-wt`,
      signal,
    );
    const results = parseDuckDuckGoHtml(html).slice(0, MAX_RESULTS);
    if (results.length > 0) {
      return { results, source: 'duckduckgo-html' };
    }
  } catch (cause) {
    // Fall through to the instant-answer endpoint.
    if (isAbort(cause, signal)) throw cause;
  }

  try {
    const json = await fetchText(
      `${INSTANT_ANSWER_ENDPOINT}?q=${encodeURIComponent(trimmed)}&format=json&no_html=1&no_redirect=1&skip_disambig=1`,
      signal,
    );
    const results = parseInstantAnswer(json).slice(0, MAX_RESULTS);
    if (results.length > 0) {
      return {
        results,
        source: 'duckduckgo-instant',
        note: 'HTML search was unavailable; used DuckDuckGo Instant Answers instead.',
      };
    }
  } catch (cause) {
    if (isAbort(cause, signal)) throw cause;
  }

  return {
    results: [],
    source: 'none',
    note: 'Web search is unavailable right now (DuckDuckGo did not respond or returned nothing).',
  };
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/json' },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo responded ${response.status}`);
  }
  return response.text();
}

function isAbort(cause: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true && cause instanceof Error && cause.name === 'AbortError';
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const RESULT_LINK_RE =
  /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const SNIPPET_RE = /<a[^>]+class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Extracts title/url/snippet triples from a DuckDuckGo HTML results page.
 *
 * Exported for tests: this is the piece most likely to break when DuckDuckGo changes
 * their markup, and the failure is silent (zero results) rather than loud.
 */
export function parseDuckDuckGoHtml(html: string): WebSearchResult[] {
  const links = [...html.matchAll(RESULT_LINK_RE)].map((m) => ({
    index: m.index ?? 0,
    href: m[1] ?? '',
    title: stripHtml(m[2] ?? ''),
  }));
  const snippets = [...html.matchAll(SNIPPET_RE)].map((m) => ({
    index: m.index ?? 0,
    text: stripHtml(m[1] ?? ''),
  }));

  const results: WebSearchResult[] = [];
  links.forEach((link, i) => {
    const url = resolveDuckDuckGoUrl(link.href);
    if (!url || !link.title) return;

    const nextLinkIndex = links[i + 1]?.index ?? Number.MAX_SAFE_INTEGER;
    const snippet = snippets.find((s) => s.index > link.index && s.index < nextLinkIndex);

    results.push({ title: link.title, url, snippet: snippet?.text ?? '' });
  });
  return results;
}

/**
 * DuckDuckGo wraps outbound links as `//duckduckgo.com/l/?uddg=<encoded target>`.
 * Unwrap it so the chat panel links straight to the source.
 */
export function resolveDuckDuckGoUrl(href: string): string | null {
  const decodedHref = decodeEntities(href);
  const absolute = decodedHref.startsWith('//') ? `https:${decodedHref}` : decodedHref;

  try {
    const url = new URL(absolute, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    const finalUrl = target ? new URL(target) : url;
    if (finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') return null;
    if (finalUrl.hostname.endsWith('duckduckgo.com')) return null; // ad/redirect noise
    return finalUrl.toString();
  } catch {
    return null;
  }
}

interface InstantAnswerPayload {
  AbstractText?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Topics?: Array<{ Text?: string; FirstURL?: string }>;
  }>;
}

export function parseInstantAnswer(json: string): WebSearchResult[] {
  let payload: InstantAnswerPayload;
  try {
    payload = JSON.parse(json) as InstantAnswerPayload;
  } catch {
    return [];
  }

  const results: WebSearchResult[] = [];
  if (payload.AbstractText && payload.AbstractURL) {
    results.push({
      title: payload.Heading || payload.AbstractURL,
      url: payload.AbstractURL,
      snippet: payload.AbstractText,
    });
  }

  const flat = (payload.RelatedTopics ?? []).flatMap((topic) => topic.Topics ?? [topic]);
  for (const topic of flat) {
    if (!topic.FirstURL || !topic.Text) continue;
    results.push({
      title: topic.Text.split(' - ')[0] ?? topic.Text,
      url: topic.FirstURL,
      snippet: topic.Text,
    });
  }
  return results;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

export function decodeEntities(value: string): string {
  return value
    .replace(
      /&(amp|lt|gt|quot|nbsp|#39|#x27);/gi,
      (match) => ENTITIES[match.toLowerCase()] ?? match,
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}
