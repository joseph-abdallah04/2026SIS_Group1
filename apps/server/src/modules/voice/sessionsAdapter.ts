// Temporary adapter over the `sessions` module.
//
// docs/02 §2: a module never queries another module's tables. The `sessions`
// module does not exist yet, so this file stands in for its public surface —
// and it is the ONLY file in `voice/` allowed to read `sessions`/
// `session_members` rows. Everything else in this module goes through it.
//
// When the Session Lifecycle owner lands their module, this file collapses to:
//   export { getMember } from '../sessions/index.js';
// and no other voice file changes.
//
// Mirrors `modules/pinboard/sessionsAdapter.ts`, which set this pattern.
import { prisma } from '../../db.js';

/** A person entitled to be in a session's room, as voice needs to know them. */
export interface SessionParticipant {
  id: string;
  displayName: string;
}

/**
 * The membership row behind "only current participants get a token" (F11).
 *
 * `null` covers both "not a member" and "no such session", deliberately: the
 * route turns both into the same 403, so a caller cannot use the status code to
 * discover which session ids exist.
 */
export async function findSessionParticipant(
  sessionId: string,
  userId: string,
): Promise<SessionParticipant | null> {
  const membership = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId } },
    select: { user: { select: { id: true, displayName: true } } },
  });

  return membership?.user ?? null;
}
