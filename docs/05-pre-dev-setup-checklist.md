# RoundTable — Setup Checklist (Week 1 Gate)

> Before feature module owners begin their work, the setup phase must establish shared rails. This checklist defines the "ready to split work" line.
>
> **What's still open (as of 2026-08-30):**
> 1. **§9 team-side** — record the 7 module owners + create the Jira stories under each epic (Jira epics for all 7 modules exist; owner assignment not yet confirmed here).
> 2. **§10 integration smoke test** — runs once the Auth/Session owners' first tickets land, doubling as their acceptance test.
>
> **§3 Render auto-deploy is done, but note the gotcha:** the initial build failed with `Cannot find module './generated/prisma/client.js'` because Render's build command never ran `prisma generate` (that output is gitignored, correctly, since it's regenerated code). Fixed via a `postinstall` script in `apps/server/package.json` so the Prisma client is generated automatically after every `npm install` — local, CI, and Render. Also, local development no longer uses Neon at all — see the README's "Database (local development)" section; Neon's connection string lives only in Render's env vars now, and `prisma migrate deploy` runs automatically on every Render boot.

## 1. Repo + Tooling Foundations

- [x] Monorepo created with structure:
    - `apps/web`
    - `apps/server`
    - `packages/shared`
- [x] Root `package.json` scripts working:
    - `npm run dev` (concurrent dev servers)
    - `npm run build` (all workspaces)
    - `npm run test` (all workspaces)
    - `npm run lint` (all workspaces)
    - `npm run typecheck` (all workspaces)
- [x] TypeScript strict mode: `"strict": true` in all `tsconfig.json` files.
- [x] ESLint configured with flat config; `npm run lint` passes.
- [x] Prettier configured; `npm run format` available.
- [x] `.editorconfig` in place for consistent formatting.
- [x] `.nvmrc` specifies Node.js version (20+; required by Tailwind v4).
- [x] `.gitignore` covers dependencies, builds, env files, editor files, test artifacts.
- [x] `README.md` updated with:
    - Brief project description
    - Prerequisites (Node version, git)
    - Setup: `npm install`
    - Dev: `npm run dev`
    - Build/deploy: `npm run build` + render instructions
    - Links to docs/

## 2. Environment + Secrets Discipline

- [x] `.env.example` committed with all required keys (never commit `.env`):
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
- [x] Config loader module created (`apps/server/src/env.ts`):
    - Uses zod to validate env at startup
    - Fails fast with clear error message if any key is missing/invalid
    - Exported singleton available to all modules
- [x] `.env` added to `.gitignore`.
- [x] External accounts created + documented *(secrets live in local `.env` + Render env vars; never committed)*:
    - [x] Neon Postgres project; connection string in `.env`
    - [x] LiveKit Cloud project; API key/secret/URL in `.env`
    - [x] Render account linked to GitHub repo (web service `roundtable` created)
    - [x] Render env vars set (DATABASE_URL, JWT_SECRET, LIVEKIT_*, LLM_KEY_ENCRYPTION_SECRET; CLIENT_ORIGIN pending service URL)

## 3. CI/CD Baseline

- [x] GitHub Actions workflow (`.github/workflows/ci.yml`):
  - Runs on PR to `main` and push to `main`
  - Steps: lint → typecheck → build → test
  - All steps must pass before merge
- [x] Existing Trivy security scan workflow preserved.
- [x] Render auto-deploy connected:
  - Deploys on push to `main` automatically
  - Env vars set in Render console (JWT_SECRET, DB_URL, LiveKit keys, LLM encryption key)
  - Confirmed working end-to-end (see "What's still open" note above for the `postinstall` fix that was required)
- [x] Branch protection on `main` (via ruleset "Protect Main Branch"):
  - Require PR reviews (≥1)
  - Require CI + Trivy checks to pass
  - Dismiss stale reviews on push

## 4. Database + Migration Setup (Prisma)

- [x] Prisma installed (`@prisma/client` + `prisma` CLI, pinned to v6 — v7 changed config model, not worth it for setup).
- [x] Prisma initialized (schema in `apps/server/prisma/`). **Updated since initial setup:** local development runs against a Dockerised Postgres, not Neon directly — `DATABASE_URL` in the root `.env` points at `localhost:5433` (see README). Neon is production-only; its connection string lives only in Render's env vars.
- [x] Initial `schema.prisma` created with:
  - Module sections labeled (e.g. `// === auth module ===`)
  - `User` model outlined (id, email, passwordHash, displayName, createdAt)
  - `Session` model outlined (id, code, title, leaderId, status, createdAt)
  - Comments indicating where each module will add their tables
- [x] First migration generated: `prisma migrate dev --name init` (applied to Neon).
- [x] Migration file committed to repo.
- [x] `.gitignore`: `prisma/migrations/` committed; generated client + `.env` ignored.
- [x] Seed script scaffolded (`apps/server/prisma/seed.ts`, run via `npm run db:seed`):
  - Populates dummy users + one demo session (`DEMO-0001`, local only).
- [x] Database naming conventions documented in README:
  - Table names: snake_case, plural (e.g. `users`, `sessions`, `proposals`)
  - FK columns: `{table}Id` (e.g. `userId`, `sessionId`)
  - Indexes: `idx_{table}_{field}` or `idx_{table}_{field1}_{field2}`
  - Constraints enforced in schema (unique, required, cascades)
  - Note: Prisma models are camelCase by default — use `@@map`/`@map` to map them onto the snake_case table/column names

## 5. Backend Skeleton (Express + Socket.IO, no feature logic)

> **Scope note (agreed):** setup provides only the shared rails below. Feature-shaped pieces — socket auth handshake, realtime gateway, SSE streaming — belong to module owners (see "Deferred during setup").

- [x] Express server boots on `PORT` (default 3001):
  - `GET /api/health` returns `{ ok: true, service: "roundtable-server" }`
  - CORS configured to allow web app origin
  - JSON body parser wired with 256KB limit
- [x] Socket.IO server boots with connection/disconnect logging.
- [x] Global error handler: returns consistent `{ error: string, code?: string }` shape (`src/middleware/error.ts`; throw `ApiError` from handlers).
- [x] Auth middleware stub `requireAuth(req, res, next)` returns 401 (real JWT check = Auth owner).
- [x] Module registration convention documented (docs/02 §6): module `index.ts` public surface, routes mounted in main `index.ts`, socket handlers under `realtime/`.

**Cut from setup:** empty module folder tree, `realtime/gateway.ts` implementation, SSE helper, socket JWT handshake.

## 6. Shared Contracts Package (`packages/shared`)

> **Scope note (agreed):** DB row types come free from the generated Prisma client — don't hand-mirror the whole data model here. Setup ships only what prevents web/server drift: event types + validation patterns.

- [x] `src/events.ts`: typed `ClientToServerEvents` + `ServerToClientEvents` maps with payload types, seeded with core events (`member:join`, room join/leave); module owners extend.
- [x] `src/schemas.ts`: zod pattern established with 1–2 example schemas (signup, login); owners follow it for their DTOs.
- [x] Both apps successfully import from `@roundtable/shared`; no duplicate type definitions. Package exports are conditional: `types` and `default` point at `src/` (so typechecking never waits on a build, and Vite stays on source), while `node` points at the compiled `dist/` the deployed server loads.

**Cut from setup:** full domain-type mirror of docs/02 §3, proposal/artifact subtypes.

## 7. Frontend Shell (React + Vite, no feature logic)

> **Scope note (agreed):** setup ships plumbing + route targets only. Page layouts and UI design wait for the frontend mockup; session-page layout skeleton is dropped entirely (Pinboard/UI owners).

- [x] React app boots with Vite:
  - `npm run dev` starts Vite on port 5173
  - `npm run build` produces optimized SPA in `dist/`
  - Vite proxy routes `/api` and `/socket.io` to `localhost:3001`
- [x] Tailwind CSS v4 configured + working.
- [x] React Router configured: public (`/login`, `/signup`), protected (`/dashboard`, `/sessions/:id`, `/settings`), 404 fallback; auth guard redirects unauthenticated users to `/login` (`lib/auth.tsx` checks localStorage token — swap logic for real JWT validation later).
- [x] Placeholder pages for those routes (one line of content each — smoke-test targets only).
- [x] API client wrapper `apps/web/src/lib/api.ts`: `get`/`post`, JSON handling, graceful errors.
- [x] Socket.IO client wrapper `apps/web/src/lib/socket.ts`: singleton/hook, JWT passed on connect, reconnect with backoff, typed events.

**Cut from setup:** page shells with real layout content, session-page layout skeleton, assistant panel UI, Button/Modal/Input component library.

## 8. Security Baseline (decisions documented — implementation owned by module devs)

> **Scope note (agreed):** setup *decides and documents*; the Auth owner implements signup/login against these rules. These decisions block the §4 schema (`passwordHash`, `apiKeyEncrypted` columns) and match the env vars already provisioned.

- [x] Password hashing: bcryptjs, 10+ rounds; hash on signup; never log plaintext.
- [x] JWT: secret in `JWT_SECRET`; 7-day expiry, no refresh for MVP; payload `{ userId, iat, exp }`; verified by auth middleware.
- [x] LLM API keys: encrypted at rest with AES-256-GCM keyed by `LLM_KEY_ENCRYPTION_SECRET` (AES-256-GCM = standard authenticated encryption: encrypts AND detects tampering); decrypted only in memory during assistant calls; never returned in API responses.
- [x] Input validation: all mutating endpoints + socket events validate with zod schemas from `packages/shared`; failures → 400 with details.
- [x] CORS locked to web app origin (done in server); no inline scripts; CSP = nice-to-have post-MVP.

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

> **Scope note:** runs after merge, using the Auth/Session owners' first tickets — it doubles as their acceptance test. Items below assume those tickets are done.

- [ ] Two users can sign up and log in; passwords hashed in DB; JWT issued and persisted (localStorage OK).
- [ ] Logged-in users reach `/dashboard`; auth guard redirects unauthenticated users to `/login`.
- [ ] Users can open `/sessions/:id` for a seeded demo session.
- [ ] Socket connection established (`member:join` event → ack/broadcast visible in console).
- [ ] Render deploy succeeds: CI green on `main`, auto-deploy fires, `/api/health` returns `{ ok: true }`, login works on the deployed app, logs clean.

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

## Deferred during setup — must land via module tickets (docs/06)

Scope was deliberately trimmed on 2026-08-25: setup ships shared rails only; the items below were cut from setup and **must be covered by tickets in docs/06 with explicit success criteria** so nothing falls through:

1. **Socket auth handshake + realtime gateway** (`realtime/gateway.ts`, JWT handshake, room join/leave, routing events to module handlers) → Session Lifecycle owner. ✅ Written into docs/06 Session section ("Also owns").
2. **SSE streaming helper** for assistant responses → AI Assistant owner. ✅ Written into docs/06 Assistant section ("Also owns").
3. **Shared domain types** (full mirror of docs/02 §3 data model incl. proposal/artifact subtypes) → grows per-module as owners build; Prisma client covers DB row types meanwhile. ✅ Noted in docs/06 Coordination Point 1.
4. **Frontend page layouts + session-page UI skeleton + assistant panel + base UI components** (Button/Input/Modal) → after mockup exists; split across relevant owners. ✅ Noted in docs/06 Week 1 timeline.
5. **Security implementation** per §8 decisions (bcryptjs hashing, JWT sign/verify + real `requireAuth`, AES-256-GCM helpers for LLM keys, zod `validate()` wiring) → Auth owner (+ Assistant owner for decryption usage). ✅ Written into docs/06 Auth section ("Also owns").
6. **CSP headers** (nice-to-have, post-MVP). — Not ticketed; revisit after MVP if desired.

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
