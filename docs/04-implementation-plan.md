# RoundTable — 5-Week Implementation Plan

> 7 engineers · trunk-based git · weekly Friday demo · tickets reference feature IDs from [`01-feature-list.md`](./01-feature-list.md) and modules from [`02-architecture.md`](./02-architecture.md).

## Philosophy

- **Vertical slices over layers.** An engineer owns a module _end-to-end_ (schema → API/socket events → UI), not "all the APIs" or "all the UI".
- **Walking skeleton first (Week 1).** Get an empty but _deployed_ app — login screen → authenticated page → live socket echo — before features branch out. Integration risk dies early.
- **Integrate continuously.** Merge to `main` at least every 2 days per person; feature-flag or stub anything unfinished.
- **Friday demos, no exceptions.** Working software shown weekly keeps scope honest.

## Engineer tracks

Tracks are suggestions for balancing load; each is one engineer unless noted. Pair on Week 1 setup.

| Track                        | Owns                                                                                                                                                      | Modules                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| A — Foundations & Auth       | Repo scaffold, CI/CD, auth, user profile                                                                                                                  | infra, `auth`              |
| B — Sessions & Realtime Core | Session CRUD, lobby, phase state machine, socket rooms/snapshot                                                                                           | `sessions`, `realtime`     |
| C — Pinboard & Proposals     | Shared pinboard, sticky notes, reactions, extend flow                                                                                                     | `pinboard`, tools (sticky) |
| D — Creative Tools           | Drawing tool, diagram tool, bottom toolbar UX                                                                                                             | tools (drawing/diagram)    |
| E — Voting & Summary         | Voting rounds, ballots, winner logic, session summary                                                                                                     | `voting`, `summary`        |
| F — Voice                    | LiveKit integration, tokens, mute, presence indicators                                                                                                    | `voice`                    |
| G — Frontend Shell & Polish  | App shell, routing, agenda side panel, dashboards, cross-cutting UI polish, Playwright smoke tests                                                        | web shell                  |
| H — AI Assistant             | LLM config UI + test-connection, chat side panel, bubble, context assembly, tool-calling loop (web search / diagram / sticky ideation), propose-from-chat | `assistant`                |

## Week 0 / pre-work (before coding week)

- [x] Docs written and agreed (this repo).
- [ ] Team walkthrough of architecture doc (60 min).
- [ ] Create Neon, LiveKit, Render accounts; collect secrets into a shared password manager.
- [ ] Jira board set up with epics = modules; first ticket batch created.

## Week 1 — Walking skeleton + foundations

**Goal: deployed skeleton with auth working and a live socket round-trip.**

| Track | Deliverables                                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Monorepo scaffold merged; CI (lint+build+test); Render auto-deploy; Neon wired via Prisma; `.env.example`                                 |
| A+B   | `auth`: F01–F03 signup/login/profile; JWT middleware                                                                                      |
| B     | Socket.IO gateway with JWT handshake; room join + `session:state` snapshot plumbing (empty state OK)                                      |
| G     | App shell: router, protected routes, layout, login/signup pages wired to auth API                                                         |
| C–F   | Shadow/pair with B and G to absorb conventions; spike LiveKit token issuing locally; spike canvas rendering approach                      |
| H     | Spike OpenAI-compatible chat completions + tool-calling loop against a local Ollama/OpenAI key; agree artifact JSON shapes with C/D early |

**Demo:** sign up → log in → see dashboard shell → two browsers join same socket room and exchange an echo event.

## Week 2 — Sessions & the pinboard comes alive

**Goal: a leader can create a session with questions, others join a lobby, and sticky notes sync in real time.**

| Track | Deliverables                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| B     | F04–F07 session CRUD + invite codes; F08–F09 lobby + start broadcast; F24–F25 agenda panel data + phase transitions (`discussion`) |
| C     | F14–F16 pinboard sync; F19 sticky note tool propose/edit/move/delete; F18 reactions                                                |
| D     | Toolbar shell (F22); drawing tool core (F20) — local editor first, propose via C's pipeline once ready                             |
| E     | Data model + API for voting/summary designed & merged early (schemas block nobody); begin F27 shortlist selection UI behind flag   |
| F     | F11–F13 voice in-session via LiveKit; mute toggle                                                                                  |
| G     | Agenda side panel UI (F24); participant presence list; dashboard pages (F07)                                                       |
| A     | On-call for unblocking; seed script with demo users; error-handling/toast patterns                                                 |

**Demo:** full lobby flow + everyone sees sticky notes/reactions appear instantly + voices work.

## Week 3 — The full loop closes

**Goal: complete happy path end-to-end: discussion → voting → answer → next question.**

| Track | Deliverables                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| E+G   | F27–F30 voting: shortlist modal, ballot UI, progress indicator, result reveal; F31–F32 summary generation + summary view                 |
| C     | F23 extend-proposal flow (right-click → copy-edit-repropose)                                                                             |
| D     | Diagram tool MVP (F21): containers/arrows/text JSON model + renderer on pinboard                                                         |
| B     | F26 skip question; harden phase machine edge cases (double-start, vote-with-no-proposals)                                                |
| H     | F33 LLM config settings page + connection test; context assembly wired to live session state; SSE streaming polish (abort, error states) |
| F     | Speaking indicators; reconnection handling; audio quality pass                                                                           |
| G     | Results view; empty/error states across all screens                                                                                      |
| H     | F34–F36 bubble + chat side panel UI; three tools live (web search, diagram gen, sticky ideation); F37 propose-from-chat                  |
| A     | Playwright smoke test of happy path; perf sanity (10 proposals × 6 clients)                                                              |

**Demo:** entire session played through by team, including voting and generated summary.

## Week 4 — Hardening & stretch pursuit

**Goal: robustness, edge cases, and pull stretch goals off the shelf.**

| Track | Deliverables                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| All   | Bug burn-down from Week 3 demo; unit tests for state machines & tally logic                                      |
| B/C   | Late-join mid-session (S01) if healthy — snapshot already exists by design                                       |
| D     | Tool polish: colours, eraser sizes, diagram UX refinements                                                       |
| E/F   | Transcription spike (S02) only if everything else green — otherwise document manual-summary fallback             |
| G     | Mobile-ish responsiveness check, keyboard accessibility basics                                                   |
| A     | Load test sockets; DB indexes; security pass (rate-limit auth, validate every event payload against zod schemas) |

**Demo:** chaos-testing — refresh mid-vote, disconnect audio mid-discussion, two leaders race conditions attempted.

## Week 5 — Freeze & ship

**Goal: demo-ready product. No new features after Wednesday.**

| Day     | Focus                                                                              |
| ------- | ---------------------------------------------------------------------------------- |
| Mon–Tue | Final bug fixes; copywriting pass (empty states, buttons); seed polished demo data |
| Wed     | **Feature freeze.** Full regression run of happy path on production URL            |
| Thu     | Presentation prep: script, backup video recording of the demo, README screenshots  |
| Fri     | **Final demo** 🎉                                                                  |

## Risk register

| Risk                                              | Likelihood | Mitigation                                                                                                                                                                  |
| ------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice integration stalls someone for days         | Medium     | LiveKit chosen for this reason; F pairs with B in Week 1; if still stuck by end Week 2, fall back to "join external call" link so nothing blocks                            |
| Realtime sync bugs (ghost proposals, lost votes)  | Medium     | Server-authoritative events only; single snapshot endpoint; integration tests on event handlers                                                                             |
| Free-tier cold starts hurt demos                  | High       | Hit the prod URL 2 min before any demo; document warm-up in runbook                                                                                                         |
| Scope creep (diagram tool is the danger zone)     | High       | Diagram tool capped at fixed shapes; stretch goals explicitly parked until Week 4                                                                                           |
| Assistant tool-calling flakiness across providers | Medium     | Keep MVP tools dead-simple; strict JSON schema per tool; timeout + graceful "couldn't do that" fallbacks; feature-flag the module so its absence never blocks the core loop |
| Merge conflicts across 7 people                   | Medium     | Module ownership boundaries; squash merges; ≤2-day branch lifetimes                                                                                                         |
| One engineer blocked waiting on another           | Medium     | Contracts-first: shared types merged in Week 1–2 before dependents build; mock socket server for frontend dev                                                               |

## Definition of Done (every ticket)

- [ ] Works locally against dev DB; zod-validated inputs
- [ ] Tests added for pure logic; CI green (lint/build/test)
- [ ] Merged via PR with ≥1 review; no `console.log`s; env vars documented if new
- [ ] Demoable on the deployed staging/prod URL when it touches a flow
