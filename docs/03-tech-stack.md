# RoundTable — Tech Stack

> Principle: **boring, free, and TypeScript end-to-end**. Every choice optimises for a 7-person team shipping an MVP in 5 weeks.

## The stack at a glance

| Layer                   | Choice                                                                                                   | Why                                                                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language                | **TypeScript (strict)** everywhere                                                                       | Team already knows it; one language across frontend/backend/shared                                                                                                                                  |
| Frontend                | **React 18 + Vite**                                                                                      | Team comfort; Vite = instant dev server & simple builds                                                                                                                                             |
| Routing / data fetching | **React Router** + plain `fetch` wrapper                                                                 | No heavyweight frameworks needed at this scale                                                                                                                                                      |
| Styling                 | **Tailwind CSS v4**                                                                                      | Fast iteration, no design-system debates, consistent look                                                                                                                                           |
| Backend                 | **Node.js + Express + Socket.IO** (single process)                                                       | Express is the simplest widely-known HTTP framework; Socket.IO adds rooms/reconnect on top of WebSockets                                                                                            |
| ORM / DB                | **Prisma + PostgreSQL (Neon free tier)**                                                                 | Prisma gives typed queries & migrations from day one; Postgres is the safe long-term choice                                                                                                         |
| Validation              | **zod** (in `packages/shared`)                                                                           | One schema validates API bodies, socket payloads, and forms                                                                                                                                         |
| Voice chat              | **LiveKit Cloud (free Build plan)**                                                                      | Managed WebRTC: we'd never build/stabilise audio infra ourselves in time. Free: 5,000 participant-minutes/mo, 50GB downstream                                                                       |
| AI Assistant            | **Bring-your-own OpenAI-compatible endpoint** (user-configured base URL/key/model) + native tool-calling | Zero platform cost — users pay their own provider (OpenAI, Groq, Ollama, LM Studio, anything compatible). One integration covers them all; web search via the free DuckDuckGo HTML endpoint for MVP |
| Auth                    | **Email+password with bcrypt + JWT**                                                                     | No external identity provider needed; simplest thing that satisfies F01–F03                                                                                                                         |
| Testing                 | **Vitest** (+ Playwright smoke later)                                                                    | Fast, TS-native, same runner style as the codebase                                                                                                                                                  |
| Lint/format             | **ESLint (flat) + Prettier**                                                                             | Consistent code without arguments                                                                                                                                                                   |
| Monorepo                | **npm workspaces**                                                                                       | Built into npm; zero extra tooling to learn                                                                                                                                                         |
| Hosting                 | **Render (free web service)** serving app + API + sockets                                                | One deploy target; supports WebSockets                                                                                                                                                              |
| Database hosting        | **Neon (free tier)**                                                                                     | Serverless Postgres, no credit card, generous free allowance                                                                                                                                        |
| CI                      | **GitHub Actions**                                                                                       | Already where the repo lives                                                                                                                                                                        |

## Why not the alternatives?

- **Supabase instead of Neon:** Supabase bundles auth/storage/realtime we're building ourselves — nice later, but its realtime/auth would _replace_ learning goals and add vendor coupling. Plain Neon keeps our backend the single brain.
- **Firebase:** locks data model into NoSQL; voting/agenda state machines fit relational much better.
- **Next.js instead of Vite SPA:** SSR buys nothing here (app is behind login, fully interactive); Next adds concepts (server components, caching) that slow a 7-person team down.
- **Raw WebRTC instead of LiveKit:** building SFU/mesh audio + NAT traversal ourselves is weeks of work. LiveKit SDK is ~20 lines to join a room.
- **Two repos:** shared types would drift; npm workspaces solve this trivially.
- **GraphQL/tRPC:** REST + zod is simpler; socket events already cover live needs.
- **SQLite on server disk:** Render free tier has **no persistent disk** — files vanish on redeploy/sleep. Hosted Postgres avoids losing all session data.

## Cost picture (MVP)

| Service            | Plan         | Cost                              |
| ------------------ | ------------ | --------------------------------- |
| Render web service | Free         | $0                                |
| Neon Postgres      | Free tier    | $0                                |
| LiveKit Cloud      | Build (free) | $0 (5,000 participant-minutes/mo) |
| GitHub             | —            | $0                                |

Total: **$0/month** for us to run. Known limits: Render sleeps after ~15 min idle (30s cold start); LiveKit minutes reset monthly (~83 hours of one-person-time; fine for demos). The AI assistant costs each _user_ whatever their chosen LLM provider charges (or nothing on local/free providers) — the platform never pays for inference.

## External accounts needed (create during Week 1 setup)

1. [Neon](https://neon.tech) → create project → copy connection string.
2. [LiveKit Cloud](https://cloud.livekit.io) → create project → note API key/secret + URL.
3. Render → connect GitHub repo → create web service.

All secrets go in Render env vars / local `.env` (never committed). `.env.example` documents every variable:

```
DATABASE_URL=          # Neon connection string
JWT_SECRET=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LLM_KEY_ENCRYPTION_SECRET=   # AES key for encrypting user LLM API keys at rest
PORT=3001
CLIENT_ORIGIN=         # dev only, for Vite proxy alternative
```
