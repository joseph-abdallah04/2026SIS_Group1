// An artifact the agent produced, with the one-click Propose button (F37).
//
// The card is the handover point between the private chat and the shared board: everything
// above it is the user's alone, and what the button sends goes through the Creative Tools
// submit path — the same one the sticky and drawing editors use — so an AI-suggested
// proposal is authored, validated and broadcast exactly like a hand-made one.
import type { ArtifactJson } from '@roundtable/shared';

import { Button } from '../../components/ui/Button';
import { STICKY_RADIUS, STICKY_THEMES } from '../pinboard/pinboardTokens';
import { DiagramPreview } from './DiagramPreview';
import type { ProposeState } from './useAssistantChat';

export interface ArtifactCardProps {
  artifact: ArtifactJson;
  propose: ProposeState;
  proposeError?: string;
  /** False when the board can't take a write yet — no live socket, or no active question. */
  canPropose: boolean;
  onPropose: () => void;
}

const TYPE_LABELS: Record<ArtifactJson['type'], string> = {
  sticky: 'Sticky note',
  drawing: 'Drawing',
  diagram: 'Diagram',
};

export function ArtifactCard({
  artifact,
  propose,
  proposeError,
  canPropose,
  onPropose,
}: ArtifactCardProps) {
  const proposed = propose === 'proposed';

  return (
    <div className="rounded-xl border border-rt-tertiary bg-rt-surface p-2.5">
      <div className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase">
        {TYPE_LABELS[artifact.type]}
      </div>

      {artifact.type === 'sticky' && (
        <div
          className="px-3 py-2.5 text-sm leading-snug"
          style={{
            borderRadius: STICKY_RADIUS,
            background: STICKY_THEMES[artifact.color].bg,
            border: `1px solid ${STICKY_THEMES[artifact.color].border}`,
            color: STICKY_THEMES[artifact.color].ink,
          }}
        >
          {artifact.text}
        </div>
      )}

      {artifact.type === 'diagram' && (
        <div className="overflow-x-auto rounded-lg bg-rt-surface-sunken p-2">
          <DiagramPreview diagram={artifact} />
        </div>
      )}

      {artifact.type === 'drawing' && (
        <div
          className="overflow-hidden rounded-lg bg-rt-surface-sunken p-2 [&_svg]:h-auto [&_svg]:w-full"
          // Drawings are SVG produced by the tools module, not by the model, and are
          // size-capped at validation time.
          dangerouslySetInnerHTML={{ __html: artifact.svg }}
        />
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          variant={proposed ? 'secondary' : 'primary'}
          disabled={!canPropose || proposed || propose === 'sending'}
          onClick={onPropose}
          className="min-h-8 px-3 text-[12px]"
        >
          {proposed
            ? 'On the pinboard'
            : propose === 'sending'
              ? 'Proposing…'
              : propose === 'failed'
                ? 'Try again'
                : 'Propose'}
        </Button>
        {!canPropose && !proposed && (
          <span className="text-xs text-rt-ink-faint">Available once the board is connected</span>
        )}
        {propose === 'failed' && proposeError && (
          <span className="text-xs text-red-600">{proposeError}</span>
        )}
      </div>
    </div>
  );
}
