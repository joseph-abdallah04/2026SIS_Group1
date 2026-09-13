import { MicOff } from 'lucide-react';

import type { SeatSwatch } from '../sessions/waitingRoomSeats';

/** The slash-mic scales with the bubble it is pinned to. */
const MUTE_ICON: Record<'row' | 'strip' | 'header', number> = {
  row: 8,
  strip: 9,
  header: 7,
};

interface ParticipantBubbleProps {
  initials: string;
  swatch: SeatSwatch;
  /** After the tail in `useSustainedSpeaking`, not LiveKit's raw frame. */
  isSpeaking: boolean;
  isMuted: boolean;
  /**
   * `row` beside a name, `strip` where the bubble is the only thing left to
   * read, `header` inside the board header's chip — smallest of the three,
   * because a taller bubble makes the whole header taller.
   */
  size: 'row' | 'strip' | 'header';
}

/**
 * One person's head, as the waiting room draws it — initials on a hashed
 * colour — carrying the two states F13 adds: a green ring while they talk and
 * F12's red-slash mic while they are muted.
 *
 * `aria-hidden`, deliberately. The bubble is decoration for words its context
 * already carries — the visible name in a row, an `sr-only` label in the
 * header's chip. Announcing "AJ" on top of that would read the same person
 * twice, the second time unintelligibly.
 */
export function ParticipantBubble({
  initials,
  swatch,
  isSpeaking,
  isMuted,
  size,
}: ParticipantBubbleProps) {
  return (
    <span
      aria-hidden="true"
      className="rt-voice-seat"
      data-speaking={isSpeaking ? 'true' : undefined}
      data-size={size}
    >
      <span
        className="rt-voice-bubble"
        style={{ background: swatch.background, color: swatch.color }}
      >
        {initials}
      </span>
      {isMuted ? (
        <span className="rt-voice-bubble-muted">
          <MicOff size={MUTE_ICON[size]} strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  );
}
