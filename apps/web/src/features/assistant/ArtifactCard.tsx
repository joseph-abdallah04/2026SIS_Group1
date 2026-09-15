// An artifact the agent produced, with the one-click Propose button (F37).
//
// The card is the handover point between the private chat and the shared board: everything
// above it is the user's alone, and what the button sends goes through the Creative Tools
// submit path — the same one the sticky and drawing editors use — so an AI-suggested
// proposal is authored, validated and broadcast exactly like a hand-made one.
import type { ArtifactJson, StickyColor } from '@roundtable/shared';

import { CARD_INK, STICKY_THEMES } from '../pinboard/pinboardTokens';
import { stickyTypography } from '../tools/sticky/stickyPresentation';
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
  return (
    <div className="rt-assistant-card rt-assistant-artifact">
      <div className="rt-assistant-card-label">{TYPE_LABELS[artifact.type]}</div>

      {artifact.type === 'sticky' && <StickyPreview text={artifact.text} color={artifact.color} />}

      {artifact.type === 'diagram' && (
        <div className="rt-assistant-card-well p-2">
          <DiagramPreview diagram={artifact} />
        </div>
      )}

      {artifact.type === 'drawing' && (
        <div
          className="rt-assistant-card-well p-2 [&_svg]:h-auto [&_svg]:w-full"
          // Drawings are SVG produced by the tools module, not by the model, and are
          // size-capped at validation time.
          dangerouslySetInnerHTML={{ __html: artifact.svg }}
        />
      )}

      <div className="rt-assistant-artifact-actions">
        {/* Not the shared `Button`: inside the panel the palette is monochrome, and a gold
            pill on black glass is the one thing that breaks it. */}
        <button
          type="button"
          disabled={!canPropose || propose === 'proposed' || propose === 'sending'}
          onClick={onPropose}
          className={`rt-assistant-action${propose === 'proposed' ? ' rt-assistant-action--done' : ''}`}
        >
          {propose === 'proposed'
            ? 'On the pinboard'
            : propose === 'sending'
              ? 'Proposing…'
              : propose === 'failed'
                ? 'Try again'
                : 'Propose'}
        </button>
        {!canPropose && propose !== 'proposed' && (
          <span className="text-xs" style={{ color: 'var(--rt-assistant-muted)' }}>
            Available once the board is connected
          </span>
        )}
        {propose === 'failed' && proposeError && (
          <span className="text-xs text-[#ffc9c3]">{proposeError}</span>
        )}
      </div>
    </div>
  );
}

function StickyPreview({ text, color }: { text: string; color: StickyColor }) {
  const theme = STICKY_THEMES[color];

  return (
    <article
      className="rt-assistant-sticky"
      style={{
        background: theme.bg,
        color: CARD_INK,
      }}
    >
      {/* Same anatomy as a board sticky: the note sits at the top of the paper,
          and a byline holds the bottom edge so it reads as a pad, not a swatch. */}
      <p className="rt-assistant-sticky-text" style={stickyTypography(text)}>
        {text}
      </p>
      {/* Propose authors the note as you, the same way a hand-written sticky
          does. The agent drafted the text; it is never the author. */}
      <footer className="rt-assistant-sticky-foot">
        <span>You</span>
      </footer>
    </article>
  );
}
