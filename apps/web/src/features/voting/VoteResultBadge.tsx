export function VoteResultBadge({ kind }: { kind: 'winner' | 'tied' }) {
  if (kind === 'winner') {
    return (
      <span className="absolute -top-2 left-2 z-10 rounded-full bg-rt-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-ink">
        Winner
      </span>
    );
  }

  return (
    <span className="absolute -top-2 left-2 z-10 rounded-full bg-rt-cool-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-cool-deep">
      Tied
    </span>
  );
}

export function voteResultRing(kind: 'winner' | 'tied' | 'selected' | null): string {
  if (kind === 'winner' || kind === 'selected') {
    return 'ring-2 ring-rt-secondary ring-offset-2 ring-offset-rt-surface';
  }
  if (kind === 'tied') return 'ring-2 ring-rt-cool ring-offset-2 ring-offset-rt-surface';
  return '';
}
