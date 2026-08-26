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

## Database (Prisma + Neon)

Schema lives in `apps/server/prisma/schema.prisma`. From `apps/server/`:

```bash
npm run db:migrate   # create/apply a dev migration (prompts for a name)
npm run db:seed      # seed demo users + session DEMO-0001 (local only)
```

Conventions: tables snake_case + plural via `@@map`; add your module's tables under its labeled comment. Module owners author migrations in their own PRs (see docs/05 §9).

### Migrations — team workflow

Every migration is a numbered SQL folder in git (`apps/server/prisma/migrations/`); Prisma tracks which have run in a `_prisma_migrations` table inside the database. The DB's history lives in the repo, ordered by folder name.

1. `git pull` latest `main` **before** touching the schema.
2. Edit `schema.prisma` — only under your module's labeled section.
3. Run `npm run db:migrate` (in `apps/server/`), give it a clear name.
4. Commit schema + new migration folder together in your PR.

If two people migrate at once, whoever merges first sets the order. After pulling main, Prisma replays their migration before applying yours. Conflicts only happen if you changed the same table — keep to your own module's tables and this is rare. Rules of thumb:

- Never edit a merged migration — fix forward with a new one.
- Local state gone weird? `npx prisma migrate reset` (wipes local data, replays all migrations) then `npm run db:seed`.

## Development

```bash
npm run dev
```

- Web app: http://localhost:5173
- Server: http://localhost:3001 (`GET /api/health` to verify)

## Build & Deploy

```bash
npm run build
```

Deployed to [Render](https://render.com) (auto-deploys on push to `main`). The Express process serves the built SPA plus the REST API and WebSocket events from one port.

## Other scripts

| Script              | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm run build`     | Typecheck + build all workspaces     |
| `npm run test`      | Run all workspace tests              |
| `npm run lint`      | ESLint across the monorepo           |
| `npm run typecheck` | TypeScript check across the monorepo |
| `npm run format`    | Prettier write                       |

In `apps/server/`: `npm run db:migrate` (dev migration), `npm run db:deploy` (apply committed migrations — used by Render pre-deploy), `npm run db:seed` (demo data).

## Documentation

- [`docs/00-overview.md`](./docs/00-overview.md) - product definition, personas, glossary
- [`docs/01-feature-list.md`](./docs/01-feature-list.md) - numbered MVP features + stretch goals
- [`docs/02-architecture.md`](./docs/02-architecture.md) - architecture, data model, realtime design
- [`docs/03-tech-stack.md`](./docs/03-tech-stack.md) - technology choices and costs
- [`docs/04-implementation-plan.md`](./docs/04-implementation-plan.md) - 5-week plan and engineer tracks
- [`docs/05-pre-dev-setup-checklist.md`](./docs/05-pre-dev-setup-checklist.md) - setup-phase checklist
- [`docs/06-team-split.md`](./docs/06-team-split.md) - module ownership split
