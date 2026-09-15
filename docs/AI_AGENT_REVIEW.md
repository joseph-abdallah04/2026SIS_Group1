# RoundTable — AI Assistant Architecture Review

> Review of the AI assistant epic ([KAN-22](https://joseph-abdallah.atlassian.net/browse/KAN-22), branch `AI-Assistant`, [PR #31](https://github.com/joseph-abdallah04/2026SIS_Group1/pull/31)), 15 Sep 2026.
> Reviewed for one question: **is this the right pattern to keep and extend long-term**, assuming the product goes to market rather than ending as coursework.
> Scope: `apps/server/src/modules/assistant/`, `apps/web/src/features/assistant/`, `packages/shared/src/assistant.ts`, `apps/server/src/lib/crypto.ts`.

## Verdict

The **shape** of the agent is right and should survive any rewrite. The **plumbing underneath it** is hand-written code that a library should own. The things that will actually hurt at market are neither of those — they are trust and security gaps that no framework choice would have fixed.

Recommendation: **do not redo the epic.** Fix the trust and security gaps first, then swap the transport layer as a contained refactor.

> **Update, 15 Sep 2026 — acted on in this PR.** Findings 1–7 are fixed; finding 8 is partly
> fixed. The recommendation above was followed as written: the epic was kept, the gaps were
> closed, and the transport was swapped for the Vercel AI SDK. Each finding now has a
> **What we did** note in plain language. See [What was done](#what-was-done) for the
> implementation detail and [What is still open](#what-is-still-open) for the rest.

## At a glance

| #   | Finding                                                                       | Severity | Status                              |
| --- | ----------------------------------------------------------------------------- | -------- | ----------------------------------- |
| 1   | User-supplied `baseUrl` lets any account make the server fetch any URL (SSRF) | High     | **Fixed**                           |
| 2   | No token accounting — usage cannot be measured or billed                      | High     | **Fixed** (tokens; no pricing)      |
| 3   | Chat history and board context are client-supplied and trusted                | Medium   | **Fixed** for context; history open |
| 4   | No retries, no `max_tokens`, no whole-turn timeout                            | Medium   | **Fixed**                           |
| 5   | ~400 lines of hand-written provider transport                                 | Medium   | **Fixed** — deleted                 |
| 6   | Locked to the OpenAI wire format — no Anthropic/Bedrock native                | Medium   | **Fixed** — one import away         |
| 7   | Tool calls execute sequentially                                               | Low      | **Fixed** — SDK runs them together  |
| 8   | One app-wide encryption secret, no rotation, no KMS                           | Medium   | Partly — required in prod; no KMS   |

## What was already right

Worth recording so nobody "fixes" it later during a refactor.

- **The assistant cannot write to the board.** Tools produce a candidate artifact; the UI shows it with a Propose button; Propose goes through `submitArtifact` — the same path a hand-drawn sticky uses — authored by the human who clicked. This is the correct safety boundary and the hardest thing to retrofit. Keep it exactly as is.
- **Tools never call the model again.** The model fills in the tool arguments; the tool validates, lays out, and returns. One model call per step, and every tool is unit-testable with no provider. Framework-built agents frequently get this wrong by nesting model calls inside tools.
- **Cancellation genuinely works.** Closing the panel aborts the provider call server-side, so a cancelled answer stops costing money. The listener is on the _response_, not the request — the comment in `routes.ts` records the bug where listening on `req` aborted every turn at step zero.
- **The chat endpoint is member-only**, checked before body validation and before the stream opens, so a non-member gets a plain `403` rather than an SSE stream that opens and apologises.
- **Everything is schema-validated at the boundaries**, and model-generated artifacts are re-checked against the same rules the pinboard write path enforces (`parseArtifact`), so a malformed diagram fails inside the chat where the model can be told to fix it, rather than breaking the Propose button in the user's hand.
- **Module boundaries are drawn in the right places.** Other modules import only `modules/assistant/index.ts`. This is what makes finding 5 a contained refactor rather than a rewrite.

## On the framework question

The epic was built without an agent framework: a hand-rolled OpenAI-compatible client (`llm.ts`) and a hand-rolled tool-calling loop (`agent.ts`). The usual objection is "why not LangChain or LangGraph?" — but that is the wrong comparison, and dismissing it does not settle the question.

**LangGraph is not the relevant alternative.** It is a durable orchestration engine for work that must survive process death: multi-agent handoffs, checkpoints, human approval in the middle of a graph. Interactive chat is a request that streams and ends. Building the floating bubble as a graph would be over-engineering.

**Spring AI is the relevant alternative**, and its Node equivalent is the **Vercel AI SDK** (the `ai` package). Both are thin platform-idiomatic layers: one chat client interface, swappable providers, tools bound by schema, streaming handled for you, observability hooks. That is a plumbing library, not an orchestration engine, and measured against it this module does reinvent a substantial amount.

### What is reinvented

`llm.ts` is 384 lines. Most of it is not product logic:

| What it does                                     | Approx. lines | Should a library own it?     |
| ------------------------------------------------ | ------------- | ---------------------------- |
| Parsing the provider's SSE stream                | ~50           | Yes                          |
| Reassembling tool calls that arrive in fragments | ~25           | Yes                          |
| Typing the OpenAI request/response shapes        | ~60           | Yes                          |
| HTTP, timeouts, abort wiring                     | ~50           | Yes                          |
| Turning provider errors into readable messages   | ~40           | Partly — the wording is ours |

`agent.ts` adds another 225 lines. With the AI SDK's `streamText` and its built-in step limit, that is roughly 60.

Call it **~400 of ~600 lines that could be deleted** and replaced with a maintained dependency — lines the team now owns forever, including every provider quirk. Two have already been hand-patched: tool-call arguments split across chunks, and reasoning models that name the field `reasoning_content` instead of `reasoning`.

### Why this matters beyond line count

Because everything speaks the OpenAI wire format, the product **cannot talk to Anthropic, Bedrock, or Gemini natively** without writing each adapter by hand. For a bring-your-own-key product selling to enterprises, "OpenAI-compatible endpoints only" is a sales objection. Spring AI and the Vercel AI SDK both solve this out of the box (finding 6).

## Findings

### 1. Any account can make the server fetch any URL — High

The user types a base URL in Settings. The server stores it and later calls `fetch(baseUrl + '/chat/completions')` from inside your infrastructure. The only validation is that it parses as a URL and starts with `http` or `https`:

```ts
baseUrl: z.string().url(...).max(300).refine((url) => /^https?:\/\//i.test(url), 'Base URL must use http(s)')
```

There is no host restriction. A signed-up user can point it at `http://169.254.169.254/` (the cloud metadata service, which hands out instance credentials), at internal services reachable from the server but not the internet, or at `localhost`. The `localhost:11434` Ollama preset shows the allowance is deliberate for local development; in production it is an open door.

This is **server-side request forgery**, and it is not blind: `POST /api/me/llm-config/test` probes an _unsaved_ URL and returns latency plus up to 300 characters of the response body (`describeHttpError`). That is a scanner with a readout.

Harmless on a laptop. Not harmless the day this is multi-tenant on a cloud host.

**Fix:** a provider host allowlist (OpenAI, Anthropic, Groq, OpenRouter, Azure, plus customer-registered domains), **and** rejection of private / link-local / loopback ranges after DNS resolution, **and** ideally an egress proxy. Keep `localhost` working behind a `NODE_ENV=development` check only.

**What we did.** The address is now checked twice: once when the user saves it, and again at the moment the connection actually opens. The second check matters because an attacker could otherwise use a web address that looks innocent when you check it and switches to an internal one a second later. Addresses that resolve to private, loopback, or cloud-metadata IPs are rejected. Local models like Ollama still work on a laptop, because that is switched on in development and off in production. A full host allowlist and an egress proxy are still future work.

### 2. Usage cannot be measured or billed — High

The request never sets `stream_options: { include_usage: true }`, and nothing records tokens anywhere. That means no spend display, no quota, no abuse detection, no paid tier, and no way to answer "why is this customer's bill so high".

It is a small change and it blocks commercial work. **Fix:** request usage on the stream, record `{ userId, sessionId, model, promptTokens, completionTokens, toolName, latencyMs }` per turn, and put a quota check in front of `runAssistantTurn`.

**What we did.** Every turn now records how many tokens it used, how long it took, how many model round-trips it made, and how it ended — including turns that fail or get cancelled partway, which still cost real money and would otherwise be invisible. We store the provider host, never the full URL and never the key. Deleting a session does not erase the cost record. The same numbers go back to the client at the end of the stream, and there is an endpoint that summarises them. What is still missing: converting tokens into dollars, and a quota that stops a heavy user before the next turn starts.

### 3. History and board context are client-supplied and trusted — Medium

`POST /api/sessions/:id/assistant/chat` accepts `history` (up to 20 messages × 8000 chars) and `context` (up to 20 proposals) from the browser. The server verifies session membership and reads the session row for title and status, then merges the client's version of everything else straight into the prompt.

So the client can forge prior assistant turns and misrepresent what is on the board. Today the blast radius is small — it only misleads that user's own private assistant — but the consequences compound:

- No server-side audit trail of what the assistant was told or said.
- No multi-device or cross-session history (it lives in `sessionStorage`).
- A feature like "summarise what the team decided" cannot be trusted, because the input is attacker-controlled.

`context.ts` already ships the right mechanism — `registerAssistantContextProvider`, so sessions/pinboard/voting can inject verified lines — and **nothing registers with it**. The client path was meant to be a convenience; it became the only source.

**Fix:** build context server-side from the database, keep the client's contribution to genuinely client-only facts (what the user has selected on screen), and persist threads server-side.

**What we did.** The server now reads the board from the database itself, through the same path the pinboard already uses. The browser is no longer allowed to describe what is on the board. The only thing it still sends is which card the user has clicked, which is genuinely something only the browser can know. The old client-side "describe this board" builder was deleted. Chat history still lives in the browser and is sent with each turn, so there is still no audit trail and no history across devices — that is its own piece of work.

### 4. No retries, no output cap, no whole-turn timeout — Medium

- A single `429` or `503` from the provider ends the turn with an error in the user's face. No backoff, no retry.
- `max_tokens` is set on the connection probe but **not** on real calls, so a runaway model bills the user up to the provider default.
- `REQUEST_TIMEOUT_MS` is 90s **per HTTP call**, and `MAX_STEPS` is 4 — so one question can occupy a connection for roughly six minutes.

**Fix:** retry idempotent failures with exponential backoff, set an explicit `max_tokens`, and add a deadline covering the whole turn rather than each call.

**What we did.** If the provider is briefly busy, the server waits and retries instead of putting an error in the user's face. There is now a hard ceiling on how long a reply can be, so one careless prompt cannot run up a surprising bill. There is also a time limit on the whole turn, not just each individual HTTP call.

### 5. ~400 lines of hand-written transport — Medium

See [On the framework question](#on-the-framework-question). **Fix:** replace `llm.ts` and most of `agent.ts` with the Vercel AI SDK. Because the module boundaries are already correct, this touches almost nothing else — `tools/`, `prompt.ts`, `routes.ts`, the SSE event contract in `packages/shared`, and the entire frontend stay as they are.

**What we did.** The hand-written provider client is deleted. Talking to the model, parsing the stream, reassembling tool calls, retries, and timeouts are now the Vercel AI SDK's job. Two provider quirks we had already patched by hand — arguments that arrive in fragments, and reasoning models that name a field differently — are the library's problem now. The rest of the product (tools, prompts, the chat contract, the UI) did not need rewriting.

### 6. Locked to the OpenAI wire format — Medium

Follows from finding 5 and is resolved by the same change. Worth tracking separately because it is a _product_ limitation, not a code-quality one.

**What we did.** Switching to the SDK fixed this as a side effect. Supporting Anthropic, Bedrock, or Gemini natively is now changing one import rather than writing an adapter by hand. We still talk to OpenAI-compatible endpoints by default, because that is what "bring your own provider" needs today.

### 7. Tool calls execute sequentially — Low

`agent.ts` awaits each call in turn:

```ts
for (const call of toolCalls) {
  const toolMessage = await executeToolCall(call, emit, signal);
  messages.push(toolMessage);
}
```

Models routinely request several tools at once. Running them in parallel would cut latency. Correctness is unaffected.

**What we did.** We did not write a parallel executor. The SDK already runs a step's tool calls together, so this went away when we swapped the transport. The user waits less when the model asks for two things at once.

### 8. Key storage: right primitive, wrong key management — Medium

`lib/crypto.ts` is sound as a primitive: AES-256-GCM (authenticated, so a tampered row fails to decrypt rather than yielding garbage), a `v1.` version prefix that leaves room for rotation, keys never returned by any endpoint, decryption into a local variable for the lifetime of one call.

What does not scale:

- **One app-wide secret.** `LLM_KEY_ENCRYPTION_SECRET` wraps every user's key. Anyone holding the database _and_ that environment variable holds every customer key.
- **No rotation.** Changing the secret makes every stored key undecryptable; users must re-enter them. The `v1.` prefix anticipates dual-decrypt but nothing implements it.
- **The secret is optional at boot.** `env.ts` marks it `.optional()`, so a misconfigured production server starts fine and fails at save time with a 500.
- **No audit of decryption.** Nothing records who decrypted what, when.

**Fix, in order:** make the secret required in production; then envelope encryption — a random data key per user, wrapped by a KMS-managed master key (AWS KMS, GCP KMS, or Vault transit) — with dual-decrypt (`v1`/`v2`) and re-wrap on next save. The public API (`getLlmCredentials`) does not change.

Also unresolved: [KAN-28](https://joseph-abdallah.atlassian.net/browse/KAN-28) specifies a **leader key stored per session**, while the code implements a **per-user key** (`UserLLMConfig`, unique on `userId`). Per-user is the better product decision; the ticket should be corrected rather than the code.

**What we did.** Only the first step: a production server now refuses to start without the encryption secret, instead of booting happily and failing the first time someone tries to save a key. Everything else is still open — one shared secret wraps every customer's key, there is no rotation, and there is no key-management service. That is its own piece of work.

## What was done

Steps 1 and 2 of the sequence below were completed together in this PR. Each finding above
keeps its original wording (the problem as we found it) plus a **What we did** note in plain
language. This section is the same story in implementation terms.

**The transport is gone (5, 6, 7).** `llm.ts` and its test are deleted, and `agent.ts` is a
`streamText` call over the SDK's `fullStream`. `provider.ts` builds the model through
`@ai-sdk/openai-compatible`; pointing at Anthropic or Bedrock natively is now a different import
rather than a hand-written adapter. The SDK runs tool calls in a step concurrently, so finding 7
disappeared without being worked on directly. Two hand-patched provider quirks — fragmented
tool-call arguments and `reasoning_content` — are the library's problem now.

**Base URLs are checked twice (1).** `network/ipRange.ts` classifies an address against the
reserved IPv4 and IPv6 blocks, including IPv4-mapped and NAT64 forms, and treats anything it
cannot parse as private. `network/guardedFetch.ts` validates the host when a URL is saved or
tested, then pins the connection through an `undici` agent whose `connect.lookup` re-checks every
resolved address. The second check is what closes DNS rebinding: a name that answered publicly
during validation cannot resolve to `169.254.169.254` at connect time.
`ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS` keeps Ollama on `localhost` working in development and
defaults off in production.

**Every turn is accounted for (2).** `AssistantTurnUsage` records input, output, total, reasoning
and cached-input tokens per turn, plus step count, duration and how the turn ended. It stores the
provider _host_, never the URL and never the key, and `sessionId` is deliberately not a foreign
key so deleting a session does not erase what it cost. Usage is reported from a `finally` block,
so a turn that errors or is cancelled halfway is still billed for what it burned — the failure
case is exactly the one worth measuring. `GET /api/me/assistant-usage` aggregates it, and the
`done` frame carries the same numbers to the client.

**The prompt no longer trusts the browser (3).** `context.ts` reads the board through
`getBoardForSession`, the same verified path the pinboard uses. `AssistantContext` is down to one
field, `selectedProposalId`, which is a genuinely client-only fact: what the user has clicked.
`SessionPinboard.tsx` lost its `describeBoard` builder entirely.

**Turns are bounded (4).** `maxRetries` handles a `429` or `503` with backoff instead of putting
the error in the user's face, `ASSISTANT_MAX_OUTPUT_TOKENS` caps generation per call, and the
SDK's timeouts apply to the whole turn rather than each HTTP hop.

**The encryption secret is required in production (8, partly).** `env.ts` refuses to boot a
production server without `LLM_KEY_ENCRYPTION_SECRET`, rather than starting fine and returning a
500 the first time a user saves a key.

Tests moved with the code: `testing/scriptedModel.ts` drives `MockLanguageModelV4` so agent and
route tests exercise real SDK stream handling without a provider, `tools/` tests call the pure
`run*` functions directly, and `network/ipRange.test.ts` covers the address classifier.

## What is still open

- **Pricing (2).** Tokens are recorded; converting them to money needs a per-model price table,
  and there is no quota check in front of `runAssistantTurn` yet.
- **Server-side history (3).** Context is server-authoritative, but the transcript still lives in
  `sessionStorage` and is sent with each turn, so there is no audit trail and no multi-device
  history. Closing this means persisting threads, which is its own piece of work.
- **KMS-backed keys (8).** Still one app-wide secret with no rotation and no dual-decrypt. The
  `v1.` prefix leaves the room for it; envelope encryption is unbuilt.
- **[KAN-28](https://joseph-abdallah.atlassian.net/browse/KAN-28) still says per-session key**
  while the code implements per-user. The ticket should be corrected, not the code.

## Recommended sequence

Three separate moves, deliberately not one rewrite. **Steps 1 and 2 are done** — recorded above.

**1. Before any customer touches this.** ✅ Findings 1–4: lock down the base URL, record token usage, stop trusting client-supplied history and context, add retries / `max_tokens` / a turn deadline. Days of work, and the difference between a demo and something commercially defensible.

**2. Soon, as a contained refactor.** ✅ Findings 5 and 6: adopt the Vercel AI SDK. Deletes ~400 lines of maintenance burden, unlocks non-OpenAI providers, and brings OpenTelemetry hooks that finding 2 needs anyway.

> The prediction in step 2 held: `tools/`, `prompt.ts`, the SSE contract and the entire frontend
> were untouched by the swap. The only frontend change in this PR was _deleting_ the client-side
> context builder, which finding 3 made redundant.

**3. Only when a job needs it.** A durable workflow engine (Temporal, Inngest, or LangGraph) for work that must outlive an HTTP request — automated session recap, nightly digest, a facilitator agent. It sits _beside_ this chat loop and calls the same tools. The floating bubble should remain a simple streaming loop even then.

## What not to do

- **Do not rebuild the epic on LangChain or LangGraph.** It would replace a readable, testable loop with a framework the product does not need, and would fix none of findings 1–4.
- **Do not move key handling into the browser** to avoid storing secrets. Tools would then have to run client-side, or you reinvent a worse proxy. Server-side bring-your-own-key is the correct product; the fix is KMS-backed key management, not relocation.
- **Do not let the assistant write to the pinboard directly.** The Propose-as-the-user boundary is the single most valuable design decision in this module.
