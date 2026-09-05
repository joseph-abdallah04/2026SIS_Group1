# Future scaling issue: one Node process and Socket.IO rooms

> **This file is purely documentation for the future.** It is not a bug in the current product, not a ticket to implement now, and not a reason to change how RoundTable ships for the class / MVP. The single-process Socket.IO design was a deliberate Week 1 choice (`docs/02-architecture.md` §4 and §9). Write this down so a later team does not “just add another server” and discover that live sessions silently split in half.

---

## The short version

RoundTable’s live collaboration is not “HTTP plus a database.” Every waiting room, pinboard update, agenda change, and presence list is a Socket.IO **room** on **one Node process**. That process also serves REST and (in production) the built SPA.

That is the right shape for a handful of concurrent workshops. It is the thing that stops being true if you ever need many live sessions at once, or more than one server instance. Postgres can already be shared. The socket rooms cannot.

---

## What we actually run today

`apps/server/src/index.ts` creates one HTTP server and one Socket.IO `Server` (`io`) at boot. REST routes that must announce a fact to a live room — start, end, phase, leave — take that **same** `io` as a factory argument. The gateway (`apps/server/src/realtime/gateway.ts`) registers on it too.

There is no Redis adapter, no sticky-session load balancer, no second Node process. Socket.IO’s default adapter keeps rooms in **this process’s memory**. `sessionRoom(id)` is just the string `session:{sessionId}` (`apps/server/src/realtime/types.ts`). A client that has passed JWT + membership joins that room; every later `io.to(sessionRoom(id)).emit(...)` is a fan-out to the sockets that adapter currently lists.

On Render this is one Web Service. One event loop, one set of TCP connections, one `io`.

---

## Why rooms work on a single process

A session is a small, strongly consistent group: everyone must see the same “here now” list, the same board snapshot, and the same `sessionStarted` / `sessionPhase` / `sessionEnded` at the same time.

The gateway does that by treating the room as the live set:

1. `memberJoin` authenticates, `socket.join(sessionRoom(sessionId))`, then emits `sessionState` to **this** socket (full board + `participants` derived from who is already in the room).
2. If this was the user’s first socket in that room, it emits `memberJoined` to everyone else in the room.
3. On disconnect, it asks whether any **other** socket for that user is still in the room; only if not does it emit `memberLeft`.
4. Pinboard handlers broadcast `proposalCreated` / `proposalUpdated` / `proposalDeleted` to the same room.
5. REST success paths call `emitSessionStarted`, `emitSessionPhase`, `emitSessionEnded` on the same `io`, so the HTTP command and the live clients cannot disagree about which process “owns” the room.

Presence is **not** a Postgres row. `SessionMember` is history (who took part, vote denominator, `leftAt`, dashboard hide). “Who is online right now” is whichever sockets `io.in(sessionRoom(id)).fetchSockets()` returns. The architecture doc is explicit: never persist presence; it would desync from the sockets and die on every Render restart anyway.

That design is coherent **because there is only one `io`**. `fetchSockets()` sees every participant. A leave via REST can walk those sockets, pull this user out of the room, and emit `memberLeft` once. A second tab is still the same user in the same process’s room map, so they are not announced twice.

---

## What breaks if you add a second Node instance

Horizontal scale for HTTP is “put a load balancer in front, run N copies, share the database.” For this gateway that is a silent correctness bug, not a performance win.

Suppose Alice’s browser lands on instance A and Bob’s on instance B, both in session `S`.

- Each instance has its own in-memory adapter. Alice joins `session:S` on A. Bob joins `session:S` on B. Those are **two different rooms** that happen to share a name.
- Alice proposes a sticky. Instance A persists it (Postgres is shared — good) and broadcasts to A’s room. Bob never gets `proposalCreated`. He still has the old board until he refreshes and happens to hit A — or he never does.
- The leader hits `POST /:id/start` on whichever instance the REST request reached. Only that instance’s `io` emits `sessionStarted`. Half the waiting room stays in the lobby.
- `getRoomParticipants` / leave’s `fetchSockets()` only see sockets on **this** instance. Alice’s waiting room shows Alice. Bob’s shows Bob. Disconnect on A cannot emit `memberLeft` to B.
- Two tabs for the same user, if they land on different instances, look like two people — or like one person who never left — depending on which instance you ask.

Sticky load-balancer sessions (pin a given TCP connection to one instance) do **not** fix this. They only keep *one client* talking to *one* process. They do not put Alice and Bob in the same in-memory room. The standard Socket.IO answer is a **cross-process adapter** (almost always Redis: `@socket.io/redis-adapter`) so `to(room)` and `fetchSockets()` are cluster-wide. Until that exists, **one live Node process is an invariant**, not an accident.

The architecture doc already flagged this: “the actual scaling bottleneck is WebSocket fan-out (multiple server instances need sticky sessions)” — and even that phrasing is incomplete. Sticky sessions without a Redis adapter still split rooms. The adapter is the real requirement; sticky sessions are optional extra (they reduce cross-talk, they are not a substitute).

---

## What 10,000 concurrent connections actually stress

“10,000 registered accounts” is a database question and is fine. **10,000 sockets open at once on this process** is a different ceiling.

Each connected client is a long-lived TCP connection, Socket.IO bookkeeping, and (while they are in a session) a room membership. That all sits on **one Node event loop**.

What gets expensive is not “can Postgres store 10k users.” It is:

**Fan-out.** A proposal, drag, phase change, or presence event is copied to every socket in that room. A 30-person board is cheap. Many simultaneous large rooms on one process add up. High-frequency events (docs/02 already calls out ~60 drag events/second) are the real multiplier: broadcast every frame, persist rarely.

**Join snapshots.** `memberJoin` loads the full board (`getBoardForSession`) and the current participant list, then sends `sessionState` to the joining socket. A reconnecting client — or React Strict Mode’s double mount — pays that cost again. Drawings and diagrams are JSON/SVG strings in the row. One large board times many reconnects is CPU and bandwidth on the same process that is also fanning out live events.

**`fetchSockets()` on the hot path.** Presence dedup, the join snapshot’s `participants`, and REST leave all enumerate the room. On one process that is “sockets in this session,” which stays small. It is still synchronous work on the event loop, and without a Redis adapter it cannot be sharded.

**Everything else on the same loop.** bcrypt on login, Prisma, serving `apps/web/dist` in production, JSON parse of artifacts. A spike of joins during “the lecturer said open the link” is the ugly case: many `memberJoin` handlers, many board reads, many snapshots, all competing with existing rooms’ broadcasts.

**Process death.** Render restarts on deploy and can sleep on the free tier. In-memory rooms vanish. Clients reconnect and `memberJoin` again (the client already re-emits on `connect` — `apps/web/src/lib/socket.ts`). That is acceptable for a demo. It means you cannot “scale” by holding more presence in RAM; the database is the source of truth for everything except who’s online *this second*.

A single well-sized Node process can hold a lot of idle WebSockets. RoundTable sockets are not idle: they carry board payloads and room broadcasts. Treat “one process, many concurrent live workshops” as the limit to measure before adding instances — and when you add instances, do the adapter work first or live sessions will be wrong rather than merely slow.

---

## REST and sockets share one `io` on purpose

Start, end, and phase are REST (docs/02 §5): one authorised command, a status code the button can show, then a broadcast of the resulting fact. Leave is REST too, then the route walks `io.in(room).fetchSockets()` so “Here now” updates before the tab closes.

That only works while HTTP and WebSocket upgrades hit the **same** `io` instance. Split “API replicas” from “socket replicas” without an adapter and those REST handlers will announce into an empty room on the replica that handled the POST. Any future split of the SPA onto a CDN (docs/02 §9 Pattern B) does **not** by itself fix this — Pattern B still leaves one API process unless you also cluster `io`.

---

## What is not this problem

Dashboard hide (`SessionMember.hiddenAt`) and last-member GC of ended sessions are ordinary indexed Postgres writes. They scale with *this user’s* memberships, not with live socket count. Do not “fix scaling” by changing that model.

Persisting presence into `SessionMember` would also not fix clustering. It would mix history with “online now,” fight `leftAt`, and go stale on every disconnect the process missed. The in-memory room is the correct presence model; clustering it means sharing the room map (Redis adapter), not writing it to SQL.

---

## What to do later (when this is a real product)

Do not do this for the coursework unless you have measured a real ceiling.

1. **Keep one process** until a live-session count or a load test says otherwise. It is simpler and it is correct.
2. **When you need more than one Node process**, add a Socket.IO Redis adapter (or equivalent) *before* the second replica. Confirm `fetchSockets()`, `memberJoined` / `memberLeft` dedup, REST leave, and `emitSessionStarted` / `Phase` / `Ended` all see a cluster-wide room.
3. **Optionally** pin WebSocket upgrades (sticky sessions) so a given client stays on one instance; this is tuning, not the consistency fix.
4. **If join snapshots or drag fan-out show up in profiles**, follow docs/02: throttle persist on drag, consider a small in-memory cache for membership/phase *validation* only, still write through to Postgres. Do not invent a second source of truth for the board.
5. **If the SPA and API split**, that is independent (static host + `CLIENT_ORIGIN`). The socket clustering problem remains on the API side.

Until then, the invariant is: **one live `io`, rooms in process memory, presence = sockets in `session:{id}`.** That is why the product feels instant in a workshop, and why “just scale out the Node service” is the future foot-gun this file exists to name.
