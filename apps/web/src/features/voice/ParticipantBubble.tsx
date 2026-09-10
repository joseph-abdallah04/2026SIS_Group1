import { MicOff } from 'lucide-react';

import type { SeatSwatch } from '../sessions/waitingRoomSeats';

interface ParticipantBubbleProps {
  initials: string;
  swatch: SeatSwatch;
  /** After the tail in `useSustainedSpeaking`, not LiveKit's raw frame. */
  isSpeaking: boolean;
  isMuted: boolean;
  /** Larger in the strip, where the bubble is the only thing left to read. */
  size: 'row' | 'strip';
}

/**
 * One person's head, as the waiting room draws it — initials on a hashed
 * colour — carrying the two states F13 adds: a green ring while they talk and
 * F12's red-slash mic while they are muted.
 *
 * `aria-hidden`, deliberately. The bubble is decoration for words the row
 * already carries — the visible name when the rail is open, an `sr-only` label
 * when it is collapsed. Announcing "AJ" on top of that would read the same
 * person twice, the second time unintelligibly.
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
          <MicOff size={size === 'strip' ? 9 : 8} strokeWidth={2.5} />
        </span>
      ) : null}
    </span>
  );
}
