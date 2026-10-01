/**
 * Whether this viewer may move a proposal around the board.
 *
 * Only while the board is open for the question. The leader may move anything.
 * Anyone else may move their own, and only while the leader has left the board
 * unlocked. The server holds every move to the same rule.
 */
export function canMoveProposal({
  boardOpen,
  isLeader,
  boardLocked,
  viewerId,
  authorId,
}: {
  boardOpen: boolean;
  isLeader: boolean;
  boardLocked: boolean;
  viewerId: string | null;
  authorId: string | null;
}): boolean {
  if (!boardOpen) return false;
  if (isLeader) return true;
  return !boardLocked && viewerId !== null && authorId === viewerId;
}
