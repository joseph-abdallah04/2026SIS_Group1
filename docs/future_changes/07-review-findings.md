# RoundTable — Review Findings

> Code review of the voting / recap / timers branch (`voting-summary-module`, [PR #24](https://github.com/joseph-abdallah04/2026SIS_Group1/pull/24)), 10 Sep 2026.
> Reviewed for: is all logic server-side, are the endpoints safe, is the architecture sound, is it secure.
> Full inline review: [PR #24 review](https://github.com/joseph-abdallah04/2026SIS_Group1/pull/24#pullrequestreview-5166734966).

## At a glance

| # | Finding | Severity | Status |
| - | ------- | -------- | ------ |
| 1 | Bearer JWT in the recap PDF URL | High | Fixed in `1ab67e47` |
| 2 | Unbounded canvas in the recap rasterizer | Medium | Fixed in `1ab67e47` |
| 3 | Client asserts its own vote (`myVote`) | Medium | Fixed in `1ab67e47` |
| 4 | "Is the shortlist locked" defined three times | Low | Fixed in `1ab67e47` |
| 5 | No rate limiting anywhere | Medium | Open — see effort below |
| 6 | `getSessionSummary` is N+1 across the agenda | Low | Open — low value |
| 7 | Client-side gates mirroring server rules | — | No action, by design |

## What was already right

Worth recording so nobody "fixes" it later:

- Every voting write derives the actor from `socket.data.user` / `socket.data.sessionId`, never from the payload, so a client can neither forge authorship nor write to a session it hasn't joined.
- `requireLiveLeader` / `requireLiveMember` guard every mutation, and re-read the session rather than trusting a cached role.
- The winner and any tie are declared server-side (`voteOutcomeFromTallies`) and the shortlist arrives pre-ordered; the ballot paints the ids it was given and does not rank tallies itself.
- `voterStatuses` (F29's "still to vote" list) is attached per socket, so a participant never receives it.
- The shortlist toggle takes its direction from what is stored, so a double click cannot double-count.
- Both clocks are anchored on server timestamps (`questions.discussion_started_at`, `voting_rounds.opened_at`), and voting expiry re-enters through `closeVotingRound` — the timer path and the leader's button share one set of guards. Expiry closes the ballot and stops; it never advances the agenda.

## Fixed

### 1. Bearer JWT in the recap PDF URL — High

`DownloadRecapButton` built `?token=<jwt>` and `allowQueryBearer` accepted it. That token is the same full-privilege credential used for every other API call and is valid for **7 days** (`EXPIRES_IN` in `modules/auth/jwt.ts`), so it was being written into browser history, into every proxy and platform access log on the way, and into the clipboard of anyone who copied the link. One leaked log line was a week of full account access.

The real constraint was that an `<a href>` cannot set an `Authorization` header. Fix: `api.download` in `apps/web/src/lib/api.ts` fetches with the header and saves the response as a blob under the filename the server chose; `DownloadRecapButton` is a button rather than a link. `allowQueryBearer` is deleted, and `requireAuth` has a test asserting a token in the query string is **not** accepted, so the fallback cannot reappear by accident.

### 2. Unbounded canvas in the recap rasterizer — Medium

`modules/summary/artifactPreview.ts` derived its image height from stored geometry that nothing bounds: a drawing's own `viewBox`, and a diagram node's `x` / `y` (`diagramNodeSchema` bounds `width` / `height` but not position). A member could author a diagram with `y: 1e9`, win the vote, and then any member hitting `GET /:id/summary.pdf` would ask resvg for a 1400px-wide raster a billion pixels tall.

Fix: one `artHeight()` helper clamped to `MAX_ART_H` (1600px). Both inner `<svg>`s scale with `xMidYMid meet`, so clamping letterboxes a very tall drawing rather than cropping it. Covered by `artifactPreview.test.ts`.

Also fixed in passing: the `viewBox` validity check required all four numbers to be non-zero, so `viewBox="0 0 844 480"` — what the drawing editor actually emits — failed and silently fell back to the default constants. It now checks what each number means (extents positive, origin anything) and carries the origin through. Identical output for our own drawings; correct for anything else.

### 3. Client asserts its own vote — Medium

`useVoting.castVote` did `setVoting(prev => ({ ...prev, myVote: proposalId }))` after a bare `{ ok: true }` ack, so the one piece of per-viewer voting state was decided by the UI. The public `votingUpdated` broadcast deliberately cannot carry `myVote` — but it doesn't have to be public.

Fix: `getVotingBroadcast` resolves the question, round, leader and roster in **one** read, and `emitVotingUpdated` fans that out socket by socket, attaching `myVote` (the recipient's own, always) and `voterStatuses` (the leader's only). The client no longer writes `myVote` locally. Anonymity is unchanged: a socket still only ever learns its own ballot.

This also removed a double read — the old path built the full voting state in `broadcastVoting` and again in `emitVotingUpdated`, plus a second `getSession`. `broadcastVoteClosed` no longer takes a pre-built state, so a broadcast always reflects storage rather than a caller's copy.

### 4. Shortlist-locked rule written three times — Low

`getShortlistState`, the gateway snapshot's `shortlistLocked`, and `useVoting`'s `locked` each spelled out `phase === 'open' || phase === 'closed'`. Now one predicate, `isShortlistLocked(phase)` in `@roundtable/shared`, used by all three.

## Open

### 5. No rate limiting — Medium

`POST /api/sessions/join`, `GET /api/sessions/code/:code`, `/api/auth/login`, `/api/auth/signup` and all ten socket write intents are unthrottled. The join-code space (~8.5e11) makes brute force impractical, but each `shortlistToggle` costs a `fetchSockets()` plus several queries, so holding down a click is a cheap way to load the server.

**REST — roughly half an hour.** `express-rate-limit` is one dependency with an in-memory store, and mounts in `index.ts` beside the existing `cors` / `express.json` lines. About 30 lines: a strict limiter for login and signup, a looser one for join and code lookup. It wouldn't disturb the test suite, because the route tests mount routers directly rather than the app.

Two decisions to make first, both judgement rather than code:

- **`trust proxy` is not set anywhere.** The deploy is behind one (see the Render health-check comment in `index.ts`), so `req.ip` is the proxy's address and a naive IP-keyed limiter would throttle every user as a single client. Recent `express-rate-limit` detects this and complains loudly rather than failing silently.
- **Key on `req.userId`, not IP, for authenticated routes.** A tutorial room behind one campus NAT would otherwise share a single budget. Login and signup have no user yet, so those key on IP (plus email).

**Sockets — about an hour, hand-rolled.** No library does this for Socket.IO, and this is the half that actually protects the hot path. The code is already shaped for it: both modules funnel every write through an `onWriteIntent` wrapper of identical shape (`modules/pinboard/socket.ts`, `modules/voting/socket.ts`), so one token bucket keyed on `socket.data.user.id` in a shared wrapper covers all ten intents and returns a refusal on the ack like every other rejection.

The care is in choosing limits. Ticking six shortlist cards quickly is legitimate, and **check how chatty a proposal drag is** before picking a number for `proposalUpdate` — if it emits during the drag rather than on drop, a naive limit would break moving a sticky.

### 6. `getSessionSummary` N+1 — Low

`modules/summary/service.ts` calls `listProposals(question.id)` once per question, and `listProposals` only takes a single id. Fixing it means adding a batched read to the pinboard module's public surface plus a `Map` group-by in summary — about twenty minutes, but it widens another module's API, and the payoff is one page load of an ended session (50 fast indexed queries at the question cap, on a page nobody opens in a loop). Worth doing only if that surface is being touched anyway.

## No action

### 7. Client-side gates that mirror server rules — by design

`NEXT_PHASE` in `AgendaPanel`, `count >= SHORTLIST_MIN` in `ShortlistPrompt`, `questions.length < SESSION_QUESTION_LIMIT`, and `hasProposals` all restate a server rule. Each is enforced again server-side (`PHASE_TRANSITIONS`, `startVotingRound`, `addSessionQuestion`, and `setQuestionPhase`'s `NOT_ENOUGH_TO_VOTE`), so they only decide whether a button *looks* pressable. That is duplicated affordance, not duplicated authority — removing it would give us controls that look enabled and then error.

### Notes recorded, no change wanted

- **`sessions/service.ts` reads `prisma.votingRound` directly** in `getDiscussionTimer` and `setQuestionPhase`, against docs/02 §2. It can't be inverted as things stand: the dependency runs voting → sessions, so importing voting here would close a cycle. The read is one column, and there is now a comment on `getDiscussionTimer` naming the constraint so it doesn't read as an oversight.
- **Voting deadlines are in-process `setTimeout`s.** Correct for one instance, and `recoverVotingDeadlines` re-arms them after a restart. Two instances would both fire, which is harmless because `closeVotingRound` is idempotent on a closed round — but this does not survive horizontal scaling.
- **`drawingInner`'s regex stripping is not sanitisation.** A regex cannot reliably remove behaviour from markup. It doesn't matter here because resvg is a static rasterizer with no script engine and no HTTP client, and the SVG is never served to a browser — that is the actual boundary, and the comment now says so. Do not extend those `replace` calls as though they were a defence.
