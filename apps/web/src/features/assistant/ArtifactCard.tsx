// An artifact the agent produced, with the one-click Propose button (F37).
//
// The card is the handover point between the private chat and the shared board: everything
// above it is the user's alone, everything the button sends is public and authored by them.
import type { ProposalArtifact, StickyColor } from '@roundtable/shared';

import { Button } from '../../components/ui/Button';
import { DiagramPreview } from './DiagramPreview';
import type { ProposeState } from './useAssistantChat';

const STICKY_STYLES: Record<StickyColor, string> = {
  yellow: 'bg-amber-100 border-amber-300 text-amber-950',
  pink: 'bg-pink-100 border-pink-300 text-pink-950',
  blue: 'bg-sky-100 border-sky-300 text-sky-950',
  green: 'bg-emerald-100 border-emerald-300 text-emerald-950',
};

export interface ArtifactCardProps {
  artifact: ProposalArtifact;
  propose: ProposeState;
  proposeError?: string;
  /** Absent while there is no active question — nothing to attach a proposal to. */
  canPropose: boolean;
  onPropose: () => void;
}

export function ArtifactCard({
  artifact,
  propose,
  proposeError,
  canPropose,
  onPropose,
}: ArtifactCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
        {artifact.type === 'sticky'
          ? 'Sticky note'
          : artifact.type === 'diagram'
            ? 'Diagram'
            : 'Drawing'}
      </div>

      {artifact.type === 'sticky' && (
        <div
          className={`rounded-lg border px-3 py-2.5 text-sm leading-snug ${STICKY_STYLES[artifact.color]}`}
        >
          {artifact.text}
        </div>
      )}

      {artifact.type === 'diagram' && (
        <div className="overflow-x-auto rounded-lg bg-slate-50 p-2">
          {artifact.title && (
            <p className="mb-1 px-1 text-xs font-semibold text-slate-600">{artifact.title}</p>
          )}
          <DiagramPreview diagram={artifact} />
        </div>
      )}

      {artifact.type === 'drawing' && (
        <div
          className="overflow-hidden rounded-lg bg-slate-50 p-2 [&_svg]:h-auto [&_svg]:w-full"
          // Drawings are SVG produced by the tools module, not by the model, and are
          // size-capped at validation time.
          dangerouslySetInnerHTML={{ __html: artifact.svg }}
        />
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <Button
          size="sm"
          variant={propose === 'proposed' ? 'secondary' : 'primary'}
          disabled={!canPropose || propose === 'proposed'}
          loading={propose === 'sending'}
          onClick={onPropose}
        >
          {propose === 'proposed'
            ? 'On the pinboard'
            : propose === 'failed'
              ? 'Try again'
              : 'Propose'}
        </Button>
        {!canPropose && (
          <span className="text-xs text-slate-400">
            Available once a question is being discussed
          </span>
        )}
        {propose === 'failed' && proposeError && (
          <span className="text-xs text-red-600">{proposeError}</span>
        )}
      </div>
    </div>
  );
}
