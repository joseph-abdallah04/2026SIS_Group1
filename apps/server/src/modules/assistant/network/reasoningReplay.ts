// Some OpenAI-compatible providers refuse to be shown a model's own reasoning.
//
// When a reasoning model calls a tool, the agent loop sends that step back to the model with
// the tool's result, and `@ai-sdk/openai-compatible` writes the step's reasoning onto that
// assistant message as `reasoning_content`. Thinking models such as DeepSeek's and Kimi's
// use it to carry a turn across tool calls. Groq refuses it: gpt-oss streams its reasoning,
// so every sticky note or diagram it made was followed by a 400 —
//
//   'messages.2' : for 'role:assistant' the following must be satisfied
//   [('messages.2' : property 'reasoning_content' is unsupported)]
//
// — and the turn died after the card was already on screen.
//
// Nothing in a base URL says which kind of provider it is, so this learns instead of
// guessing. A request goes out as the SDK built it. If the provider refuses it and names
// `reasoning_content`, the same request goes again without that field, and the host is
// remembered for the life of the process so later requests skip the refused attempt. A
// refused request is turned away before any generation starts, so the retry costs a round
// trip, not tokens.

const FIELD = 'reasoning_content';

/** Hosts that have refused the field. Process-wide, and never large: one entry per provider. */
const refusingHosts = new Set<string>();

/** Test seam — forget every host learned so far. */
export function forgetReasoningRefusals(): void {
  refusingHosts.clear();
}

/** Wraps a fetch so a provider that refuses replayed reasoning gets the request without it. */
export function withReasoningReplayFallback(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const stripped = withoutReplayedReasoning(init?.body);
    if (stripped === null) return fetchImpl(input, init);

    const host = hostOf(input);
    if (host && refusingHosts.has(host)) {
      return fetchImpl(input, { ...init, body: stripped });
    }

    const response = await fetchImpl(input, init);
    if (!(await refusesReplayedReasoning(response))) return response;

    // Free the connection the refused response is holding before asking again.
    await response.body?.cancel().catch(() => undefined);
    if (host) refusingHosts.add(host);
    return fetchImpl(input, { ...init, body: stripped });
  };
}

/**
 * The request body with `reasoning_content` removed from every assistant message, or `null`
 * when there is none to remove — which is almost every request, so that path parses nothing.
 */
export function withoutReplayedReasoning(body: BodyInit | null | undefined): string | null {
  if (typeof body !== 'string' || !body.includes(`"${FIELD}"`)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.messages)) return null;

  let removed = false;
  const messages = parsed.messages.map((message: unknown) => {
    if (!isRecord(message) || message.role !== 'assistant' || !(FIELD in message)) {
      return message;
    }
    removed = true;
    const { [FIELD]: _reasoning, ...rest } = message;
    void _reasoning;
    return rest;
  });

  return removed ? JSON.stringify({ ...parsed, messages }) : null;
}

/** A 400/422 whose body names the field — the provider is refusing that, specifically. */
async function refusesReplayedReasoning(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 422) return false;
  try {
    return (await response.clone().text()).includes(FIELD);
  } catch {
    return false;
  }
}

function hostOf(input: RequestInfo | URL): string | null {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
