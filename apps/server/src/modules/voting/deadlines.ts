import type { RealtimeServer } from '../../realtime/types.js';

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
let ioRef: RealtimeServer | null = null;

export function bindVotingDeadlineIo(io: RealtimeServer): void {
  ioRef = io;
}

export function cancelVotingDeadline(roundId: string): void {
  const handle = timeouts.get(roundId);
  if (handle) clearTimeout(handle);
  timeouts.delete(roundId);
}

export function scheduleVotingDeadline(sessionId: string, roundId: string, endsAt: Date): void {
  cancelVotingDeadline(roundId);
  const delay = Math.max(0, endsAt.getTime() - Date.now());
  timeouts.set(
    roundId,
    setTimeout(() => {
      timeouts.delete(roundId);
      void fireExpiry(sessionId);
    }, delay),
  );
}

async function fireExpiry(sessionId: string): Promise<void> {
  try {
    const { expireOpenVotingIfDue } = await import('./service.js');
    const { broadcastVoteClosed } = await import('./socket.js');
    const result = await expireOpenVotingIfDue(sessionId);
    if (!result || !ioRef) return;
    await broadcastVoteClosed(ioRef, sessionId);
  } catch (err) {
    console.error(`[voting] failed to expire the ballot for ${sessionId}:`, err);
  }
}

/** Re-arm deadlines after a process restart so an open ballot still expires. */
export async function recoverVotingDeadlines(): Promise<void> {
  try {
    const { prisma } = await import('../../db.js');
    const rounds = await prisma.votingRound.findMany({
      where: { status: 'open' },
      select: {
        id: true,
        sessionId: true,
        openedAt: true,
        session: { select: { votingTimerSeconds: true } },
      },
    });

    const now = Date.now();
    for (const round of rounds) {
      if (!round.openedAt || !round.session.votingTimerSeconds) continue;
      const endsAt = new Date(round.openedAt.getTime() + round.session.votingTimerSeconds * 1000);
      if (endsAt.getTime() <= now) {
        void fireExpiry(round.sessionId);
        continue;
      }
      scheduleVotingDeadline(round.sessionId, round.id, endsAt);
    }
  } catch (err) {
    console.error('[voting] failed to recover voting deadlines:', err);
  }
}
