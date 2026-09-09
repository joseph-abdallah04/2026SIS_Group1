# RoundTable — AI Assistant Module

> Owner: AI Assistant (docs/06 §7). Covers **F33–F37** plus the two items docs/05 deferred to
> this module: the SSE streaming helper and decrypting LLM keys at call time.

## What it does

Every participant gets a private ideation buddy in a floating bubble at the bottom-right of a
session. Opening it swaps the bubble for the panel — the two are never on screen together, and
the panel grows downward into the space the bubble held, so its top edge does not move. The
panel's own X, or Escape, closes it and brings the bubble back with focus on it. It knows what is happening in the session, can search the web, and can draft sticky
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
                                                         │ assemble session context
                                                         ▼
                                                      agent.ts ──► the user's LLM
                                                         │  ◄── text deltas / tool calls
                                                         │
                                                         ├─ web_search      (DuckDuckGo)
                                                         ├─ create_diagram  (layout here)
                                                         └─ sticky_ideation
                                                         │
                            ◄────── SSE frames ──────────┘
```

The loop runs at most `MAX_STEPS` (4) tool round trips per turn, then answers regardless.

### Files

| File                   | Responsibility                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| `routes.ts`            | HTTP surface, request validation, SSE lifecycle                       |
| `agent.ts`             | The tool-calling loop                                                 |
| `llm.ts`               | OpenAI-compatible client: streaming, tool-call assembly, error shapes |
| `context.ts`           | Session context assembly + the provider registry other modules use    |
| `prompt.ts`            | Persona and operating rules                                           |
| `tools/index.ts`       | The three tools and their JSON schemas                                |
| `tools/webSearch.ts`   | DuckDuckGo HTML scrape + Instant Answer fallback                      |
| `tools/layout.ts`      | Deterministic diagram layout                                          |
| `llmConfig.service.ts` | F33: save / read / test / decrypt provider config                     |
| `../../lib/sse.ts`     | SSE writer (shared infrastructure, reusable)                          |
| `../../lib/crypto.ts`  | AES-256-GCM encrypt/decrypt (shared infrastructure)                   |

Frontend mirrors it under `apps/web/src/features/assistant/`, with the settings form in
`apps/web/src/features/settings/`.

## API

| Method   | Path                               | Notes                                                  |
| -------- | ---------------------------------- | ------------------------------------------------------ |
| `GET`    | `/api/me/llm-config`               | `{ baseUrl, model, hasKey }` — **never the key**       |
| `PUT`    | `/api/me/llm-config`               | `{ baseUrl, apiKey, model }`                           |
| `DELETE` | `/api/me/llm-config`               | forget the config                                      |
| `POST`   | `/api/me/llm-config/test`          | body = config to test, or empty to test the stored one |
| `POST`   | `/api/sessions/:id/assistant/chat` | SSE stream (below)                                     |

### Stream frames

Types live in `packages/shared/src/assistant.ts` (`AssistantStreamEvent`).

```jsonc
{ "type": "message", "role": "assistant", "content": "…" }   // a DELTA — append it
{ "type": "tool", "toolName": "web_search", "status": "running", "args": { … } }
{ "type": "tool-result", "toolName": "web_search", "ok": true, "summary": "5 results", "results": [ … ] }
{ "type": "artifact", "artifactId": "…", "source": "sticky_ideation", "artifact": { "type": "sticky", … } }
{ "type": "error", "message": "…", "code": "LLM_NOT_CONFIGURED" }
{ "type": "done", "reason": "complete" }                      // always last, errors included
```

docs/06 sketched the artifact frame as `{"type":"artifact","type":"sticky",…}` — two `type`
keys, which is not valid JSON. The artifact is nested under `artifact` instead.

## Security

- **The chat endpoint is member-only.** `POST /api/sessions/:id/assistant/chat` calls
  `assertSessionMember` before it validates the body and before the stream opens, so a caller
  who is not in the session gets a plain `403 NOT_SESSION_MEMBER` rather than an SSE stream
  that opens and then apologises. It matters more here than on a read endpoint: the assistant
  pulls the live board into its prompt, so without this a logged-in stranger could read a
  board by guessing a session id.
- API keys are AES-256-GCM encrypted before they touch the database, decrypted into a local
  variable for one call, and never returned by any endpoint. `GET /api/me/llm-config` answers
  with `hasKey: true`, nothing more.
- Changing `LLM_KEY_ENCRYPTION_SECRET` makes stored keys undecryptable by design; users get a
  "re-enter your key" error rather than a silent failure.
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
  name: 'agenda',
  async describe(sessionId) {
    const question = await getActiveQuestion(sessionId);
    return question ? `Active question: ${question.text} (phase: ${question.phase})` : null;
  },
});
```

The frontend half is `getAssistantContext()` in `apps/web/src/pages/index.tsx` — replace its
body with live values from the session store.

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
- **Context is assembled client-side.** `SessionPinboard` builds it from the live board
  (`describeBoard`), which is accurate and free. The server-side provider registry in
  `context.ts` exists for anything the client cannot see — vote state, presence — and is
  currently unused.
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

Unit tests script the provider, so they prove the plumbing and nothing about the model's
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

`npm run test --workspace @roundtable/server` — 74 assistant tests, no network and no API
key needed. The web side adds `useAssistantChat.test.ts`, which asserts the transcript reducer
is pure by applying every event twice from the same state, the way React does under StrictMode.

The one worth knowing about is `routes.test.ts`: it runs the real Express router over real HTTP
with only the database and the LLM provider faked, and asserts the docs/06 acceptance criteria —
replies arrive incrementally, every stream ends with `done` even on error, and the API key never
comes back out. It caught a `req.on('close')` bug that aborted every turn at step zero.
