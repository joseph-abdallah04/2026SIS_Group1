# RoundTable — Feature List (MVP)

Features are numbered (`F##`) so tickets on the Kanban board can reference them. Each feature lists the owning **module** — see [`02-architecture.md`](./02-architecture.md) for module boundaries.

## 1. Accounts & Identity — module: `auth`

| ID  | Feature                              | Notes                                                       |
| --- | ------------------------------------ | ----------------------------------------------------------- |
| F01 | Sign up with email + password        | Hashed with bcrypt; email uniqueness enforced               |
| F02 | Log in / log out                     | JWT access token stored client-side; expiry ~7 days for MVP |
| F03 | View/edit own profile (display name) | Display name is what others see in session                  |

## 2. Session Creation & Configuration — module: `sessions`

| ID  | Feature                                                   | Notes                                     |
| --- | --------------------------------------------------------- | ----------------------------------------- |
| F04 | Create a session: focus/title + ordered list of questions | Creator becomes session leader            |
| F05 | Edit/delete a session before it starts                    | Leader only                               |
| F06 | Generate invite link/code to join a session               | Short code e.g. `ABC-1234`; shareable URL |
| F07 | Dashboard listing "my sessions" (hosted & invited)        | With status: upcoming, completed          |

## 3. Lobby & Joining — module: `sessions` (+ `realtime`)

| ID  | Feature                                                                         | Notes                                                                 |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| F08 | Waiting room before the leader starts                                           | Participants see who has joined; leader sees join notifications       |
| F09 | Leader starts the session → everyone transitions into the main session together | Server-driven state change broadcast to all                           |
| F10 | Late join while session in progress                                             | Joiner receives current state snapshot and syncs. _Stretch — see S01_ |

## 4. Voice Chat — module: `voice`

| ID  | Feature                                                       | Notes                                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------- |
| F11 | In-session voice chat between all participants (incl. leader) | LiveKit room per session, auto-join on session start |
| F12 | Mute/unmute self                                              | Mic toggle in toolbar                                |
| F13 | Participant list showing who's present & speaking indicator   | LiveKit participant events                           |

## 5. Shared Pinboard — module: `pinboard` (+ `realtime`)

| ID  | Feature                                                   | Notes                                                                    |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| F14 | Shared pinboard visible identically to all participants   | Single source of truth on server; state synced via WebSocket             |
| F15 | Proposals appear for everyone in real time when submitted | Sub-second propagation                                                   |
| F16 | Author CRUD over own proposals (move, edit, delete)       | Only the author can modify/delete their proposal; changes broadcast live |
| F17 | Leader can remove any proposal (moderation)               | Optional safeguard                                                       |
| F18 | Reactions on proposals (emoji-style)                      | Toggle-on/toggle-off per user per emoji; counts visible to all           |

## 6. Proposal Tools — module: `tools` (UI) + `pinboard` (persistence)

| ID  | Feature                                                                                                                                                                                                                                                                         | Notes                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F19 | Sticky note tool: type text → propose → appears on pinboard                                                                                                                                                                                                                     | Colour options                                                                                                                                                                                                                                         |
| F20 | Drawing tool: freehand draw with colours, pen sizes, eraser → propose as image artifact                                                                                                                                                                                         | Rendered as SVG or PNG data                                                                                                                                                                                                                            |
| F21 | Diagram tool: popup canvas editor with containers, elements, arrows, text → propose as diagram artifact                                                                                                                                                                         | Simple node/edge model persisted as JSON; MVP = fixed element shapes. Post-MVP contract v2 adds optional bounded resize + a curated style palette; v3 adds an expanded closed shape registry and semantic container grouping. All backwards compatible |
| F22 | Floating bottom toolbar hosting all tools                                                                                                                                                                                                                                       | Consistent propose flow regardless of tool                                                                                                                                                                                                             |
| F23 | Right-click a proposal to open a context menu. Choosing "Extend" opens the same editor pre-filled with a copy so the user can modify and re-propose it as their own. The right-click menu also exposes CRUD actions (edit, delete) and quick reaction buttons for the proposal. | Original untouched; new proposal links back to its parent (`extendsProposalId`)                                                                                                                                                                        |

## 7. Agenda & Phase Progression — module: `sessions` (+ `realtime`)

| ID  | Feature                                                                                   | Notes                                                                   |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| F24 | Collapsible agenda side panel listing focus + all questions, current question highlighted | Same view for everyone                                                  |
| F25 | Leader controls phases: start discussion → start voting → show results → next question    | Button(s) only rendered/enforced for leader; server validates authority |
| F26 | Leader skips a question                                                                   | Recorded as `skipped` in summary                                        |

## 8. Voting — module: `voting` (+ `realtime`)

| ID  | Feature                                                                                       | Notes                                                      |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| F27 | Leader multi-selects proposals to form voting shortlist                                       | From proposals made during that question's discussion      |
| F28 | All participants (incl. leader) cast one vote each from the shortlist                         | Vote choices private; tally hidden until close             |
| F29 | Live "who hasn't voted yet" indicator                                                         | Names/avatars, not vote contents                           |
| F30 | When all votes are in, winner auto-declared; winning proposal marked as the question's answer | Tie-break: most recent proposal wins, documented behaviour |

## 9. Session Summary — module: `summary`

| ID  | Feature                                                                            | Notes                                                                 |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| F31 | Auto-generated summary at session end: each question + winning answer (or skipped) | Viewable by all participants; accessible after session from dashboard |
| F32 | Leader presses "End session" → summary shown → members leave                       | Voice disconnects cleanly                                             |

## 10. Personal AI Assistant — module: `assistant`

Each participant gets their own AI agent available at any point during a session. Users bring their own LLM provider (OpenAI-compatible base URL + API key + model name), so the platform pays nothing and nobody's data leaves their chosen provider except what they send in chat.

| ID  | Feature                                                                                                                                                                                   | Notes                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| F33 | User settings page: configure LLM provider (base URL, API key, model name) + "Test connection" button                                                                                     | Key stored server-side only, never returned to the client after saving; clear success/failure feedback                                               |
| F34 | Floating animated AI bubble (bottom-right) visible throughout a session; click expands it into a floating chat side panel on the right                                                    | Collapsible; doesn't obstruct the toolbar/pinboard                                                                                                   |
| F35 | Context-aware chat: the agent automatically receives current session context (session title, active question + phase, recent proposals, and whatever pinboard item the user has selected) | User asks questions, gets quick answers during ideation                                                                                              |
| F36 | Three agent tools for MVP: **web search**, **create diagram**, **sticky ideation**                                                                                                        | Web search returns sourced snippets; create-diagram produces mermaid/SVG rendered as a preview; sticky ideation generates 3–5 candidate sticky notes |
| F37 | One-click "Propose" from the chat window: any diagram/sticky artifact the agent produced can be sent directly to the pinboard                                                             | Goes through the normal proposal pipeline; authored by the requesting user                                                                           |

## Stretch goals (post-MVP, not committed)

| ID  | Feature                                                | Notes                                                                                                   |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| S01 | Late join mid-session                                  | Requires robust state-snapshot API — design for it early even if built later                            |
| S02 | Call transcription as session artifact                 | LiveKit offers E2E transcripts on paid tiers; MVP alternative: record key decisions manually in summary |
| S03 | Templates for common sessions (retro, sprint planning) | Pre-filled question sets                                                                                |
| S04 | Export summary as Markdown/PDF                         | Trivial once F31 exists                                                                                 |
| S05 | Guest access without an account                        | Name-only identity for quick joins                                                                      |
