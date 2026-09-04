# RoundTable

Collaborative brainstorming, ideation, and planning tool for software teams. A leader runs a facilitated session: teammates join a live voice room, propose ideas onto a shared pinboard (sticky notes, drawings, diagrams), react, vote, and walk away with a structured summary.

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- Git

## Setup

```bash
npm install
cp .env.example .env   # fill in values (see docs/05-pre-dev-setup-checklist.md section 2)
```

## Database (local development)

Development runs against a local, Dockerised Postgres — **never against Neon**. Neon is production-only; its connection string lives in Render's environment, not in anyone's `.env`.

### Day to day: starting and stopping

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
npm run db:up      # start the local database (before you start working)
npm run db:down    # stop it (when you're done — frees CPU/RAM, keeps all data)
```

`db:down` does **not** delete anything — your tables and rows are stored in a Docker volume that survives stopping and restarting the container. Run `db:up` again anytime and your data is exactly as you left it. (Only `db:nuke`, below, deletes data.)

First-time setup (once per machine):

```bash
npm run db:up                                          # start local Postgres (Docker), waits until ready
npm run db:migrate --workspace @roundtable/server       # create the tables (applies existing migrations)
npm run db:seed --workspace @roundtable/server           # seed demo users + session DEMO-0001
```

`.env.example` already points `DATABASE_URL` at the local container — copy it as-is, no editing needed for local dev.

**If your `.env` predates September 2026, add `NODE_ENV=development` to it.** `NODE_ENV` now defaults to `production` when unset, because it is the switch that enables the dev-only identity stand-ins we use until login lands (docs/02 §7) — a missing env var must not hand out impersonation. Without it locally the server boots fine but refuses every request with a 401, and prints a warning saying so.

**Port 5433, not 5432:** the container maps to host port `5433` (Postgres inside the container still listens on its normal 5432). If it used the standard 5432, it would silently conflict with any Postgres already installed via Homebrew/Postgres.app — on macOS a pre-existing native Postgres wins that conflict, and you'd get a confusing "access denied" instead of a port-in-use error. If you don't have another Postgres running locally, this makes no difference to you.

Schema lives in `apps/server/prisma/schema.prisma`. Conventions: tables snake_case + plural via `@@map`; add your module's tables under its labeled comment. Module owners author migrations in their own PRs (see docs/05 §9).

Other DB scripts:

| Script                  | Purpose                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `npm run db:down`        | Stop the local Postgres container (data preserved)         |
| `npm run db:nuke`        | Stop the container **and delete its data volume**          |

### Migrations — team workflow

Every migration is a numbered SQL folder in git (`apps/server/prisma/migrations/`); Prisma tracks which have run in a `_prisma_migrations` table inside the database. The DB's history lives in the repo, ordered by folder name.

1. `git pull` latest `main` **before** touching the schema.
2. Edit `schema.prisma` — only under your module's labeled section.
3. Run `npm run db:migrate --workspace @roundtable/server`, give it a clear name. This runs against your **local** container via `prisma migrate dev` — safe to experiment, reset, and retry.
4. Commit schema + new migration folder together in your PR.

**Never run `prisma migrate dev` or `prisma migrate reset` against Neon.** Both can generate migrations or wipe data — fine against your own container, destructive against the database six other people are using. Neon only ever receives `prisma migrate deploy`, which applies already-committed migration files and never generates or resets. That happens automatically: Render's start command runs `db:deploy` before booting the server (see `start` script in the root `package.json`), so merging to `main` migrates production as part of the normal deploy — nothing to run by hand.

If two people migrate at once, whoever merges first sets the order. After pulling `main`, re-run `npm run db:migrate --workspace @roundtable/server` so Prisma replays their migration locally and immediately reports drift if your change conflicts with theirs. Conflicts only happen if you changed the same table — keep to your own module's tables and this is rare. Rules of thumb:

- Never edit a merged migration — fix forward with a new one.
- Local state gone weird? `npm run db:nuke && npm run db:up`, then re-run `db:migrate` and `db:seed`.

## Development

```bash
npm run dev
```

- Web app: http://localhost:5173
- Server: http://localhost:3001 (`GET /api/health` to verify)

### Opening a session board before auth exists

`/sessions/:id` sits behind the auth guard, which looks for a token in
`localStorage`. Signup/login are the Auth owner's tickets and aren't built yet,
so until they land, fake the token once in the browser console:

```js
localStorage.setItem('rt_token', 'dev');
```

Then run `npm run db:seed --workspace @roundtable/server` and open the
`/sessions/<id>` URL it prints. The board API (`GET /api/sessions/:id/proposals`)
is likewise unauthenticated in development only — in production it stays behind
`requireAuth`, which rejects everything until the real middleware lands.

### Watching proposals appear live (two windows)

Sockets identify a user from a verified JWT, which doesn't exist yet either, so
in development the handshake carries `rt_dev_user_id` instead. Without it a
socket joins as the session's leader, which is fine for one window — but two
windows would then be the same person. To act as someone else, set it to a
seeded member's id:

```js
// Bob's id — read it off any of his seeded cards, or query the users table
localStorage.setItem('rt_dev_user_id', '<user id>');
```

The id must belong to a member of that session or the join is refused; it is
never sent from a production build. Reconnect the socket after changing it —
the handshake is read once, so a page refresh is the simplest way.

Open the same `/sessions/<id>` in two windows and propose from one: the card
appears in both, highlighted briefly. Until F19 ships the sticky note tool, the
dev-only **`dev: propose sticky`** button in the board footer stands in for it.

**None of this works in production yet.** With no JWT verification, the gateway
refuses every socket: joins fail, the board shows `offline`, and proposing
returns `NOT_IN_SESSION` — the same closed-by-default posture as `requireAuth`.
Realtime starts working on Render once auth and the sessions gateway land.

## Build & Deploy

```bash
npm run build
```

Deployed to [Render](https://render.com) (auto-deploys on push to `main`). The Express process serves the built SPA plus the REST API and WebSocket events from one port. On boot, `npm start` runs `prisma migrate deploy` against Neon before starting the server, so any migrations merged to `main` apply automatically as part of the deploy.

## Other scripts

| Script              | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run build`     | Typecheck + build all workspaces     |
| `npm run test`      | Run all workspace tests              |
| `npm run lint`      | ESLint across the monorepo           |
| `npm run typecheck` | TypeScript check across the monorepo |
| `npm run format`    | Prettier write                       |

In `apps/server/`: `npm run db:migrate` (dev migration, local Postgres only), `npm run db:deploy` (apply committed migrations — run automatically by `npm start` on Render), `npm run db:seed` (demo data).

## Documentation

- [`docs/00-overview.md`](./docs/00-overview.md) - product definition, personas, glossary
- [`docs/01-feature-list.md`](./docs/01-feature-list.md) - numbered MVP features + stretch goals
- [`docs/02-architecture.md`](./docs/02-architecture.md) - architecture, data model, realtime design
- [`docs/03-tech-stack.md`](./docs/03-tech-stack.md) - technology choices and costs
- [`docs/04-implementation-plan.md`](./docs/04-implementation-plan.md) - 5-week plan and engineer tracks
- [`docs/05-pre-dev-setup-checklist.md`](./docs/05-pre-dev-setup-checklist.md) - setup-phase checklist
- [`docs/06-team-split.md`](./docs/06-team-split.md) - module ownership split
