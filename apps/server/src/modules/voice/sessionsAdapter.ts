// The Session Lifecycle owner's module has landed, exactly as anticipated
// below — this collapses to a thin re-export of its public surface, and no
// other voice file changes (`service.ts` still imports `findSessionParticipant`
// by that name and gets the same `{id, displayName} | null` shape).
//
// `getSessionMemberIdentity` is the right function to reuse rather than
// `assertSessionMember`: it requires `leftAt: null` ("having once been in a
// session is not permission to sit in its room" — sessions/service.ts), which
// is exactly F11's "only current participants get one". `assertSessionMember`
// deliberately lets someone who has *left* through, because it guards
// read-only access to a session's history — the wrong rule for handing out a
// live voice-room token.
export { getSessionMemberIdentity as findSessionParticipant } from '../sessions/index.js';
export type { SessionMemberIdentity as SessionParticipant } from '../sessions/index.js';
