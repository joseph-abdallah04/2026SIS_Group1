import { useState } from 'react';
import type { StickyColor } from '@roundtable/shared';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';

/**
 * ⚠️ Development only — delete this file when F19 (sticky note tool) lands.
 *
 * F15 is the realtime pipeline; the editors that feed it are the Creative Tools
 * owner's F19–F21. Without *something* that can create a proposal there is no
 * way to see the broadcast work, so this is the smallest possible producer: it
 * sends the same `proposalCreate` intent the real tools will send, and takes no
 * other path through the system.
 *
 * Excluded from production builds by the `import.meta.env.DEV` guard at its
 * call site, which Vite statically eliminates.
 */

const COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];

const IDEAS = [
  'Ship the realtime board first',
  'Keep every client in the server’s order',
  'Refetch on reconnect, always',
  'Highlight new cards, quietly',
  'One write path for every tool',
];

interface DevProposeButtonProps {
  propose: (input: ProposalCreateInput) => Promise<void>;
}

export function DevProposeButton({ propose }: DevProposeButtonProps) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const onClick = () => {
    setPending(true);
    setFailure(null);
    void propose({
      type: 'sticky',
      artifactJson: {
        type: 'sticky',
        text: IDEAS[Math.floor(Math.random() * IDEAS.length)] ?? 'Test proposal',
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? 'yellow',
      },
      // Positions are recorded but not honoured until F16 (drag to move).
      x: 0,
      y: 0,
    })
      .catch((err: unknown) => setFailure(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setPending(false));
  };

  return (
    <div className="flex items-center gap-2">
      {failure ? <span className="text-[11px] text-rt-secondary-deep">{failure}</span> : null}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        title="Development only — stands in for the F19 sticky note tool"
        className="rounded-full border border-dashed border-rt-secondary px-3 py-[6px] text-[11px] font-medium text-rt-secondary-deep hover:bg-rt-secondary-wash disabled:opacity-50 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
      >
        {pending ? 'Proposing…' : 'dev: propose sticky'}
      </button>
    </div>
  );
}
