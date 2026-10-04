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

| ID  | Feature                                                   | Notes                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F14 | Shared pinboard visible identically to all participants   | Single source of truth on server; state synced via WebSocket                                                                                                                                                                   |
| F15 | Proposals appear for everyone in real time when submitted | Sub-second propagation. The server places each new card clear of every card already there, so two proposed at once never land on each other                                                                                    |
| F16 | Author CRUD over own proposals (move, edit, delete)       | Only the author can modify/delete their proposal; changes broadcast live. Moving waits for the leader to unlock the board (F40)                                                                                                |
| F17 | Leader can remove any proposal (moderation)               | Optional safeguard                                                                                                                                                                                                             |
| F18 | Reactions on proposals (emoji-style)                      | One per person per proposal; counts visible to all                                                                                                                                                                             |
| F38 | Reuse your own earlier proposal on a later question       | Copies rather than moves; recorded like an extension (F23)                                                                                                                                                                     |
| F40 | Board lock: the leader decides who may move proposals     | Per question, set under it in the agenda; every question starts locked, so only the leader moves proposals. Unlocked, members may also move their own. Positions only: proposing, editing, deleting and reacting are unchanged |

## 6. Proposal Tools — module: `tools` (UI) + `pinboard` (persistence)

| ID  | Feature                                                                                                                                                                                                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F19 | Sticky note tool: type text → propose → appears on pinboard                                                                                                                                                                                                                     | Colour options                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F20 | Drawing tool: freehand draw with colours, pen sizes, eraser → propose as image artifact                                                                                                                                                                                         | Rendered as SVG or PNG data                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| F21 | Diagram tool: popup canvas editor with containers, elements, arrows, text → propose as diagram artifact                                                                                                                                                                         | Simple node/edge model persisted as JSON; MVP = fixed element shapes. Post-MVP contract v2 adds optional bounded resize + a curated style palette; v3 adds an expanded closed shape registry and semantic container grouping; **v4 makes it the studio canvas** — freehand ink, decorative pen/line paths, spreadsheet-style tables and an explicit paint order alongside the shapes, so one artifact can be sketched, drawn, tabulated and diagrammed together. All backwards compatible |
| F22 | Floating bottom toolbar hosting all tools                                                                                                                                                                                                                                       | Consistent propose flow regardless of tool                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F23 | Right-click a proposal to open a context menu. Choosing "Extend" opens the same editor pre-filled with a copy so the user can modify and re-propose it as their own. The right-click menu also exposes CRUD actions (edit, delete) and quick reaction buttons for the proposal. | Original untouched; new proposal links back to its parent (`extendsProposalId`)                                                                                                                                                                                                                                                                                                                                                                                                           |
| F39 | Image import: bring a picture onto the board from the toolbar's Image button, by dropping a file on the board, or by pasting a screenshot. A dialog crops it (a free crop, starting as the whole picture) and proposes it. No caption, like every other proposal                | Re-encoded on the client — JPEG, or PNG where it has transparency — to at most 1600px and ~300KB, so it travels in board snapshots like any other artifact. Never SVG, never an address: the server checks the bytes are the format the data URL claims, and reads the picture's size from its own header rather than trusting the proposal's. No editor, so no Edit or Extend; Reuse (F38) proposes a copy directly                                                                      |

## 7. Agenda & Phase Progression — module: `sessions` (+ `realtime`)

| ID  | Feature                                                                                            | Notes                                                                                       |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F24 | Collapsible agenda side panel listing focus + all questions, current question highlighted          | Same view for everyone                                                                      |
| F25 | Leader controls phases: start discussion → start voting → show results → next question             | Button(s) only rendered/enforced for leader; server validates authority                     |
| F26 | Leader skips a question                                                                            | Recorded as `skipped` in summary                                                            |
| F41 | Brainstorm-only questions: leader turns a question's vote off, at setup or live until voting opens | Runs discussion → answered with no vote; recorded as "Discussed" in summary with every idea |

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
| F34 | Collapsible assistant rail on the right of the board, the same chrome as the agenda. Opens into the private chat.                                                                        | Starts collapsed so the board stays clear. Escape does not close it. A ballot keeps the collapsed strip so the board does not resize underneath.   |
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
