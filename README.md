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

## Documentation

- [`docs/00-overview.md`](./docs/00-overview.md) - product definition, personas, glossary
- [`docs/01-feature-list.md`](./docs/01-feature-list.md) - numbered MVP features + stretch goals
- [`docs/02-architecture.md`](./docs/02-architecture.md) - architecture, data model, realtime design
- [`docs/03-tech-stack.md`](./docs/03-tech-stack.md) - technology choices and costs
- [`docs/04-implementation-plan.md`](./docs/04-implementation-plan.md) - 5-week plan and engineer tracks
- [`docs/05-pre-dev-setup-checklist.md`](./docs/05-pre-dev-setup-checklist.md) - setup-phase checklist
- [`docs/06-team-split.md`](./docs/06-team-split.md) - module ownership split
