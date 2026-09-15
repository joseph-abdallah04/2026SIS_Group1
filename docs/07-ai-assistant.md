# RoundTable — AI Assistant Module

> Owner: AI Assistant (docs/06 §7). Covers **F33–F37** plus the two items docs/05 deferred to
> this module: the SSE streaming helper and decrypting LLM keys at call time.

## What it does

Every participant gets a private ideation buddy in a floating bubble at the bottom-right of a
session. Opening it swaps the bubble for the panel — the two are never on screen together. The
panel's own X, or Escape, closes it and brings the bubble back with focus on it.

**The panel is movable and resizable**: drag the header to move it, drag any of the four sides
or four corners to resize, double-click the header to put it back. The handles are the panel's
last children on purpose — when they came first, the header and composer painted over three of
the four and only the top-left corner was reachable. Sides are deliberately thin so they do not
swallow the transcript's scrollbar. Position and size are remembered in `localStorage`
(a lasting preference, unlike the transcript, which is per-tab) and re-clamped whenever the
window changes, so a panel can never end up somewhere it cannot be grabbed. It ships sitting
bottom-right at a height that clears the board header — the fixed height it had before ran
straight through the session status and End session controls. The arithmetic lives in exported
pure functions (`clampGeometry`, `resizeFrom`) and is unit-tested directly, because jsdom has
no layout and a simulated drag there would prove nothing. It knows what is happening in the session, can search the web, and can draft sticky
notes and diagrams that the user drops onto the shared pinboard with one click.

Nobody else sees your chat. The assistant reads session state and never writes it — the only
thing that reaches the pinboard is what the user explicitly proposes, through the normal
proposal pipeline, authored by them (docs/02 §8.8).

**Nobody pays for inference but the user.** Each person configures their own OpenAI-compatible
provider; RoundTable stores an encrypted key and forwards requests. No platform LLM bill, and
no data goes anywhere the user did not choose.

## Running it locally

All commands run from the **repo root**, where `.env` lives.

```bash
cp .env.example .env
openssl rand -base64 32   # -> LLM_KEY_ENCRYPTION_SECRET
openssl rand -base64 32   # -> JWT_SECRET
```

Leave `DATABASE_URL` as it ships — it points at the local Docker Postgres. Then:

```bash
npm install
npm run db:up                                # Docker Postgres on :5433
npm run db:deploy --workspace @roundtable/server
npm run db:seed   --workspace @roundtable/server
npm run dev
```

> The `db:*` scripts live in the server workspace and are wrapped in `dotenv -e ../../.env`,
> because the Prisma CLI looks for `.env` beside itself and the repo keeps one at the root.
> The server is immune either way: `src/env.ts` resolves the root `.env` by path, not by cwd.

Log in at <http://localhost:5173/login> as `alice@example.com` (the seed prints the password),
add a provider at <http://localhost:5173/settings> — Groq's free tier and a local Ollama both
work — press **Test connection**, then open the session the seed prints. The bubble is
bottom-right.

## How a turn works

```
Chat panel ──POST /api/sessions/:id/assistant/chat──► routes.ts
                                                         │ validate (zod)
                                                         │ decrypt this user's API key
                                                         │ check the base URL is reachable-safe
                                                         │ read session context SERVER-side
                                                         ▼
                                                      agent.ts ──► the user's LLM
                                                         │  ◄── text deltas / tool calls
                                                         │
                                                         ├─ web_search      (DuckDuckGo)
                                                         ├─ create_diagram  (layout here)
                                                         └─ sticky_ideation
                                                         │
                            ◄────── SSE frames ──────────┘
                                                         │
                                                         └─► usage.service.ts (token spend)
```

The loop runs at most `MAX_STEPS` (4) model round trips per turn, then answers regardless.

### The Vercel AI SDK does the plumbing

The provider call, SSE parsing, tool-call reassembly, the multi-step loop, retries and
timeouts are the [AI SDK](https://ai-sdk.dev)'s (`ai` + `@ai-sdk/openai-compatible`), not
ours. What is still ours is everything the SDK has no opinion about: which hosts we are
willing to connect to, what to show when a model answers with nothing, and how a turn maps
onto the frames the panel renders.

That division is why `agent.ts` is a `switch` over stream parts rather than a hand-rolled
loop, and why there is no longer an `llm.ts`.

### Files

| File                       | Responsibility                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| `routes.ts`                | HTTP surface, request validation, SSE lifecycle                       |
| `agent.ts`                 | Maps the SDK's stream onto our frames; step ceiling, empty replies    |
| `provider.ts`              | Builds the model from user credentials; translates provider errors    |
| `network/guardedFetch.ts`  | SSRF guard — refuses to open a socket to a disallowed address         |
| `network/ipRange.ts`       | Public vs private address classification                              |
| `context.ts`               | Server-side session context + the provider registry other modules use |
| `usage.service.ts`         | Per-turn token accounting                                             |
| `prompt.ts`                | Persona and operating rules                                           |
| `tools/index.ts`           | The three tools: pure `run*` functions plus their SDK wrappers        |
| `tools/webSearch.ts`       | DuckDuckGo HTML scrape + Instant Answer fallback                      |
| `tools/layout.ts`          | Deterministic diagram layout                                          |
| `llmConfig.service.ts`     | F33: save / read / test / decrypt provider config                     |
| `testing/scriptedModel.ts` | A `LanguageModelV4` that says what a test tells it to                 |
| `../../lib/sse.ts`         | SSE writer (shared infrastructure, reusable)                          |
| `../../lib/crypto.ts`      | AES-256-GCM encrypt/decrypt (shared infrastructure)                   |

Frontend mirrors it under `apps/web/src/features/assistant/`, with the settings form in
`apps/web/src/features/settings/`.

## API

| Method   | Path                               | Notes                                                  |
| -------- | ---------------------------------- | ------------------------------------------------------ |
| `GET`    | `/api/me/llm-config`               | `{ baseUrl, model, hasKey }` — **never the key**       |
| `PUT`    | `/api/me/llm-config`               | `{ baseUrl, apiKey, model }`                           |
| `DELETE` | `/api/me/llm-config`               | forget the config                                      |
| `POST`   | `/api/me/llm-config/test`          | body = config to test, or empty to test the stored one |
| `GET`    | `/api/me/assistant-usage`          | token spend per model, `?days=` (default 30)           |
| `POST`   | `/api/sessions/:id/assistant/chat` | SSE stream (below)                                     |

### Stream frames

Types live in `packages/shared/src/assistant.ts` (`AssistantStreamEvent`).

```jsonc
{ "type": "message", "role": "assistant", "content": "…" }   // a DELTA — append it
{ "type": "tool", "toolName": "web_search", "status": "running", "args": { … } }
{ "type": "tool-result", "toolName": "web_search", "ok": true, "summary": "5 results", "results": [ … ] }
{ "type": "artifact", "artifactId": "…", "source": "sticky_ideation", "artifact": { "type": "sticky", … } }
{ "type": "error", "message": "…", "code": "LLM_NOT_CONFIGURED" }
{ "type": "done", "reason": "complete", "usage": { "inputTokens": 250, … } }  // always last
```

docs/06 sketched the artifact frame as `{"type":"artifact","type":"sticky",…}` — two `type`
keys, which is not valid JSON. The artifact is nested under `artifact` instead.

`usage` is present only when the provider reported numbers, and each field inside it is
independently optional. A missing count means **not reported**, never zero: plenty of
OpenAI-compatible servers report nothing, and a cost display that silently reads 0 is worse
than one that says it does not know.

## Cost

Each turn writes one `assistant_turn_usage` row: tokens in and out, reasoning and cached
portions where the provider separates them, how many model round trips it took, how long it
ran, and how it ended. Token columns are nullable for the reason above.

A turn that burned tokens and then failed is still recorded — usage leaves `runAssistantTurn`
through an `onUsage` callback rather than its return value, so an exception cannot lose it.

There is deliberately no dollar figure. Users bring their own provider and their own
negotiated pricing, so the server knows the tokens but cannot honestly know the bill.

## Security

- **The chat endpoint is member-only.** `POST /api/sessions/:id/assistant/chat` calls
  `assertSessionMember` before it validates the body and before the stream opens, so a caller
  who is not in the session gets a plain `403 NOT_SESSION_MEMBER` rather than an SSE stream
  that opens and then apologises. It matters more here than on a read endpoint: the assistant
  pulls the live board into its prompt, so without this a logged-in stranger could read a
  board by guessing a session id.
- **The prompt is built from server-read state, never from the request body.** The client
  sends only `selectedProposalId` — a fact about its own screen, used purely to annotate a
  proposal the server already loaded. Everything else (session title, active question,
  what is on the board) is read through `getBoardForSession`.

  This used to be the other way round, and it was a real hole: membership let you read the
  board, but the request body let you _rewrite_ it on the way into the model. A member could
  invent proposals, rename the question, or attribute a quote to a teammate, and the
  assistant would repeat it back as fact. `assistantContextSchema` is now narrow enough that
  there is nothing left to forge.

- **The user-supplied base URL is treated as hostile.** It is a URL a logged-in user chooses
  and the server then fetches with the server's network position, which without a guard is a
  proxy into everything the server can reach and the user cannot — cloud metadata at
  169.254.169.254, internal admin panels, the database host.

  Two layers, in `network/`. `assertPublicUrl` runs up front, on save and before a turn, so a
  disallowed host is a clear 400 while the user is still looking at the form. `guardedFetch`
  then validates again _inside the connection's DNS lookup_, which is the layer that actually
  enforces the policy: a hostname can resolve to a public address for the first check and a
  private one microseconds later when the socket opens. Deciding at connect time means the
  address that was approved is the address that gets connected to.

  Local models are the point of BYO, so this is a policy rather than a ban:
  `ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS` is on outside production, which is what lets Ollama on
  `localhost:11434` work. `ipRange.test.ts` is the file to read first — the cases that matter
  are the ones that look public at a glance, like `::ffff:127.0.0.1`.

- API keys are AES-256-GCM encrypted before they touch the database, decrypted into a local
  variable for one call, and never returned by any endpoint. `GET /api/me/llm-config` answers
  with `hasKey: true`, nothing more. A base URL with credentials embedded in it is rejected,
  so a key cannot be smuggled into a field that is stored in clear text and logged.
- **Production refuses to boot without `LLM_KEY_ENCRYPTION_SECRET`.** A server that accepts
  keys it cannot encrypt would either store them in clear text or fail on the first save;
  neither is acceptable once real users are typing real keys.
- Changing `LLM_KEY_ENCRYPTION_SECRET` makes stored keys undecryptable by design; users get a
  "re-enter your key" error rather than a silent failure.
- **Every turn is bounded.** `ASSISTANT_MAX_OUTPUT_TOKENS` caps generation per call, four
  steps cap the tool loop, and there are timeouts on the whole turn, the first chunk, the gap
  between chunks, and each tool call — so a provider that accepts a connection and then goes
  quiet cannot hold an SSE stream and a database connection open indefinitely.
- Every request body and every tool argument is validated with zod before use. Tool output is
  re-validated against the artifact schema (`parseArtifact`) — including the 100 KB ceiling —
  before it can reach the pinboard.
- Closing the panel aborts the in-flight LLM call, so a cancelled answer stops costing money.

## Integration points for other owners

**Session / Pinboard / Voting owners — give the agent more to see.** Register a provider and
its lines land in every prompt for that session; nothing inside the assistant changes:

```ts
import { registerAssistantContextProvider } from '../assistant/index.js';

registerAssistantContextProvider({
  name: 'voting',
  async describe(sessionId) {
    const round = await getOpenRound(sessionId);
    return round ? `A ballot is open with ${round.options.length} options` : null;
  },
});
```

The board itself already goes in without a provider — `context.ts` reads it directly. Use a
provider for anything else the model should know: vote state, presence, the agenda.

There is no frontend half any more, and adding one would be a step backwards: anything the
client can assert, a malicious client can assert falsely.

**Pinboard / Creative Tools owners — F37.** "Propose" calls
`useCreativeTools().submitArtifact(artifact)` — the same path the sticky and drawing editors
use. The assistant does not emit `proposalCreate` itself and does not choose a position or an
author; the board does. That is what makes an AI-suggested proposal indistinguishable from a
hand-made one, and it means changes to the write path need nothing from this module.

`AssistantBubble` is mounted inside `CreativeToolsProvider` in `SessionPinboard`, which is
what puts that context in reach.

**Auth owner — F33 handover.** `llmConfig.service.ts` holds every read/write of
`UserLLMConfig`; move the file into `modules/auth/` and re-export it, or leave it and import
from `modules/assistant/index.js`. Either way `lib/crypto.ts` is shared infrastructure — the
JWT work can use it too.

## Auth

There are no shims left. Both temporary bypasses this module carried while login was being
built — the server's `DEV_USER_ID` and the client's dev-only route bypass — were deleted when
F01/F02 landed, along with `DEV_USER_ID` in `env.ts` and `.env.example`.

The module needed no other change to work with real auth, because it never read identity
itself: `requireAuth` sets `req.userId` and every handler goes through `getUserId(req)`, which
throws a 401 rather than returning `undefined` if the route is ever mounted without the
middleware. `routes.test.ts` mints a real token with the auth module's own `signToken`, so the
integration test exercises `requireAuth` rather than going around it.

## Known gaps

- **`UserLLMConfig` has no `updatedAt`**, although docs/02 §3 lists one. Adding it needs a
  migration, which belongs to whoever owns that table; the code does not depend on it.
- **Nothing surfaces `/api/me/assistant-usage` in the UI yet.** The data is recorded and the
  endpoint is live; the settings page does not read it.
- **`selectedProposalId` is implemented but never sent.** The board has no selection concept
  yet, so the one field the client is still trusted with is always absent. The server side is
  ready for whoever adds selection.
- **No per-turn rate limit.** The step ceiling and token cap bound a single turn, but nothing
  bounds how many turns a user starts. It is their own key and their own bill, so this is a
  cost-control gap rather than a security one — but it is also the last thing standing
  between a bug in the panel and a very large invoice.
- **Generated diagrams carry no title.** The shared `DiagramArtifact` has no `title` field, so
  `create_diagram` no longer asks for one. If the tools owner adds it, re-enable it there.
- **The board's cross-field diagram rules are duplicated here, deliberately.**
  `artifactWriteJsonSchema` is a discriminated union and can only carry field-level rules;
  the cross-field ones (unique ids, live edge endpoints, no self-edges, no repeated directed
  edges) live in `proposalCreateSchema`'s refinement, which does not run until Propose. So
  `parseArtifact` re-checks the structural ones, and `create_diagram` silently drops
  self-edges and duplicate edges. If the tools owner changes those rules, this is the second
  place to change.
- **Web search is unofficial.** DuckDuckGo's HTML endpoint has no API and rate-limits; there is
  an Instant Answer fallback and then a graceful "search unavailable". `webSearch.test.ts` is
  the canary if their markup changes.

## Behaviour eval

Unit tests script the model, so they prove the plumbing and nothing about the model's
judgement — whether it reaches for a tool when it should, and stays quiet when it should not.
That is what `npm run eval --workspace @roundtable/server` checks, against a real provider.

```bash
EVAL_BASE_URL=https://api.groq.com/openai/v1 \
EVAL_API_KEY=gsk_... \
EVAL_MODEL=openai/gpt-oss-120b \
npm run eval --workspace @roundtable/server
```

Pass a substring to run a subset (`… npm run eval -- prose`). Exit code is non-zero if any
case fails, and each failure prints the reason the case exists.

**Not in CI**, on purpose: it costs money, it needs a key, and a provider having a bad
afternoon is not a reason to fail someone's pull request. Run it after editing `prompt.ts` or
a tool description, and before a demo.

Cases live in `eval/cases.ts` and are behaviour regressions rather than hypotheticals — the
sticky-note fixation (every message answered with notes once notes were asked for), searching
the web for something already on the board, and the universal check that a turn never comes
back empty. Credentials come from the environment, not the database, so it needs neither
Postgres nor a login.

## Chat persistence

The transcript is mirrored into `sessionStorage`, keyed per session id, so a refresh does not
throw the thread away (`chatStorage.ts`). `sessionStorage` rather than `localStorage` on
purpose: the chat is private to one person in one sitting, so it should survive a reload and a
navigation and then go away with the tab. Two sessions open in two tabs never see each other's
conversation.

Everything about it is best-effort — private-mode browsers throw on access, quotas run out,
and a transcript written by an older build may not match today's shapes. Every one of those
ends as "start with an empty chat", never as a crash, and entries that fail validation are
dropped individually rather than taking the panel down.

Restoring resolves the in-flight states, because whatever they were waiting for died with the
old page: a half-streamed reply is no longer streaming, a tool left running is marked
interrupted, and a Propose caught mid-flight goes back to idle (a Propose that _finished_
keeps its outcome, so you can still see what you put on the board). Writes are debounced by
half a second, since `setItem` is synchronous and streaming would otherwise serialize the
whole conversation several times a second.

One non-obvious consequence: entry ids carry a random per-page-load prefix. The counter
restarts at zero on reload, so a plain `e1` would collide with the `e1` that just came back
out of storage and React would key two different entries identically.

## Tests

`npm run test --workspace @roundtable/server` — no network and no API key needed. The web side
adds `useAssistantChat.test.ts`, which asserts the transcript reducer is pure by applying every
event twice from the same state, the way React does under StrictMode.

Tests fake the model, not the module that talks to it. `testing/scriptedModel.ts` is a real
`LanguageModelV4` driven by the real `streamText`, so the step loop, tool dispatch and usage
aggregation under test are the ones that ship — a mocked HTTP client would have proved only
that the mock was called.

Two files are worth knowing about:

- `routes.test.ts` runs the real Express router over real HTTP with only the database,
  membership and the model faked. It asserts the docs/06 acceptance criteria — replies arrive
  incrementally, every stream ends with `done` even on error, the API key never comes back
  out — plus the newer one: a request body full of invented proposals changes nothing about
  the prompt. It caught a `req.on('close')` bug that aborted every turn at step zero.
- `network/ipRange.test.ts` is the SSRF guard's decision table. A false "public" there is a
  hole into the private network, so it leans on the cases that look public at a glance.
