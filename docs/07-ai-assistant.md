# RoundTable — AI Assistant Module

> Owner: AI Assistant (docs/06 §7). Covers **F33–F37** plus the two items docs/05 deferred to
> this module: the SSE streaming helper and decrypting LLM keys at call time.
>
> Checked against `main` at `42283e4` plus the changes on branch `assistant-error-codes`,
> 4 Oct 2026.

## What it does

Every participant gets a private ideation assistant in a collapsible rail on the right of the
board — `BoardRail`, the same chrome as the agenda on the left, only wider so a chat fits. It
starts collapsed to a narrow strip. The chevron opens and closes it, and focus returns to that
control on close. Escape does not close it: the agenda rail does not either, and Escape is
already how dialogs, the studio and text fields step back.

The rail replaced the earlier orb, which grew into a floating glass panel with a `clip-path`
animation, and before that a panel that could be dragged and resized. Both are gone. The glass
rules in `assistant.css` are now the marketing mock's (`AssistantBeat`); `.rt-assistant-dock`
repaints the same classes for the light rail.

- **The conversation survives closing the rail.** `AssistantBubble` owns it, not the panel,
  because the panel unmounts when the rail collapses. An answer that lands while the rail is
  shut puts an unread dot on the strip; a missing provider shows a `!` there instead.
- **It gets out of the way.** The rail collapses when the creative studio opens (the studio is
  a page modal above it). While a voting ballot covers the board it stays as a collapsed,
  `inert` strip, so the board does not change width under the ballot.
- **Set up without leaving the session.** A user with no provider is offered the same form as
  the Settings page, inside the rail (`LlmSettingsForm variant="panel"`).
- **It can see the session and draft for it.** It reads the agenda, the live question, what is
  on the board and what earlier questions were decided; it can search the web; and it drafts
  sticky notes and diagrams the user can drop onto the shared pinboard with one click.

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

Log in at <http://localhost:5173/login> as `alice@example.com` (the seed prints the password).
The seeded session is already ended — it is there as history, not as a board — so to try the
assistant, create one: **New session**, add a question or two, **Open for joining**, then
**Start session**. Starting puts the first question into discussion, so Propose works
straight away. The assistant rail is on the right of the board; open it with the chevron. With
no provider saved, the rail offers the setup form; the same form lives at <http://localhost:5173/settings>. Groq's free
tier and a local Ollama both work — press **Test connection** before saving.

To see that the chat is private and that a proposed card reaches everyone, log in as
`bob@example.com` in a private window and join with the session's code.

**Local models** (`http://localhost:11434/v1` for Ollama) work only when the RoundTable server
runs on the same machine as the model, because the server makes the call, not the browser. They
are also refused in production — see `ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS` below.

**Updating an older checkout:** run `npm install` (the module added `ai`,
`@ai-sdk/openai-compatible` and `undici`) and `npm run db:deploy --workspace @roundtable/server`
(it added the `assistant_turn_usage` table).

## Configuration

| Variable                             | Default                                        | What it does                                                   |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- |
| `LLM_KEY_ENCRYPTION_SECRET`          | none — **production will not boot without it** | AES-256-GCM key for stored API keys. At least 16 characters.   |
| `LLM_KEY_ENCRYPTION_PREVIOUS_SECRET` | unset                                          | Decrypt-only fallback while rotating the secret (see Security) |
| `ASSISTANT_ALLOW_PRIVATE_LLM_HOSTS`  | on outside production, off in it               | May a user's base URL resolve to a private or loopback address |
| `ASSISTANT_MAX_OUTPUT_TOKENS`        | `2048` (max `32000`)                           | Output cap per model call                                      |
| `ASSISTANT_MAX_TURNS_PER_MINUTE`     | `20` (`0` disables, max `120`)                 | Per-user sliding-window limit on turns                         |

Nobody's provider key is ever an environment variable. Keys are typed into the form and
stored encrypted. The one exception is the behaviour eval, which reads `EVAL_*` variables so it
can run without a database.

## How a turn works

```
Chat rail ──POST /api/sessions/:id/assistant/chat──► routes.ts
                                                        │ requireAuth
                                                        │ assertSessionMember        → 403
                                                        │ assertTurnAllowed          → 429
                                                        │ validate body (zod)        → 400
                                                        │ ── SSE stream opens ──
                                                        │ decrypt this user's API key
                                                        │ check the base URL against the SSRF policy
                                                        │ read session context SERVER-side
                                                        ▼
                                                     agent.ts ──► the user's LLM
                                                        │  ◄── text / reasoning / tool calls
                                                        ├─ look_up_session  (sessionLookup.ts)
                                                        ├─ web_search       (DuckDuckGo)
                                                        ├─ create_diagram   (layout here)
                                                        └─ sticky_ideation
                                                        │
                           ◄────── SSE frames ──────────┘
                                                        │
                                                        └─► usage.service.ts (after the stream closes)
```

The loop runs at most `MAX_STEPS` (4) model round trips per turn, then answers regardless.
The call has budgets for the whole turn (120 s), the first chunk (30 s), each gap between
chunks (30 s) and each tool call (20 s; web search has its own 12 s), and transient provider
failures get two retries.

### The Vercel AI SDK does the plumbing

The provider call, SSE parsing, tool-call reassembly, the multi-step loop, retries and
timeouts are the [AI SDK](https://ai-sdk.dev)'s (`ai` + `@ai-sdk/openai-compatible`), not
ours. What is still ours is everything the SDK has no opinion about: which hosts we are
willing to connect to, what to show when a model answers with nothing, and how a turn maps
onto the frames the rail renders.

That division is why `agent.ts` is a `switch` over stream parts rather than a hand-rolled
loop, and why there is no longer an `llm.ts`. The prompt, the tool definitions and their zod
schemas, the diagram layout, the frame contract and artifact validation stay hand-written:
those are product decisions, not plumbing.

### Providers that refuse the model's own reasoning

When a reasoning model calls a tool, the loop sends that step back with the tool's result, and
`@ai-sdk/openai-compatible` writes the step's reasoning onto that assistant message as
`reasoning_content`. DeepSeek- and Kimi-style thinking models use it to carry a turn across tool
calls. Groq's gpt-oss refuses the whole request over it, which put this under every card it made:

```text
'messages.2' : for 'role:assistant' the following must be satisfied
[('messages.2' : property 'reasoning_content' is unsupported)]
```

Nothing in a base URL says which kind a provider is, so `network/reasoningReplay.ts` learns. A
request goes out as the SDK built it; if the provider refuses `reasoning_content` by name, the
same request goes again without it. If that retry succeeds, the host **and model** are
remembered for the life of the process so later requests skip the refused attempt. The model
matters because one host can serve many (OpenRouter is a built-in preset), and a thinking model
beside a refusing one still needs the field. Only a successful retry counts, because a 400 can
mention the field for other reasons, such as a provider that requires it. A refused request is
turned away before generation starts, so the retry costs a round trip, not tokens. It wraps the
SSRF-guarded fetch, so the resend is guarded too, and it covers chat, Test connection and the
eval alike.

### Small models, and what happens when a model says nothing

A lot of this module exists because people bring small local models, which behave differently
from hosted ones.

**Sticky requests force the tool.** If the message mentions sticky notes or post-its,
`artifactToolForMessage` forces `sticky_ideation` on the first step and offers no tools after
it. Only stickies: forcing `create_diagram` turned diagrams that small models managed
perfectly well on their own into dead turns.

**Silence is recovered, in this order:**

1. **The forced sticky call was ignored** (`ToolChoiceViolationError`). One extra call, with
   no tools, asks for the ideas as JSON (`stickyNotesFromJsonReply`). Whatever comes back is
   parsed — as JSON, or failing that line by line — and put through the same
   `runStickyIdeation`, so the cards are validated exactly like a real tool call.
2. **Cards on screen but no words.** The rail gets a one-line lead-in ("Here they are…").
3. **No words at all, and not because of the token limit.** One more call with the tools
   removed (`replyWithoutTools`), streamed straight to the rail. Small models go quiet under
   the full tool schema far more often than they have nothing to say.
4. **Still nothing.** A plain explanation, naming the token limit when that was the cause.

Separately, a turn that hits the step ceiling while the model still wants tools says it
stopped, and ends with `done.reason = 'max-steps'`.

Steps 1 and 3 are extra model calls. They are not billed and step 1 is not time-bounded —
see [Known issues](#known-issues).

### Files

Server, under `apps/server/src/modules/assistant/`:

| File                           | Responsibility                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `index.ts`                     | Public surface: the router, the F33 service functions, the context-provider registry    |
| `routes.ts`                    | HTTP surface: membership, rate limit, validation, SSE lifecycle, recording usage        |
| `agent.ts`                     | One `streamText` call mapped onto our frames; forced sticky tool; recovery; token tally |
| `provider.ts`                  | Builds the model from user credentials; "Test connection"; provider error messages      |
| `context.ts`                   | Server-side session context + the provider registry other modules use                   |
| `sessionLookup.ts`             | Read side of `look_up_session`: agenda, proposals per question, settled answers         |
| `prompt.ts`                    | Persona, operating rules, chat recap, stopped-turn note                                 |
| `untrusted.ts`                 | `<untrusted>` wrappers for quoted data                                                  |
| `rateLimit.ts`                 | In-memory per-user turn limiter                                                         |
| `usage.service.ts`             | Per-turn token rows and the per-model summary                                           |
| `llmConfig.service.ts`         | F33: save / read / test / decrypt provider config; re-wrap after a secret rotation      |
| `tools/index.ts`               | The four tools: pure `run*` functions plus their SDK wrappers                           |
| `tools/webSearch.ts`           | DuckDuckGo HTML scrape + Instant Answer fallback, through the SSRF guard                |
| `tools/layout.ts`              | Deterministic diagram layout                                                            |
| `network/guardedFetch.ts`      | SSRF guard — refuses to open a socket to a disallowed address                           |
| `network/ipRange.ts`           | Public vs private address classification                                                |
| `network/reasoningReplay.ts`   | Resends without replayed reasoning to providers that refuse it (Groq)                   |
| `testing/scriptedModel.ts`     | A `LanguageModelV4` that says what a test tells it to                                   |
| `eval/cases.ts`, `eval/run.ts` | Behaviour eval against a live provider                                                  |
| `../../lib/sse.ts`             | SSE writer (shared infrastructure)                                                      |
| `../../lib/crypto.ts`          | AES-256-GCM encrypt/decrypt with a rotation fallback (shared infrastructure)            |

Web, under `apps/web/src/features/assistant/`:

| File                                                            | Responsibility                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `AssistantBubble.tsx`                                           | The rail (`BoardRail`); owns the conversation, the unread dot and config check |
| `AssistantPanel.tsx`                                            | Inside the rail: transcript, composer, artifact cards, inline provider setup   |
| `AssistantErrorNotice.tsx`                                      | A failed turn: title, next step, error code, and the provider's words          |
| `useAssistantChat.ts`                                           | Transcript reducer, send/stop, and the `history` each turn sends               |
| `chatStorage.ts`                                                | `sessionStorage` mirror of the transcript                                      |
| `api.ts`                                                        | Endpoint client; the chat call is `fetch` plus manual SSE parsing              |
| `ArtifactCard.tsx`, `DiagramPreview.tsx`                        | A drafted artifact and its Propose button; diagram preview at rail scale       |
| `ToolActivity.tsx`, `AgentActivity.tsx`, `assistantActivity.ts` | Tool chips, search sources, the one-line live status                           |
| `../settings/LlmSettingsForm.tsx`                               | The provider form, shared by Settings and the rail                             |

The contract between the two — request schemas, stream frames, artifact validation — is
`packages/shared/src/assistant.ts`.

## API

| Method   | Path                               | Notes                                                                                                        |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/me/llm-config`               | `{ baseUrl, model, hasKey }` — **never the key**                                                             |
| `PUT`    | `/api/me/llm-config`               | `{ baseUrl, model, apiKey? }` — omit `apiKey` to keep the stored one                                         |
| `DELETE` | `/api/me/llm-config`               | forget the config                                                                                            |
| `POST`   | `/api/me/llm-config/test`          | body = config to test (key optional), or empty to test the stored one; a failure carries `code` and `detail` |
| `GET`    | `/api/me/assistant-usage`          | token spend per model, `?days=` (default 30, max 365)                                                        |
| `POST`   | `/api/sessions/:id/assistant/chat` | 403 / 429 / 400 as plain JSON; otherwise an SSE stream (below)                                               |

The optional key on `PUT` and `test` exists so that changing the model does not mean pasting
the secret again. It also has a security cost — see [Known issues](#known-issues).

### Stream frames

Types live in `packages/shared/src/assistant.ts` (`AssistantStreamEvent`).

```jsonc
{ "type": "message", "role": "assistant", "content": "…" }   // a DELTA — append it
{ "type": "status", "phase": "thinking" }                    // only from models with a reasoning channel
{ "type": "tool", "toolName": "web_search", "status": "running", "args": { … } }
{ "type": "tool-result", "toolName": "web_search", "ok": true, "summary": "5 results", "results": [ … ] }
{ "type": "artifact", "artifactId": "…", "source": "sticky_ideation", "artifact": { "type": "sticky", … } }
{ "type": "error", "message": "…", "code": "LLM_REQUEST_REJECTED", "detail": "HTTP 400 — …" }
{ "type": "done", "reason": "complete", "usage": { "inputTokens": 250, … } }  // always last
```

docs/06 sketched the artifact frame as `{"type":"artifact","type":"sticky",…}` — two `type`
keys, which is not valid JSON. The artifact is nested under `artifact` instead.

The reasoning text itself never reaches the rail. It is the model's scratchpad, so the rail
only learns that the model is thinking.

`usage` is present only when the provider reported numbers, and each field inside it is
independently optional. A missing count means **not reported**, never zero: plenty of
OpenAI-compatible servers report nothing, and a cost display that silently reads 0 is worse
than one that says it does not know.

## Errors and error codes

Every error the rail shows has a code. The codes, and the words the rail uses for each, live in
one catalog: `ASSISTANT_ERRORS` in `packages/shared/src/assistant.ts`. Each entry has a `title`
(what went wrong) and a `hint` (what to do next), written for someone in the middle of a
session. The code is the stable part — safe to search logs and the codebase for, and to quote
in a bug report. The words can change.

An error frame carries three things:

- `message` — the catalog's title and hint as one pair of sentences, for anything that shows a
  single line (Test connection, logs, an older client).
- `code` — the catalog key.
- `detail` — what the provider or check actually said, verbatim and trimmed. The rail folds it
  under **Details** instead of leading with it. It used to _be_ the message, which is how
  `'messages.2' : for 'role:assistant' the following must be satisfied` ended up in front of
  people.

When a turn fails after its tool already produced cards, the notice says those cards are
complete: the diagram was fine, and only the model's reply after it failed.

Where each code comes from:

- **Setup, checked before the model is called** — `LLM_NOT_CONFIGURED`,
  `LLM_KEY_UNDECRYPTABLE`, `LLM_ENCRYPTION_UNCONFIGURED`, `LLM_URL_INVALID`,
  `LLM_URL_PRIVATE_HOST`, `LLM_URL_UNRESOLVABLE`.
- **What the provider answered** (`describeProviderError`) — `LLM_AUTH_FAILED` (401/403),
  `LLM_QUOTA_EXCEEDED` (402, or wording that says the account is out of credit — OpenAI reports
  that as a 429), `LLM_TOOLS_UNSUPPORTED` (a 4xx saying the model cannot call tools; OpenRouter
  answers that with a 404), `LLM_MODEL_NOT_FOUND` (any other 404), `LLM_RATE_LIMITED` (429),
  `LLM_CONTEXT_TOO_LONG` (413, or a 4xx about context length), `LLM_REQUEST_REJECTED` (any
  other 400/422 — the provider refused what we sent), `LLM_PROVIDER_ERROR` (5xx),
  `LLM_HTTP_ERROR` (any other status), `LLM_TIMEOUT`, `LLM_UNREACHABLE` (DNS or connection
  failure), `LLM_FAILED` (anything else).
- **RoundTable, before the stream opens** — `UNAUTHENTICATED`, `NOT_SESSION_MEMBER`,
  `ASSISTANT_RATE_LIMITED`, `VALIDATION_FAILED`, `INTERNAL`, as plain JSON.
- **The browser** (`api.ts`) — `NETWORK_ERROR` (the server is unreachable, including a gateway
  error from the dev proxy when the API server is down), `STREAM_INTERRUPTED` (the stream
  stopped before its `done` frame — in development, usually the server restarting on a file
  save), `STREAM_EMPTY`, and `REQUEST_FAILED` for any other failure that arrived without a code.

The status alone cannot tell several of these apart, so `describeProviderError` also reads the
provider's own wording. `provider.test.ts` is a table of provider wordings (Groq, OpenAI,
OpenRouter, Ollama, vLLM) and the code each should get.

**Adding a code:** add it to `ASSISTANT_ERRORS` with a title and a hint; raise it with
`assistantErrorMessage(code)` as the message and anything specific as the `ApiError`'s
`details`; and if a provider's wording decides it, add that wording to `provider.test.ts`. A
code the rail does not know still renders, with a generic title, the server's message and the
code.

## Cost

Each turn writes one `assistant_turn_usage` row: tokens in and out, reasoning and cached
portions where the provider separates them, how many model round trips it took, how long it
ran, and how it ended. Token columns are nullable for the reason above. The provider is asked
to include usage in streamed replies (`includeUsage: true`) — without that, most omit it.

A turn that burned tokens and then failed is still recorded — usage leaves `runAssistantTurn`
through an `onUsage` callback rather than its return value, so an exception cannot lose it.
The recovery calls are the exception; see [Known issues](#known-issues).

There is deliberately no dollar figure. Users bring their own provider and their own
negotiated pricing, so the server knows the tokens but cannot honestly know the bill.

## Security

- **The chat endpoint is member-only.** `POST /api/sessions/:id/assistant/chat` calls
  `assertSessionMember` before anything else, so a caller who is not in the session gets a
  plain `403 NOT_SESSION_MEMBER` rather than an SSE stream that opens and then apologises. It
  matters more here than on a read endpoint: the assistant pulls the live board into its
  prompt, so without this a logged-in stranger could read a board by guessing a session id.
- **Turns are rate-limited per user.** `ASSISTANT_MAX_TURNS_PER_MINUTE` is checked right after
  membership, as a plain `429 ASSISTANT_RATE_LIMITED`. The user pays their own provider, but
  the server still makes the search requests and holds a stream open for every turn. The
  window lives in memory, so it is per server process and resets on restart.
- **The prompt is built from server-read state, never from the request body.** The client
  sends only `selectedProposalId` — the card the user last clicked — used purely to point at
  a proposal the server already loaded. A made-up id matches nothing and adds nothing to the
  prompt. The session title, agenda, live question and board are read server-side
  (`getBoardForSession`, `readAgenda`).

  This used to be the other way round, and it was a real hole: membership let you read the
  board, but the request body let you _rewrite_ it on the way into the model. A member could
  invent proposals, rename the question, or attribute a quote to a teammate, and the
  assistant would repeat it back as fact. `assistantContextSchema` is now narrow enough that
  there is nothing left to forge.

- **Quoted data is fenced.** Question text, agenda lines, card summaries and author names,
  `look_up_session` output, search results, the chat recap and the stopped-turn excerpt are
  wrapped in `<untrusted>` tags, with nested tags stripped so quoted text cannot close the
  fence early. The rules tell the model never to follow instructions inside them. That is a
  mitigation, not a guarantee — a model can still be talked round — which is one more reason
  the assistant has no tool that writes anything.
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
  `localhost:11434` work. Web search goes through the same guard with private hosts always
  refused, and search links that are not `http(s)` are dropped before they can reach the
  sources list. `ipRange.test.ts` is the file to read first — the cases that matter are the
  ones that look public at a glance, like `::ffff:127.0.0.1`.

- API keys are AES-256-GCM encrypted before they touch the database
  (`v1.<iv>.<tag>.<ciphertext>`, base64url), decrypted into a local variable for one call,
  and never returned by any endpoint. `GET /api/me/llm-config` answers with `hasKey: true`,
  nothing more. A base URL with credentials embedded in it is rejected, so a key cannot be
  smuggled into a field that is stored in clear text and logged.
- **Production refuses to boot without `LLM_KEY_ENCRYPTION_SECRET`.** A server that accepts
  keys it cannot encrypt would either store them in clear text or fail on the first save;
  neither is acceptable once real users are typing real keys.
- **Rotating the secret.** Set the new value as `LLM_KEY_ENCRYPTION_SECRET` and move the old one
  to `LLM_KEY_ENCRYPTION_PREVIOUS_SECRET`. Reads try the current secret, then the previous
  one, and a key that only the previous one could read is re-encrypted under the current one
  there and then. Re-encryption is lazy — it happens when that user's key is next used — and
  there is no batch job, so dropping the previous secret strands everyone who has not used the
  assistant since the rotation: they get "re-enter your key". Changing the secret _without_
  keeping the previous one makes every stored key unreadable, by design, with the same error
  rather than a silent failure.
- **Every turn is bounded.** `ASSISTANT_MAX_OUTPUT_TOKENS` caps generation per call, four
  steps cap the tool loop, and the budgets above cover the whole turn, the first chunk, the
  gap between chunks and each tool call — so a provider that accepts a connection and then
  goes quiet cannot hold an SSE stream and a database connection open indefinitely. (One
  recovery call escapes these bounds; see [Known issues](#known-issues).)
- Every request body and every tool argument is validated with zod before use. Tool output is
  re-validated with `parseArtifact` — the same per-kind write schemas the board applies on
  Propose, plus the 100 KB ceiling — before it can reach the pinboard. It also refuses an
  `image` from the agent: an image is something a person brings to the board, and a model
  asked for one would be inventing its bytes.
- Closing the rail aborts the in-flight LLM call, so a cancelled answer stops costing money.

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

The board and the agenda already go in without a provider — `context.ts` reads both
directly — and `look_up_session` reads proposals and settled answers on demand, through the
sessions, pinboard and voting modules' public surfaces. Use a provider for anything else the
model should know: an open ballot, presence, timers. A provider that throws is logged and
skipped; it cannot break a turn.

There is no frontend half, and adding one would be a step backwards: anything the client can
assert, a malicious client can assert falsely.

**Pinboard / Creative Tools owners — F37.** "Propose" calls
`useCreativeTools().proposeArtifact(artifact)`. It shares the board's side of the editors'
write path — where the card lands (`findOpenProposalPosition`) and what a rejection says — but
not the editor's one-write-per-open-tool lock or its shared status: each chat card tracks its
own sending, proposed and failed state, and sharing the editor's lock once meant one Propose
per page load. The assistant never emits `proposalCreate` itself and never chooses a position
or an author, so an AI-suggested proposal is indistinguishable from a hand-made one.

Propose is enabled only while the session is live and the question is in discussion, and the
card says why when it is not. A card marked proposed unlocks again if its card is deleted from
the board (`syncProposedWithBoard`).

`SessionPinboard` renders `AssistantBubble` inside `CreativeToolsProvider` and hands it to
`PinboardCanvas` as the `assistant` rail, which is what puts that context in reach.

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

API keys are per user: every participant brings their own provider. There is no
per-session key and no key supplied by the session leader.

## Known issues

Both found in a review of `main` on 16 Sep 2026. Neither is fixed yet.

### Recovery calls are not billed, and one has no time or output limit

Recovery steps 1 and 3 above run **after** the turn has handed its usage to `onUsage`, so the
tokens they spend never reach `assistant_turn_usage`. The forced-sticky case is worse: the
`ToolChoiceViolationError` is thrown before the stream reports the first call's usage, so
that call's tokens are lost too.

Measured with `scriptedModel`:

| Scenario                              | Model calls | Actually spent  | Recorded                          |
| ------------------------------------- | ----------- | --------------- | --------------------------------- |
| Silent reply → retry without tools    | 2           | 190 in / 5 out  | 100 in / 0 out, 1 step            |
| Forced sticky ignored → JSON recovery | 2           | 150 in / 22 out | nothing: 0 steps, no token counts |
| Forced sticky, every call empty       | 3           | 210 in / 0 out  | nothing: 0 steps, no token counts |

A row with no counts is then reported by `/api/me/assistant-usage` as a turn whose provider
reported nothing, which is not what happened. `durationMs` also stops before the recovery
calls. In the worst case — a forced sticky turn where every call comes back empty — one turn
makes three model calls and records none of them.

`stickyNotesFromJsonReply` also passes no `timeout` and no `maxOutputTokens`, so that call is
bounded only by the user closing the rail and by the provider's own output limit.
`replyWithoutTools` passes both, but starts a fresh 120 s budget rather than sharing the turn's.

This partly reopens findings 2 and 4 in `docs/AI_AGENT_REVIEW.md`, which were closed before
the recovery calls existed. **Fix direction:** add each recovery call's usage to the tally,
report usage once, after the last call, and give the JSON recovery the same `timeout` and
`maxOutputTokens` as everything else — ideally one deadline for the whole turn.

### A stored key can be sent to a new host

`PUT /api/me/llm-config` and `POST /api/me/llm-config/test` both accept a new `baseUrl` with
no `apiKey`, and then use the stored key against that URL. The SSRF guard only refuses
private addresses, so any public host is accepted. Anyone holding a user's session token —
valid for 7 days — can therefore point "Test connection" at a server they control and read
the provider key from the `Authorization` header it receives. "The key never comes back out"
holds for the API's responses, but not against a stolen session.

This has been the behaviour since the module's first commit (`1a41860`); it exists so that
changing only the model does not mean pasting the key again. **Fix direction:** reuse the
stored key only when the new base URL has the same origin as the stored one, and require the
key again whenever the host changes.

## Known gaps

- **Chat history is still client-supplied** (review finding 3). Each turn the browser sends
  back up to 20 prior messages, so there is no server-side audit trail, no continuity across
  devices, and a client can put words in the assistant's mouth — in its own chat only. The
  recap in the prompt is fenced as untrusted; the message list itself is not.
- **No pricing or quota** on top of the token rows (the rest of review finding 2).
- **No KMS or envelope encryption** — one app-wide secret, now with rotation (the rest of
  review finding 8).
- **The session title is not fenced.** It reaches the prompt as `Session focus: …`, and it is
  the one piece of text written by another user that is not wrapped in `<untrusted>`.
- **`UserLLMConfig` has no `updatedAt`**, although docs/02 §3 lists one. Adding it needs a
  migration, which belongs to whoever owns that table; the code does not depend on it.
- **Nothing surfaces `/api/me/assistant-usage` in the UI yet.** The data is recorded and the
  endpoint is live; neither the settings page nor the rail reads it.
- **Generated diagrams carry no title.** The shared `DiagramArtifact` has no `title` field, so
  `create_diagram` does not ask for one. If the tools owner adds it, re-enable it there.
- **One board rule is mirrored rather than shared.** `parseArtifact` runs the board's own write
  schemas, so validation cannot drift. But `create_diagram` quietly drops self-edges and
  repeated directed edges (`dropRedundantEdges`) instead of failing the call, because models
  write them routinely. If the tools owner changes that rule, this is the second place to
  change.
- **Web search is unofficial.** DuckDuckGo's HTML endpoint has no API, no relevance ranking,
  rate-limits, and breaks when their markup changes. There is an Instant Answer fallback and
  then a graceful "search unavailable"; `webSearch.test.ts` is the canary. The plan is caching,
  a real search API, and a `read_url` tool so the agent can open a result instead of relying
  on its snippet.

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

The eight cases in `eval/cases.ts` are behaviour regressions rather than hypotheticals — the
sticky-note fixation (every message answered with notes once notes were asked for), searching
the web for something already on the board, and the universal check that a turn never comes
back empty. Credentials come from the environment, not the database, so it needs neither
Postgres nor a login — which also means there is no session to read, so `look_up_session` is
not offered during an eval.

## Chat persistence

The transcript is mirrored into `sessionStorage` under `rt_assistant_chat:<userId>:<sessionId>`
(`chatStorage.ts`), so a refresh does not throw the thread away. `sessionStorage` rather than
`localStorage` on purpose: the chat is private to one person in one sitting, so it should
survive a reload and a navigation and then go away with the tab. The user id is in the key so
that a second person using the same tab never inherits the last transcript, and logging in or
out wipes every assistant key in the tab (`clearAllChats`, called from `lib/auth.tsx`). Keys
from older builds, which had no user id, are dropped rather than read.

Everything about it is best-effort — private-mode browsers throw on access, quotas run out,
and a transcript written by an older build may not match today's shapes. Every one of those
ends as "start with an empty chat", never as a crash, and entries that fail validation are
dropped individually rather than taking the rail down. A stored transcript is capped at
256 KB; the oldest entries go first.

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

`npm run test --workspace @roundtable/server` and `npm run test --workspace @roundtable/web` —
no network and no API key needed. CI runs both, after lint, typecheck and build.

Tests fake the model, not the module that talks to it. `testing/scriptedModel.ts` is a real
`LanguageModelV4` driven by the real `streamText`, so the step loop, tool dispatch and usage
aggregation under test are the ones that ship — a mocked HTTP client would have proved only
that the mock was called.

Five files are worth knowing about:

- `routes.test.ts` runs the real Express router over real HTTP with only the database,
  membership and the model faked. It asserts the docs/06 acceptance criteria — replies arrive
  incrementally, every stream ends with `done` even on error, the API key never comes back
  out — plus the newer ones: a request body full of invented proposals changes nothing about
  the prompt, and the agenda reaches the prompt unasked. It caught a `req.on('close')` bug
  that aborted every turn at step zero.
- `reasoningReplay.test.ts` drives the real `@ai-sdk/openai-compatible` provider through
  `createAssistantModel` with only the network faked. It is the one test that sees an actual
  request body, which is where the Groq refusal lived; it failed on the old code with the
  exact error people saw.
- `provider.test.ts` is the error classification table: provider wordings in, codes out.
- `network/ipRange.test.ts` is the SSRF guard's decision table. A false "public" there is a
  hole into the private network, so it leans on the cases that look public at a glance.
- `useAssistantChat.test.ts` applies every event twice from the same state, the way React
  does under StrictMode. Calling the reducer once is exactly what hid the bug that made the
  assistant look completely mute: an updater that mutated a ref. **Every state updater in this
  feature must be a pure function of `prev`.**

**Expected noise:** a passing server run prints a `ToolChoiceViolationError`, a few
`Cannot destructure property 'stream'` errors and some "database is down" warnings. The AI
SDK logs stream errors by default, and several tests deliberately trigger error paths. The
`stream` errors come from tests whose scripted model runs out of replies when the agent makes
a recovery call — the recovery treats that as "nothing came back", which is the path those
tests are checking.

Three limits worth being honest about. Unit tests passed while the old draggable panel had
only one working resize handle — the bug was paint order, and jsdom has no layout. The recovery
calls above passed every test while going unbilled, because no test checked a recovery call's
usage. And the Groq refusal shipped past 140 passing tests, because the scripted model never
builds a request body — the wire format was never under test until `reasoningReplay.test.ts`.
