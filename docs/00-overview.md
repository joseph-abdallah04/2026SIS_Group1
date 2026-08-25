# RoundTable — Project Overview

> Collaborative brainstorming, ideation, and planning tool for software teams.

## What is RoundTable?

RoundTable is a web application where a team runs **facilitated brainstorming sessions**. A session leader (typically the team lead) prepares an agenda of questions, invites teammates into a live voice-enabled room, and everyone proposes ideas onto a shared pinboard using creative tools (sticky notes, drawings, diagrams). The team discusses, reacts to, and builds on each other's proposals, then votes. The winning proposal becomes the recorded answer to that question, and at the end of the session everyone walks away with a structured summary of decisions made.

**MVP niche:** software development teams planning features, architecture, and tech choices.
**Future:** generalise to any team that brainstorms (product, design, marketing…).

## Personas

| Persona | Description | Key abilities |
| --- | --- | --- |
| **Session Leader** | A session-specific role: whoever creates and starts a session becomes the session leader for that session. Any user can create sessions from their dashboard and view past sessions they created (and their summaries). The leader role applies only within that session. | Everything a participant can do, plus: create/configure sessions, invite members, start/skip/advance phases, curate voting shortlists, end session |
| **Participant** | An invited team member joining a session | Join via invite, talk in voice chat, propose ideas, react, extend others' proposals, vote |

## Core concepts (glossary)

| Term | Meaning |
| --- | --- |
| **Session** | A scheduled live meeting with a focus/title and an ordered list of questions |
| **Question / Agenda item** | One prompt the leader wants answered during the session (e.g. "What are our core features?") |
| **Phase** | Current stage for the active question: `lobby → discussion → voting → results`, repeated per question |
| **Proposal** | An idea artifact placed on the pinboard by a user — a sticky note, drawing, or diagram. Its author has full CRUD over it |
| **Pinboard** | The shared canvas visible to all participants where proposals live |
| **Reaction** | A quick emoji-style response attached to a proposal, signalling consensus |
| **Extend** | Copying someone else's proposal into your own editor to modify and re-propose as your own (original untouched) |
| **Voting round** | Leader-curated shortlist of proposals; each member picks one; winner becomes the question's answer |
| **Answer** | The proposal voted best for a given question; recorded in the session summary |
| **Session summary** | Generated artifact listing every question with its winning answer (or `skipped` status), plus optional call transcript |
| **AI Assistant** | Each participant's personal, optional LLM-powered ideation buddy. Lives behind an animated floating bubble (bottom-right) that expands into a chat side panel. Knows what's happening in the session, can search the web, generate diagrams/sticky notes, and push proposals straight onto the pinboard. Each user configures their own LLM provider in settings |

## Document map

| Doc | Contents |
| --- | --- |
| [`00-overview.md`](./00-overview.md) | This file — product definition, personas, glossary |
| [`01-feature-list.md`](./01-feature-list.md) | Numbered MVP feature list + stretch goals |
| [`02-architecture.md`](./02-architecture.md) | Modular monolith architecture, data model, realtime event catalogue, repo layout, coding conventions |
| [`03-tech-stack.md`](./03-tech-stack.md) | Technology choices with rationale and cost notes |
| [`04-implementation-plan.md`](./04-implementation-plan.md) | Week-by-week plan across the 5-week window, engineer tracks, risks |

## Ground rules

- **5-week development window**, 7 engineers, parallel ticket work.
- **Free tiers only** for hosting and third-party services during the MVP.
- **Modular monolith**: one deployable app, internally split into independent modules so engineers can work without stepping on each other.
- TypeScript everywhere; types shared between frontend and backend from a single source.
