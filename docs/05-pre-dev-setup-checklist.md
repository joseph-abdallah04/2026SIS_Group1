# RoundTable — Setup Checklist (Week 1 Gate)

> Before feature module owners begin their work, the setup phase must establish shared rails. This checklist defines the "ready to split work" line.

## 1. Repo + Tooling Foundations

- [ ] Monorepo created with structure:
  - `apps/web`
  - `apps/server`
  - `packages/shared`
- [ ] Root `package.json` scripts working:
  - `npm run dev` (concurrent dev servers)
  - `npm run build` (all workspaces)
  - `npm run test` (all workspaces)
  - `npm run lint` (all workspaces)
  - `npm run typecheck` (all workspaces)
- [ ] TypeScript strict mode: `"strict": true` in all `tsconfig.json` files.
- [ ] ESLint configured with flat config; `npm run lint` passes.
- [ ] Prettier configured; `npm run format` available.
- [ ] `.editorconfig` in place for consistent formatting.
- [ ] `.nvmrc` specifies Node.js version (20+; required by Tailwind v4).
- [ ] `.gitignore` covers dependencies, builds, env files, editor files, test artifacts.
- [ ] `README.md` updated with:
  - Brief project description
  - Prerequisites (Node version, git)
  - Setup: `npm install`
  - Dev: `npm run dev`
  - Build/deploy: `npm run build` + render instructions
  - Links to docs/

## 2. Environment + Secrets Discipline

- [ ] `.env.example` committed with all required keys (never commit `.env`):
  ```
  PORT=3001
  JWT_SECRET=
  DATABASE_URL=
  LIVEKIT_URL=
  LIVEKIT_API_KEY=
  LIVEKIT_API_SECRET=
  LLM_KEY_ENCRYPTION_SECRET=
  CLIENT_ORIGIN=
  ```
- [ ] Config loader module created (`apps/server/src/env.ts`):
  - Uses zod to validate env at startup
  - Fails fast with clear error message if any key is missing/invalid
  - Exported singleton available to all modules
- [ ] `.env` added to `.gitignore`.
- [ ] External accounts created + documented:
  - [ ] Neon Postgres project; connection string in `.env.example`
  - [ ] LiveKit Cloud project; API key/secret/URL in `.env.example`
  - [ ] Render account linked to GitHub repo
  - [ ] GitHub secrets set for Render env vars

## 3. CI/CD Baseline

- [ ] GitHub Actions workflow (`.github/workflows/ci.yml`):
  - Runs on PR to `main` and push to `main`
  - Steps: lint → typecheck → build → test
  - All steps must pass before merge
- [ ] Existing Trivy security scan workflow preserved.
- [ ] Render auto-deploy connected:
  - Deploys on push to `main` automatically
  - Env vars set in Render console (JWT_SECRET, DB_URL, LiveKit keys, LLM encryption key)
- [ ] Branch protection on `main`:
  - Require PR reviews (≥1)
  - Require CI to pass
  - Dismiss stale reviews on push

## 4. Database + Migration Setup (Prisma)

- [ ] Prisma installed (`@prisma/client` + `prisma` CLI).
- [ ] Prisma initialized with Neon connection string.
- [ ] Initial `schema.prisma` created with:
  - Module sections labeled (e.g. `// === auth module ===`)
  - `User` model outlined (id, email, passwordHash, displayName, createdAt)
  - `Session` model outlined (id, code, title, leaderId, status, createdAt)
  - Comments indicating where each module will add their tables
- [ ] First migration generated: `prisma migrate dev --name init`
- [ ] Migration file committed to repo.
- [ ] `.gitignore` updated: `prisma/migrations/` is committed; `.env` is not.
- [ ] Seed script scaffolded (`prisma/seed.ts`):
  - Can run locally via `node --loader ts-node/esm prisma/seed.ts`
  - Populates dummy users + one demo session (used locally only)
- [ ] Database naming conventions documented in team wiki or README:
  - Table names: snake_case, plural (e.g. `users`, `sessions`, `proposals`)
  - FK columns: `{table}Id` (e.g. `userId`, `sessionId`)
  - Indexes: `idx_{table}_{field}` or `idx_{table}_{field1}_{field2}`
  - Constraints enforced in schema (unique, required, cascades)
  - Note: Prisma models are camelCase by default — use `@@map`/`@map` to map them onto the snake_case table/column names

## 5. Backend Skeleton (Express + Socket.IO, no feature logic)

- [ ] Express server boots on `PORT` (default 3001):
  - `GET /api/health` returns `{ ok: true, service: "roundtable-server" }`
  - CORS configured to allow web app origin
  - JSON body parser wired with 256KB limit
- [ ] Global error handler in place:
  - Catches uncaught errors
  - Returns consistent shape: `{ error: string, code?: string }`
- [ ] Socket.IO server boots with:
  - JWT auth handshake via `socket.handshake.auth.token`
  - Rejects unauthenticated sockets
  - Logs connection/disconnect
- [ ] Module folders created (empty, ready for owners):
  - `apps/server/src/modules/auth/`
  - `apps/server/src/modules/sessions/`
  - `apps/server/src/modules/pinboard/`
  - `apps/server/src/modules/tools/` (back-end helpers, if any)
  - `apps/server/src/modules/voting/`
  - `apps/server/src/modules/summary/`
  - `apps/server/src/modules/voice/`
  - `apps/server/src/modules/assistant/`
- [ ] Module registration pattern documented:
  - Each module exports an `index.ts` with its public surface
  - Routes file per module, mounted in main `index.ts`
  - Socket event handlers per module in `realtime/` folder
- [ ] Auth middleware stub exists: `requireAuth(req, res, next)` returns 401 for now.
- [ ] `apps/server/src/realtime/gateway.ts` exists:
  - Listens for socket connections
  - Routes events to module handlers (empty for now)
  - Implements room join/leave patterns documented in architecture
- [ ] SSE helper function scaffolded for assistant module style streaming.

## 6. Shared Contracts Package (`packages/shared`)

- [ ] Exports from `src/index.ts`:
  - Domain types: `User`, `Session`, `Question`, `Proposal`, etc. (as in docs/02 §3)
  - Proposal artifact subtypes: `StickyArtifact`, `DrawingArtifact`, `DiagramArtifact`
  - All types are concrete, not `any`
- [ ] Exports from `src/events.ts`:
  - `ClientToServerEvents` type (Socket.IO C→S)
  - `ServerToClientEvents` type (Socket.IO S→C)
  - Event payload types
- [ ] Exports from `src/schemas.ts`:
  - zod schemas for API DTOs (signup, login, createSession, joinSession, etc.)
  - zod schemas for proposal types and artifacts
  - Validators used consistently on backend
- [ ] Both `apps/server` and `apps/web` successfully import shared types.
- [ ] No duplicate type definitions between web/server.
- [ ] `packages/shared/package.json` exports are correct (exports field points to `src/`).

## 7. Frontend Shell (React + Vite, no feature logic)

- [ ] React app boots with Vite:
  - `npm run dev` starts Vite on port 5173
  - `npm run build` produces optimized SPA in `dist/`
  - Vite proxy routes `/api` and `/socket.io` to `localhost:3001`
- [ ] React Router configured:
  - Root layout wrapper (App component)
  - Public routes: `/login`, `/signup`
  - Protected routes: `/dashboard`, `/sessions/:id`, `/settings`
  - 404 fallback
- [ ] Page shells created (placeholder content acceptable):
  - [ ] **Login page** (`/login`): form + link to signup
  - [ ] **Signup page** (`/signup`): form + link to login
  - [ ] **Dashboard** (`/dashboard`): "My Sessions" list + "Create Session" button (stubs only)
  - [ ] **Session page** (`/sessions/:id`): layout with placeholders for all UI sections
  - [ ] **Settings page** (`/settings`): placeholder for LLM config, profile settings
- [ ] Session page layout skeleton:
  - Left sidebar: agenda panel placeholder (expandable/collapsible)
  - Center: pinboard placeholder (canvas-like area)
  - Bottom: toolbar placeholder (floating buttons for tools)
  - Bottom-right: AI assistant bubble placeholder (animated circle)
- [ ] Right-side assistant panel:
  - Initially hidden / off-canvas
  - Can toggle open/close (UI-only, no logic)
  - Layout: chat-like area at top, empty for now
- [ ] API client wrapper exists (`apps/web/src/lib/api.ts`):
  - `api.get(path)` and `api.post(path, body)` methods
  - Handles JSON serialization
  - Graceful error handling (shows error message, doesn't crash)
- [ ] Socket.IO client wrapper exists (`apps/web/src/lib/socket.ts`):
  - Exports `useSocket()` hook (or singleton client)
  - Automatically passes JWT token on connect
  - Implements reconnect with backoff
  - Type-safe event emitters/listeners
- [ ] Tailwind CSS v4 configured + working:
  - `npm run build` includes Tailwind output
  - Dev server has hot reload for CSS
- [ ] Basic component library folder created:
  - `apps/web/src/components/ui/Button.tsx`
  - `apps/web/src/components/ui/Modal.tsx`
  - `apps/web/src/components/ui/Input.tsx`
  - Enough to unblock page building; no full component library needed yet

## 8. Security + Data Handling Baseline

- [ ] Password hashing strategy documented + implemented:
  - bcryptjs rounds: 10+ (recommended for MVP)
  - Hash generated on signup; never log plaintext
  - Verification implemented (auth module)
- [ ] JWT strategy documented:
  - Secret stored in `JWT_SECRET` env var
  - Expiry: 7 days for MVP (no refresh for simplicity)
  - Payload includes: `userId`, `iat`, `exp`
  - Verified in auth middleware
- [ ] LLM API key storage strategy implemented:
  - Encryption: AES-256-GCM or similar, keyed by `LLM_KEY_ENCRYPTION_SECRET`
  - Encrypted at rest in `UserLLMConfig.apiKeyEncrypted`
  - Decrypted only in memory when making assistant API calls
  - Never returned in API responses (config GET returns `{ baseUrl, model }` only)
- [ ] Input validation pattern documented:
  - All mutating endpoints and socket events use zod schemas
  - Failed validation returns 400 with error details
  - Schema violations logged (never proceed)
- [ ] CORS + XSS baseline:
  - CORS header allows web app origin only (not `*` in production)
  - No inline scripts in HTML
  - CSP headers considered (nice-to-have for MVP)

## 9. Ownership + Workflow Operating System

- [ ] 7 module owners assigned + recorded:
  1. Auth + Profile
  2. Session Lifecycle
  3. Pinboard Core
  4. Creative Tools
  5. Voting + Summary
  6. Voice
  7. AI Assistant
- [ ] "Module owns UI + API + migrations" rule documented in team wiki.
- [ ] Migration governance process documented:
  - Module owner authors migration in their PR
  - Platform steward reviews + approves schema changes
  - Migration PR merged before feature PR
- [ ] PR template created (`.github/pull_request_template.md`):
  - Checklist: tests added, CI passing, no console.logs, env vars documented
  - Link to feature ticket(s) (e.g. "Closes F07, F08")
  - Link to any architectural/schema changes
- [ ] Jira board setup:
  - 1 Epic per module owner
  - Epics linked to docs/02 module boundaries
  - Sample story created (e.g. "Implement signup flow" under Auth epic)
  - Story workflow: `To Do → In Progress → PR Review → Done`
- [ ] Commit convention documented:
  - Conventional Commits format: `feat(auth): …`, `fix(sessions): …`
  - Enables readable changelogs
  - Enforced by CI (optional but recommended)

## 10. Integration Smoke Test (must pass before declaring setup done)

- [ ] Two separate users can sign up and log in:
  - Signup form works (no real validation needed yet, minimal)
  - Passwords are hashed (check DB)
  - JWT issued on login
  - Login persists JWT (localStorage acceptable for MVP)
- [ ] Both logged-in users can navigate to `/dashboard`:
  - Auth guard redirects unauthenticated users to `/login`
  - Dashboard loads (content stub OK)
- [ ] Both users can access `/sessions/:id` (e.g. a demo session seed):
  - Session page renders layout shells
  - Agenda sidebar present (placeholder)
  - Pinboard canvas present (placeholder)
  - Toolbar present (placeholder)
- [ ] Socket connection established:
  - Open DevTools → Network → WS
  - Connect to session page
  - Confirm WebSocket connection to `/socket.io`
  - Send a dummy socket event (e.g. `member:join`)
  - Receive acknowledgment or broadcast (log to console to verify)
- [ ] Render deploy succeeds:
  - Push dummy commit to `main`
  - GitHub Actions CI runs and passes
  - Render auto-deploys
  - Visit `https://<render-app-url>/api/health` → returns `{ ok: true }`
  - Login works on deployed app
  - Render logs show no startup errors

---

## Do NOT implement during setup (protect feature ownership)

❌ Session creation/joining logic (Session owner owns this)  
❌ Session state machine/phase progression (Session owner owns this)  
❌ Proposal CRUD/reactions/realtime sync (Pinboard owner owns this)  
❌ Sticky note/drawing/diagram editors with full behavior (Tools owner owns this)  
❌ Voting shortlist/tally/winner logic (Voting owner owns this)  
❌ Session summary generation (Summary owner owns this)  
❌ Voice chat / LiveKit integration (Voice owner owns this)  
❌ Assistant chat / tool-calling loop (Assistant owner owns this)  
❌ LLM provider config form (except placeholder) (Auth + Assistant owners own this)

**If any of the above gets implemented in setup, move it to that module owner's backlog immediately.**

---

## Practical team split for setup week (prevents idle time)

**Group 1 (2 people): Platform skeleton**

- Monorepo structure, CI, deploy pipeline
- Prisma baseline, migrations setup
- Backend app boot, module wiring skeleton
- Env config loading

**Group 2 (2 people): Frontend shell**

- React pages (login, dashboard, session, settings)
- Routing setup
- Layout placeholders + UI component folder
- API/socket client wrappers

**Group 3 (2 people): Shared contracts + types**

- `packages/shared` domain types + schemas
- Socket event type definitions
- Validation rules
- Web + server both import successfully

**Group 4 (1 person): Jira + workflows + hygiene**

- Create Jira board structure + epics
- PR template + commit convention docs
- Team wiki for migration governance
- Verify all setup checklist items are tested

---

## "Setup Done" Declared When

- All 10 sections above have all checklist items ticked.
- Smoke test passes with no warnings/errors.
- All 7 module owners have a clear backlog of their F-features ready to start.
- Platform steward has verified migration conventions are documented.
- CI is green on a clean `main`.
