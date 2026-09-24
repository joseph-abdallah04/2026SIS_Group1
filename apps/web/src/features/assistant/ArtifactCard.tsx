// An artifact the agent produced, with the one-click Propose button (F37).
//
// The card is the handover point between the private chat and the shared board: everything
// above it is the user's alone, and what the button sends goes through the Creative Tools
// submit path — the same one the sticky and drawing editors use — so an AI-suggested
// proposal is authored, validated and broadcast exactly like a hand-made one.
import type { ArtifactJson, QuestionStatus, StickyColor } from '@roundtable/shared';

import { CARD_INK, STICKY_THEMES } from '../pinboard/pinboardTokens';
import { STICKY_FONT_SIZE, STICKY_LINE_HEIGHT } from '../tools/sticky/stickyPresentation';
import { DiagramPreview } from './DiagramPreview';
import type { ProposeState } from './useAssistantChat';

export interface ArtifactCardProps {
  artifact: ArtifactJson;
  propose: ProposeState;
  proposeError?: string;
  /**
   * False when the board will not take a write. That is two different situations
   * sharing one flag on the tools provider: the socket is down, or the question
   * has left discussion. `questionStatus` is what tells them apart.
   */
  canPropose: boolean;
  /** The phase the pinboard is in, so a locked Propose can say why. */
  questionStatus?: QuestionStatus | null;
  onPropose: () => void;
}

const TYPE_LABELS: Record<ArtifactJson['type'], string> = {
  sticky: 'Sticky note',
  drawing: 'Drawing',
  diagram: 'Diagram',
  image: 'Image',
};

export function ArtifactCard({
  artifact,
  propose,
  proposeError,
  canPropose,
  questionStatus,
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
          <span className="rt-assistant-artifact-hint">
            {proposeUnavailableHint(questionStatus)}
          </span>
        )}
        {propose === 'failed' && proposeError && (
          <span className="rt-assistant-artifact-hint text-[#ffc9c3]">{proposeError}</span>
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
      {/* The one size every note is set in, board and editors alike, rather than a size
          chosen for this note's length: a preview set smaller than the sticky it becomes
          is a preview of something else. A long note makes the card taller, as it does
          on the board. */}
      <p
        className="rt-assistant-sticky-text"
        style={{ fontSize: STICKY_FONT_SIZE, lineHeight: STICKY_LINE_HEIGHT }}
      >
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

/**
 * Why Propose is locked.
 *
 * The tools provider's `isLive` is not "the socket is up". SessionPinboard
 * passes `isLive && questionStatus === 'discussion'`, so voting, answered and
 * skipped all look like a disconnect. The card used to print the disconnect
 * line for all of them. The pinboard itself already names those phases — this
 * is the same wording, so a locked Propose and a locked toolbar agree.
 */
export function proposeUnavailableHint(status: QuestionStatus | null | undefined): string {
  if (status === 'voting') return 'Proposals are locked while this question is in voting';
  if (status === 'answered' || status === 'skipped' || status === 'pending') {
    return 'This question is closed to new proposals';
  }
  return 'Available once the board is connected';
}
