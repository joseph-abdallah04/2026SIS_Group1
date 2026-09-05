# RoundTable — 7-Person Team Work Split

**Goal:** Each engineer owns 1 module end-to-end (backend + frontend + database). Work in parallel with minimal blocking.

**Principle:** When two modules touch the same feature, one is the **primary owner** (full control), the other integrates via a clean API.

---

## Navigation

- **[Quick Reference](#-quick-reference)** — Table of all 7 modules, features, files
- **[Module Ownership Map](#-module-ownership-map)** — Visual split of frontend/backend/database
- **[Module Details](#-auth--profile-owner)** — Full specs for each of 7 owners
- **[Coordination Points](#-coordination-points)** — Type contracts, migrations, events, phase machine
- **[Independence Proof](#-independence-proof)** — Dependency matrix (no blockers)
- **[Git Workflow](#-git-workflow)** — Branch naming, PR process, merge strategy
- **[Jira Board Setup](#-jira-board-setup)** — Epic structure, story format, columns
- **[Example Week 1](#-example-week-1-timeline)** — Parallel work plan (7 teams, 0 blockers)
- **[Decision Tree](#-decision-tree-when-unsure)** — Escalation rules for edge cases
- **[Definition of Done](#-definition-of-done-per-feature)** — Checklist for completed work

---

## Quick Reference

| #   | Module                | Owner Focus                    | Features         | Primary Files          | Database Tables                        |
| --- | --------------------- | ------------------------------ | ---------------- | ---------------------- | -------------------------------------- |
| 1   | **Auth + Profile**    | User identity, LLM settings    | F01–F03, F33     | `auth/`, `settings/`   | `User`, `UserLLMConfig`                |
| 2   | **Session Lifecycle** | Create/join/phase progression  | F04–F10, F24–F26 | `sessions/`, `agenda/` | `Session`, `Question`, `SessionMember` |
| 3   | **Pinboard Core**     | Proposal CRUD, reactions       | F14–F18          | `pinboard/`            | `Proposal`, `Reaction`                 |
| 4   | **Creative Tools**    | Sticky/drawing/diagram editors | F19–F22, F23     | `tools/`, `toolbar/`   | _(none — artifacts in JSON)_           |
| 5   | **Voting + Summary**  | Vote rounds, winner tally      | F27–F32          | `voting/`, `summary/`  | `VotingRound`, `Vote`, `Answer`        |
| 6   | **Voice**             | LiveKit integration            | F11–F13          | `voice/`               | _(none — LiveKit-managed)_             |
| 7   | **AI Assistant**      | LLM chat + tool-calling        | F34–F37          | `assistant/`           | _(none — config in Auth)_              |

---

## Module Ownership Map

| Frontend                                                   | Backend                                                                  | Database                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| Auth: `auth/` (signup, login), `settings/` (profile)       | `auth/` (internal service functions, JWT, password hash, middleware)     | `User`, `UserLLMConfig`                |
| Session: `sessions/` (create/join), `agenda/` (phases)     | `sessions/` (internal service functions, phase logic, socket broadcasts) | `Session`, `Question`, `SessionMember` |
| Pinboard: `pinboard/` (canvas), `Proposal.tsx` (reactions) | `pinboard/` (internal service functions, proposal CRUD, reactions)       | `Proposal`, `Reaction`                 |
| Tools: `tools/` (editors), `toolbar/` (buttons)            | [none - validation only]                                                 | [none]                                 |
| Voting: `voting/` (ballot UI), `summary/` (view/export)    | `voting/` (internal service functions, vote logic), `summary/` (tally)   | `VotingRound`, `Vote`, `Answer`        |
| Voice: `voice/` (mute, presence)                           | `voice/` (internal service functions, token issuance)                    | [none]                                 |

## Auth + Profile Owner

**Features:** F01–F03, F33  
**Responsibility:** Signup, login, profile, LLM provider configuration

### Code ownership

```
Backend:  apps/server/src/modules/auth/
Frontend: apps/web/src/features/auth/
          apps/web/src/features/settings/
```

### Database tables

```
User (email, passwordHash, displayName, createdAt)
UserLLMConfig (userId, baseUrl, apiKeyEncrypted, model, updatedAt)
```

### API surface

```
POST   /api/auth/signup               → { token: string }
POST   /api/auth/login                → { token: string }
GET    /api/auth/me                   → { user: User }
PATCH  /api/users/me                  → { displayName } → User
PUT    /api/me/llm-config             → { baseUrl, apiKey, model } → { ok }
GET    /api/me/llm-config             → { baseUrl, model } (no key)
POST   /api/me/llm-config/test        → { ok: boolean, error? }
```

### Dependencies

- [x] No dependencies - start immediately
- [x] All other modules depend on `User` type (shared)

### Notes

- Coordinate **LLM config schema** with assistant owner before starting
- Password hash via bcrypt; no plaintext storage

### Also owns (deferred from setup)

Setup decided how security works but deliberately did not build it — implementation lands in your stories:

1. **Password hashing:** on signup, hash passwords with bcrypt (10+ rounds) before storing; never store or log a plain-text password anywhere.
2. **JWT login tokens:** on signup/login, issue a JWT (a signed token that proves who the user is) — signed with `JWT_SECRET`, valid for 7 days, payload `{ userId, iat, exp }`.
3. **Real auth middleware:** replace the placeholder middleware (which currently rejects everything with 401) so protected API routes require an `Authorization: Bearer <token>` header and verify the JWT before handling the request.
4. **Input validation:** check every mutating endpoint's body against zod schemas from `@roundtable/shared`; bad input gets a 400 response with details.

**Acceptance criteria:**

- Database contains password hashes only — no plain text.
- Missing, expired, or tampered tokens → 401 with the standard `{ error, code }` JSON shape; valid token reaches the route.
- GET llm-config responses return `baseUrl` + `model` only — never key material.

---

## Session Lifecycle Owner

**Features:** F04–F10, F24–F26  
**Responsibility:** Create sessions, invite members, phase state machine (lobby → discussion → voting → results)

### Code ownership

```
Backend:  apps/server/src/modules/sessions/
Frontend: apps/web/src/features/sessions/
          apps/web/src/features/agenda/
```

### Database tables

```
Session (id, code, title, leaderId, status, createdAt, endedAt)
Question (id, sessionId, text, position, phase)
SessionMember (sessionId, userId, joinedAt) — who's in this session
```

### API surface

```
POST   /api/sessions                   → { session, inviteCode }
GET    /api/sessions/mine              → { sessions: Session[] }
GET    /api/sessions/:id               → { session, questions, members }
PATCH  /api/sessions/:id               → { title? } → Session
DELETE /api/sessions/:id               → { ok }
POST   /api/sessions/:id/join          → { code } → { ok }
```

### Socket events

```
# Client → Server (leader-only)
session:start              → { sessionId }
phase:advance              → { questionId, phase }
question:skip              → { questionId }

# Server → Client (broadcast)
session:state               → Full snapshot (on join)
session:phase              → { questionId, phase } (on leader action)
session:skipped            → { questionId }
member:joined              → { user: User }
```

### Socket events (outbound)

```
session:state               → Full snapshot (on join)
session:phase              → { questionId, phase } (on leader action)
session:skipped            → { questionId }
member:joined              → { user: User }
```

### Dependencies

- [x] Depends on `User` type from auth (shared)

- [!] `Question.status` values (`pending`, `discussion`, `voting`, `answered`, `skipped`) must be centrally defined as `QuestionStatus` in `packages/shared` (see docs/02 §3) — supersedes any earlier `SessionPhase`/`phase` wording in this doc
- Other modules consume status events; don't drive them

### Notes

- Session leader is **not a type** — the person who creates/starts a session becomes leader for that session
- Invite codes are auto-generated 6-char alphanumeric; never expire (one-time use per code)

### Also owns (deferred from setup)

The socket server currently accepts any connection and only logs connect/disconnect — there is no gateway yet. You own it:

1. **Socket authentication:** when a client connects, verify the JWT they pass in the handshake (`auth.token`); disconnect sockets without a valid token.
2. **Room management:** on join, put each authenticated socket into a room named after the session (`session:<id>`) so broadcasts only reach that session's members; handle clean leave/disconnect.
3. **Event routing:** receive `member:join`, broadcast `memberJoined`/`memberLeft` to the room, and send the joining user the full `session:state` snapshot as an ack. Later module owners plug their handlers into this same gateway.

**Acceptance criteria:**

- Socket without valid JWT is disconnected during handshake.
- Two clients in the same session: one joins → the other receives `memberJoined`; joiner's ack contains full state.
- A client cannot receive events for a session it hasn't joined.

---

## Pinboard Core Owner

**Features:** F14–F18  
**Responsibility:** Proposal CRUD, reactions, canvas real-time sync, right-click context menu

### Code ownership

```
Backend:  apps/server/src/modules/pinboard/
Frontend: apps/web/src/features/pinboard/
          apps/web/src/components/Proposal.tsx
          apps/web/src/components/ProposalContextMenu.tsx
```

### Database tables

```
Proposal (id, questionId, authorId, type, artifactJson, x, y, extendsProposalId, createdAt, deletedAt)
Reaction (id, proposalId, userId, emoji) — unique(proposalId, userId, emoji)
```

### Socket events

```
# Client → Server (validated: membership + phase + ownership)
proposal:create            → { type, artifactJson, x, y, extendsProposalId? }
proposal:update            → { id, artifactJson?, x?, y? }        (author-only)
proposal:delete            → { id }                               (author or leader)
reaction:toggle            → { proposalId, emoji }

# Server → Client (broadcast to session room)
proposal:created           → { proposal: Proposal }
proposal:updated           → { proposal: Proposal }
proposal:deleted           → { proposalId }
reaction:toggled           → { proposalId, emoji, counts, byUser }
```

### UI: Right-click context menu

- **Extend** → Opens tools editor pre-filled with this proposal's artifact
- **Edit** → (author-only) Opens editor, user modifies, clicks "Update" → sends `proposal:update`
- **Delete** → (author or leader) Removes proposal
- **React** → Quick emoji reactions

### Dependencies

- [x] Depends on `Session` and `Question` existing (session owner)
- [x] Depends on `User` type (auth owner)

- **No dependency on tools owner** — tools owner integrates via this module's socket pipeline

### Integration points

- **Tools owner:** When user proposes from an editor, sends `proposal:create` (this module validates + broadcasts)
- **Tools owner (extend flow):** Right-click menu opens tools editor; tools owner gets artifact shape from this table's schema
- **Voting owner:** Reads proposals to build shortlist (read-only query)
- **Assistant owner:** Proposes from chat by sending `proposal:create`

### Notes

- Proposal artifacts are **editable by their author only** (F16); other users build on them via the separate "Extend" flow (F23), which creates a new proposal owned by that user
- `extendsProposalId` links child proposals to parents; never delete parent if child exists
- Reactions use unique constraint to allow toggle: pressing same emoji again removes reaction

---

## Creative Tools Owner

**Features:** F19–F22, F23  
**Responsibility:** Sticky note, drawing, diagram editors; integrates with pinboard for proposal creation & extend

### Code ownership

```
Frontend: apps/web/src/features/tools/
          apps/web/src/features/toolbar/
          apps/web/src/components/StickyEditor.tsx
          apps/web/src/components/DrawingEditor.tsx
          apps/web/src/components/DiagramEditor.tsx
Backend:  [NONE — validation only, in pinboard schema]
```

### Database tables

```
[NONE] — Artifacts stored as JSON in Proposal.artifactJson by pinboard owner
```

### UI: Editors (all local, no backend)

**Toolbar buttons** (at bottom of pinboard)

- Sticky button → opens modal
- Drawing button → opens modal
- Diagram button → opens modal

**Each editor modal:**

1. User creates content (draw, type, build diagram)
2. Shows preview
3. Clicks "Propose" button → sends `proposal:create` (pinboard owner's pipeline)
4. Proposal appears on pinboard in real-time

**Extend flow (right-click Extend on existing proposal):**

1. Pinboard owner detects "Extend" click
2. Calls `openEditorForExtend(proposal)` (your function)
3. Your modal opens **pre-filled** with existing artifact
4. User modifies content
5. Clicks "Propose" → creates new proposal with `extendsProposalId` linking to parent
6. Pinboard owner handles the socket event (you pass artifact shape)

### Artifact JSON shapes (coordinate with pinboard owner)

```ts
// Sticky
{
  type: "sticky",
  text: string,
  color: "yellow" | "pink" | "blue" | "green"
}

// Drawing
{
  type: "drawing",
  svg: string  // SVG data as serialized string
}

// Diagram — see docs/02 §3 for the authoritative contract.
// Every field after `shape` is optional and additive; omitting all of them
// gives the original appearance, so pre-v2 diagrams still render unchanged.
{
  type: "diagram",
  nodes: Array<{
    id, label, x, y,
    shape?: "box" | "rectangle" | "ellipse" | "diamond"
          | "triangle" | "cylinder" | "container" | "text",
    parentId?: string,          // container grouping; containers only, acyclic
    width?: number, height?: number,   // bounded pair, both or neither
    fillColor?, strokeColor?, strokeWidthPreset?, fontSizePreset?  // closed enums
  }>,
  edges: Array<{ from, to, label?, strokeColor?, strokeWidthPreset?, strokeStyle? }>
}
```

### Dependencies

- [x] No backend dependencies - fully local
- [x] Depends on pinboard owner's `proposal:create` socket pipeline (already exists)

- **Coordinate with pinboard owner:** Artifact shapes, extend modal integration point

### Notes

- Editors are **stateless components** — no server persistence
- Drawing uses an SVG library (Excalidraw-lite or similar)
- Diagram uses mermaid or similar; user builds via UI or text editor
- No backend validation — only client-side preview

---

## Voting + Summary Owner

**Features:** F27–F32  
**Responsibility:** Voting rounds, shortlist curation, vote tally, session summary generation

### Code ownership

```
Backend:  apps/server/src/modules/voting/
          apps/server/src/modules/summary/
Frontend: apps/web/src/features/voting/
          apps/web/src/features/summary/
```

### Database tables

```
VotingRound (id, sessionId, questionId, status, createdAt, closedAt)
Vote (id, roundId, voterId, proposalId) — unique(roundId, voterId)
Answer (id, questionId, winningProposalId, decidedAt) — unique(questionId)
```

### Socket events

```
# Client → Server (leader-only where noted)
voting:start               → { questionId, shortlist: [proposalId] }  (leader-only)
vote:cast                  → { roundId, proposalId }
voting:close               → { roundId }                              (leader-only, auto-tallies)

# Server → Client (broadcast)
vote:progress              → { roundId, votedCount, totalVoters }
vote:result                → { questionId, winnerProposalId }
```

REST (read-only):

```
GET    /api/sessions/:id/summary          → { questions: [...], answers: [...] }
```

### Socket events (outbound)

```
vote:progress              → { roundId, votedCount, totalVoters }
vote:result                → { questionId, winnerProposalId }
```

### UI flows

**Shortlist curation** (leader-only, voting phase)

- Modal shows all proposals
- Leader selects N proposals (e.g., top 3–5)
- Clicks "Start voting" → creates VotingRound
- Broadcast `vote:progress`

**Ballot** (all participants, voting phase)

- Shows shortlisted proposals
- Click one to vote
- Real-time progress bar updates

**Results reveal** (after leader closes round)

- Shows winner + vote counts
- Broadcast `vote:result`

**Summary** (post-session)

- List all questions + winning proposals
- Export button (PDF or JSON)

### Dependencies

- [x] Depends on `Session`, `Question`, `Proposal` existing (read-only queries)
- [x] Depends on phase machine from session owner

- [!] Coordinate status values: trigger shortlist UI only when `Question.status === "voting"` (see `QuestionStatus` in docs/02 §3)

### Notes

- Votes are **private** (stored in DB but never broadcast individually)
- Only aggregate counts broadcast to all
- Shortlist curated by leader before voting opens (no write-in votes in MVP)
- Summary is generated on-demand (not pre-computed)

---

## Voice Owner

**Features:** F11–F13  
**Responsibility:** In-session voice chat via LiveKit

### Code ownership

```
Backend:  apps/server/src/modules/voice/
Frontend: apps/web/src/features/voice/
          apps/web/src/components/VoiceToolbar.tsx
```

### Database tables

```
[NONE] — Room identity derived from sessionId; LiveKit manages participant state
```

### API surface

```
POST   /api/sessions/:id/livekit-token   → { token, url, identity, roomName, expiresInSeconds }
```

### Frontend interactions

- Session joined → auto-fetch token + connect to LiveKit room
- Mute/unmute button in top toolbar
- Participant list showing:
  - Who's connected
  - Name + avatar
  - Speaking indicator (from LiveKit SDK)

### Dependencies

- [x] Depends on `Session` existing (session owner)
- [x] Depends on auth (JWT for token generation)

- [!] No database changes needed; no blocking dependencies

### Notes

- Room name: `session-{sessionId}`
- Token expires after 15 minutes; the client re-fetches on every connect and
  reconnect, so long sessions and refreshes are unaffected (F11 asks for a
  short-lived token, which supersedes the 24h figure written here pre-build)
- LiveKit SDK handles all participant state
- Voice is **optional** — joining session doesn't require microphone permission

---

## AI Assistant Owner

**Features:** F34–F37  
**Responsibility:** LLM-powered chat, tool-calling (web search, diagram generation, sticky ideation), propose-from-chat flow

### Code ownership

```
Backend:  apps/server/src/modules/assistant/
Frontend: apps/web/src/features/assistant/
          apps/web/src/components/AssistantBubble.tsx
```

### Database tables

```
[NONE] — LLM config stored in UserLLMConfig by auth owner
```

### API surface

```
POST   /api/sessions/:id/assistant/chat   → SSE stream of messages, tool calls, artifacts
```

### Request (sent once, one-directional)

```json
{
  "message": "user's message",
  "context": {
    "sessionTitle": "...",
    "activeQuestion": "...",
    "selectedProposalId": "...",
    "recentProposalIds": [...]
  }
}
```

### Response stream (Server-Sent Events)

```
data: {"type":"message","role":"assistant","content":"Here's what I found..."}
data: {"type":"tool","toolName":"web-search","status":"running","query":"..."}
data: {"type":"tool-result","toolName":"web-search","result":"..."}
data: {"type":"artifact","type":"sticky","text":"...","color":"yellow"}
data: {"type":"artifact","type":"diagram","nodes":[...],"edges":[...]}
data: {"type":"done"}
```

### UI: Floating assistant bubble

- Bottom-right corner (fixed position)
- Animated persona/figure inside
- Click to expand → floating panel on right side
- Chat messages + tool output display
- **Propose button** appears below artifacts (sticky, diagram)
  - Click → creates new proposal via pinboard owner's API
  - No backend round-trip; client creates proposal

### Tool implementations (all in backend)

**Web search:**

- Query DuckDuckGo (free, HTML scraping)
- Return snippet + link
- Fallback if rate-limited

**Diagram generation:**

- Mermaid or similar format
- Output `{ type: "diagram", nodes: [...], edges: [...] }`
- User can edit in diagram editor or propose directly

**Sticky ideation:**

- Prompt LLM for 3–5 sticky note ideas
- Output multiple `{ type: "sticky", text, color }`
- User picks one or proposes all

### Dependencies

- [x] Depends on `UserLLMConfig` (auth owner) - fetch user's LLM provider
- [x] Depends on session/proposal context (read-only queries)

- [!] Coordinate with auth owner: LLM config encryption/decryption, testing endpoint

### Integration: Propose-from-chat

1. User clicks "Propose" on an artifact in chat
2. Frontend sends `proposal:create` (pinboard owner's pipeline)
3. Proposal created; pinboard broadcasts via socket
4. Chat panel shows confirmation

### Notes

- **User-configured LLM:** Each user brings their own OpenAI key, Anthropic key, etc.
- **No third-party inference:** All LLM calls go through user's provider
- **Tool outputs match artifact shapes:** Coordinate with tools owner on JSON structure
- **Context is read-only:** Assistant never modifies session/proposal state
- **SSE (not Socket.IO):** One-directional stream per request; results private to requester

### Also owns (deferred from setup)

1. **Streaming responses (SSE):** the chat endpoint streams its reply as Server-Sent Events — plain text chunks sent over a normal HTTP response, in this order: message content → tool status/result updates (if any) → artifact payloads (if any) → a final `done` event. The web client reads it with an `EventSource`/fetch stream. A small shared helper for writing these events is fine to add.
2. **Decrypting LLM keys at call time:** when making an LLM call, decrypt the user's stored API key in memory using the helper from the Auth owner; use it for that call only and discard it.

**Acceptance criteria:**

- Assistant reply appears incrementally in the chat panel while the LLM generates (not all-at-once after completion).
- Stream always ends with a `done` event, even on error mid-stream (send an error event then `done`).
- Decrypted keys exist only inside a single request's lifetime; nothing logs or persists decrypted key material.

---

## 🔗 Coordination Points

### 1. Type contracts (lock in Week 1, rarely change)

**What:** `packages/shared/src/types.ts`  
**Content:** All domain types (User, Session, Question, Proposal, VotingRound, Answer, etc.)  
**Why:** Frontend + backend import same types; zero duplication, fewer bugs  
**Owners:** All 7 (agree upfront; very few changes after Week 1)

> **Note (from setup):** `packages/shared/src/index.ts` currently holds only User/Session/Question basics; the Prisma client already generates exact DB row types. Each owner adds their module's domain types here as they build — don't hand-mirror what Prisma already gives you.

### 2. Question status values (session owner defines, all others consume)

**Values:** `"pending"`, `"discussion"`, `"voting"`, `"answered"`, `"skipped"` — see docs/02 §3, matches the Prisma `QuestionStatus` enum.  
**Definition:** `packages/shared/src/index.ts` → export `type QuestionStatus = ...` (supersedes earlier `SessionPhase`/`phase` naming in this doc)  
**Where used:**

- Session owner: drives phase transitions via socket
- Voting owner: renders ballot only in `"voting"` phase
- Tools owner: allows proposals only in `"discussion"` phase
- Voice owner: auto-joins in `"discussion"` phase

### 3. Artifact shapes (tools owner + pinboard owner)

**Shapes defined in:** `packages/shared/src/types.ts`  
**Who cares:** Tools owner (builds editors), Pinboard owner (stores in DB), Assistant owner (outputs artifacts)  
**Coordinate:** Before Week 1, agree on exact JSON structure for sticky/drawing/diagram

### 4. Socket events (each owner documents their own)

**Definition:** `packages/shared/src/events.ts`  
**Pattern:**
**When to add:** Before you start streaming that event  
**Who reviews:** All developers (quick slack thread)

> **Note (from setup):** `events.ts` is a typed map — add your event name to the client→server or server→client interface with its payload type, and TypeScript enforces it at every emit/listen. The join/leave events are already there as the pattern to follow.

### 5. Database migrations (platform steward reviews)

**Timing:** Merge migration PR **before** merging feature PR  
**Naming:** `YYYYMMDD_HH_<module>_<description>.sql` (chronological, no conflicts)  
**Who reviews:** Platform steward (checks for naming, constraints, indexes)

### 6. Route + event namespace isolation (each module owns its path)

**Pattern:**

- Auth: `POST /api/auth/signup`, `POST /api/auth/login`, etc.
- Sessions: `POST /api/sessions`, `GET /api/sessions/:id`, etc.
- Voice: `POST /api/sessions/:id/livekit-token`
- Assistant: `POST /api/sessions/:id/assistant/chat`

**Rule:** No two modules own the same REST prefix or the same socket event namespace (`proposal:*` = pinboard, `vote:*`/`voting:*` = voting, `session:*` = sessions)  
**Exception:** Session owner defines `/api/sessions/:id/`* but pinboard owner defines `/api/sessions/:id/proposals/`*
→ Pinboard path is more specific; no conflict

Live/shared-state actions go over Socket.IO events instead (see each module's socket section): proposals/reactions (pinboard), voting rounds + ballots (voting), start/phase transitions (sessions).

### 7. Read-only cross-module queries

**Pattern:** Module A (voting) needs to read module B (proposals) for summary  
**Solution:** Voting owner calls a **public query function** from pinboard owner, never direct table access

```ts
// pinboard/queries.ts (public)
export async function getProposalsForQuestion(questionId) { ... }

// voting/service.ts
const proposals = await pinboard.getProposalsForQuestion(questionId);
```

**Benefits:** Pinboard owner can refactor schema without breaking voting; clear contract

---

## Independence Proof

| Module    | Owns tables                      | Owns routes                                               | Can start    | Blockers                                    |
| --------- | -------------------------------- | --------------------------------------------------------- | ------------ | ------------------------------------------- |
| Auth      | User, UserLLMConfig              | /api/auth/_, /api/users/me/_, /api/me/*                   | Week 1 Day 1 | None                                        |
| Session   | Session, Question, SessionMember | /api/sessions/*                                           | Week 1 Day 1 | Auth (imports User type)                    |
| Pinboard  | Proposal, Reaction               | socket `proposal:*`, `reaction:*`                         | Week 1 Day 1 | Session (reads session state)               |
| Tools     | [none]                           | [none]                                                    | Week 1 Day 1 | Pinboard pipeline exists (already designed) |
| Voting    | VotingRound, Vote, Answer        | socket `vote:*`/`voting:*`; GET /api/sessions/:id/summary | Week 1 Day 2 | Phase values defined                        |
| Voice     | [none]                           | /api/livekit-token                                        | Week 1 Day 1 | Auth, Session (imports types)               |
| Assistant | [none]                           | /api/assistant/chat                                       | Week 1 Day 2 | Auth (LLM config), Pinboard pipeline        |

**Outcome:** No hard blockers; soft dependencies on type definitions (all locked in setup week)

---

## Git Workflow

### Branch naming

```
<owner-initials>/<feature-id>-<short-desc>

Examples:
  jd/f01-signup-endpoint
  ja/f14-proposal-crud
  mk/f34-assistant-chat
```

### Process

1. Create branch off `main`
2. Keep it ≤2 days old
3. One story per branch
4. Commit message: `[F##] Brief description`
5. Push; open PR

### PR requirements

- ≥1 code review
- CI green (lint, typecheck, build, test)
- PR title includes `[F##]` for traceability to Jira
- Link to Jira ticket in PR description
- **Migrations:** Platform steward approves before merge

### Merge strategy

- Squash merge to `main` (clean history)
- Delete branch after merge
- Auto-deploy via CI to Render

---

## Jira Board Setup

### Epic structure (mirrors 7 modules)

1. **Auth + Profile** — F01–F03, F33
2. **Session Lifecycle** — F04–F10, F24–F26
3. **Pinboard Core** — F14–F18
4. **Creative Tools** — F19–F22, F23
5. **Voting + Summary** — F27–F32
6. **Voice** — F11–F13
7. **AI Assistant** — F34–F37

### Story format

```
Title:        [F##] Brief description
Assignee:     @module-owner
Epic:         Their epic (from above)
Description:  Feature acceptance criteria (from docs/01-feature-list.md)
Dependencies: If any (e.g., "Blocked by F04")
Estimate:     3–5 points (rough)
```

### Board columns

```
To Do
  → Ready to start; engineer not yet on it

In Progress
  → Branch created; code being written

Review
  → PR open; waiting for review

Done
  → Merged to main; deployed to production
```

---

## 📅 Example Week 1 Timeline

All 7 owners start immediately after setup, in parallel:

> **Deferred UI work (agreed during setup):** page layouts, the session-page layout, the assistant chat panel, and base components (Button/Input/Modal) were intentionally **not** built — the frontend mockup doesn't exist yet. Whoever builds the first real screen for their module starts from the placeholder pages in `apps/web/src/pages/` and creates these shared components as part of their story, following the mockup once it lands.

| Module    | F##     | Task                                     | Dependencies    | Outcome       |
| --------- | ------- | ---------------------------------------- | --------------- | ------------- |
| Auth      | F01–F03 | Signup/login/profile endpoints + pages   | None            | API + UI      |
| Session   | F04–F07 | Session CRUD, invite codes, join flow    | User type       | API + UI      |
| Pinboard  | F14–F15 | Proposal CRUD, basic sync                | Session state   | API + UI      |
| Tools     | F19–F20 | Sticky + drawing editors (local only)    | None            | UI components |
| Voting    | F27     | Shortlist schema + UI spike              | Proposals exist | Schema ready  |
| Voice     | F11     | LiveKit token endpoint + SDK integration | Session exists  | API + UI      |
| Assistant | F35     | Chat backend + basic web search tool     | LLM config      | API + UI      |

**Result:** 7 PRs merged by Friday. Zero blockers. Smoke test: signup → create session → join → see pinboard.

---

## Parallelism Guarantees

- [x] No module owns another module's database tables -> no merge conflicts
- [x] Each module's URL routes are isolated -> `/api/{module}/*` pattern
- [x] Type contracts lock early -> no mid-week API surprises
- [x] Socket events documented upfront -> no integration surprises
- [x] Dependencies are read-only queries (voting reads proposals, assistant reads session context) -> no locking
- [x] Phase coordination is unidirectional (session owner drives; others react) -> no circular dependencies

---

## Decision Tree (When Unsure)

| Situation                             | Who decides?                     | Action                                                              |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------------------- |
| **Database schema change**            | Platform steward                 | Create migration PR; they review + approve before feature PR merges |
| **New socket event**                  | Originating module owner         | Document in `packages/shared/events.ts`; alert consumers on Slack   |
| **Breaking API change**               | Affected module + consumers      | Slack discussion; agree on contract before coding                   |
| **Module A needs data from Module B** | Module B owner                   | Export a read-only query function (never direct table access)       |
| **Artifact shape change**             | Tools + Pinboard owners together | Update `packages/shared/types.ts`; lock in Week 1                   |
| **Phase machine question**            | Session owner                    | They drive; others just consume phase values                        |
| **LLM config format**                 | Auth + Assistant owners together | Lock in Week 1; test connection endpoint first                      |

---

## Definition of Done (Per Feature)

- [ ] Code written (frontend + backend or UI-only, as applicable)
- [ ] Tests added (unit or integration, not necessarily 100% coverage)
- [ ] TypeScript compiles with no errors
- [ ] Linter passes (`npm run lint`)
- [ ] PR reviewed + approved
- [ ] Migrations merged (if applicable)
- [ ] Merged to `main` and deployed to Render
- [ ] Smoke test passes (CI green)
- [ ] Works on staging environment
