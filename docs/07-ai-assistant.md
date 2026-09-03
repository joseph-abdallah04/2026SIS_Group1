# RoundTable — AI Assistant Module

> Owner: AI Assistant (docs/06 §7). Covers **F33–F37** plus the two items docs/05 deferred to
> this module: the SSE streaming helper and decrypting LLM keys at call time.

## What it does

Every participant gets a private ideation buddy in a floating bubble at the bottom-right of a
session. It knows what is happening in the session, can search the web, and can draft sticky
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
openssl rand -base64 32
```

Put that value in `LLM_KEY_ENCRYPTION_SECRET`, your Neon connection string in `DATABASE_URL`,
and `DEV_USER_ID=demo-user-alice`. Then:

```bash
npm install
npm run generate     # Prisma client
npm run db:deploy    # apply migrations
npm run db:seed      # demo users + session
npm run dev
```

> The `generate` / `db:*` scripts exist at the root **because `.env` does**. Run them through
> `--workspace @roundtable/server` and the working directory becomes `apps/server`, where the
> Prisma CLI looks for `.env` and finds nothing — every variable reads as undefined. The server
> itself is immune: `src/env.ts` resolves the root `.env` by path rather than by cwd.

Then open <http://localhost:5173/settings>, add a provider (Groq's free tier and a local
Ollama both work), press **Test connection**, and go to
<http://localhost:5173/sessions/demo-session-1>. The bubble is bottom-right.

> `DEV_USER_ID` is a temporary stand-in for login — see [Shims](#shims-to-remove) below.

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

## Shims to remove

Two temporary pieces, each marked in the code. The artifact shapes and the propose event
that used to be listed here are gone — the pinboard and tools modules landed and this module
now imports theirs.

1. **`DEV_USER_ID` auth bypass** (`src/middleware/auth.ts`, `src/env.ts`, `.env.example`).
   Outside production, setting `DEV_USER_ID` makes every request act as that user so the
   assistant works before login exists. Replace the body of `requireAuth` with real JWT
   verification that sets `req.userId`; every caller already reads `getUserId(req)`, so nothing
   else changes.
2. **Client-side auth bypass** (`apps/web/src/lib/auth.tsx`). Login does not exist, so every
   protected route bounced to a page that cannot log anyone in. In dev only, a missing token
   falls through; `import.meta.env.DEV` is false in a production build, so the real gate
   stands there. Delete it with the server shim above.

## Known gaps

- **No membership check on the chat endpoint.** `SessionMember` now exists (main added it), so
  this is newly fixable: any authenticated user can still open a chat scoped to any session id.
  One call in `routes.ts` against the sessions module closes it. Worth doing before the
  assistant sees real board content in a session the caller has not joined.
- **`UserLLMConfig` has no `updatedAt`**, although docs/02 §3 lists one. Adding it needs a
  migration, which belongs to whoever owns that table; the code does not depend on it.
- **Context is assembled client-side.** `SessionPinboard` builds it from the live board
  (`describeBoard`), which is accurate and free. The server-side provider registry in
  `context.ts` exists for anything the client cannot see — vote state, presence — and is
  currently unused.
- **Generated diagrams carry no title.** The shared `DiagramArtifact` has no `title` field, so
  `create_diagram` no longer asks for one. If the tools owner adds it, re-enable it there.
- **Web search is unofficial.** DuckDuckGo's HTML endpoint has no API and rate-limits; there is
  an Instant Answer fallback and then a graceful "search unavailable". `webSearch.test.ts` is
  the canary if their markup changes.

## Tests

`npm run test --workspace @roundtable/server` — 81 tests, no network and no API key needed.

The one worth knowing about is `routes.test.ts`: it runs the real Express router over real HTTP
with only the database and the LLM provider faked, and asserts the docs/06 acceptance criteria —
replies arrive incrementally, every stream ends with `done` even on error, and the API key never
comes back out. It caught a `req.on('close')` bug that aborted every turn at step zero.
