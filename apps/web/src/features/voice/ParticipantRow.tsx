import { ParticipantBubble } from './ParticipantBubble';
import type { ParticipantSeat } from './participantList';

interface ParticipantRowProps {
  seat: ParticipantSeat;
  /** After the tail in `useSustainedSpeaking`, not LiveKit's raw frame. */
  isSpeaking: boolean;
}

/**
 * The part of a row a sighted viewer reads off the bubble instead of the text.
 * Empty for the ordinary case, so most rows announce as just a name.
 */
function stateNote(isMuted: boolean, isSpeaking: boolean): string {
  if (isMuted) return ', muted';
  return isSpeaking ? ', speaking' : '';
}

/**
 * One person, as a named row: bubble, display name, and the state a sighted
 * viewer takes from the bubble spelled out for a screen reader.
 *
 * Named by its own content rather than by an `aria-label` on the `<li>`:
 * `listitem` takes its name from the author, so support for labelling a bare
 * one is patchy, and a row that announces as nothing is worse than one that
 * announces plainly. A reader traversing the list reads this text either way.
 */
export function ParticipantRow({ seat, isSpeaking }: ParticipantRowProps) {
  const note = stateNote(seat.isMuted, isSpeaking);

  return (
    <li className="flex items-center gap-2.5 rounded-2xl px-2.5 py-2">
      <ParticipantBubble
        initials={seat.initials}
        swatch={seat.swatch}
        isSpeaking={isSpeaking}
        isMuted={seat.isMuted}
        size="row"
      />
      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] leading-snug ${
          isSpeaking ? 'font-medium text-rt-ink' : 'text-rt-ink-muted'
        }`}
        title={seat.name}
      >
        {seat.name}
        {seat.isLocal ? (
          <>
            {/* A real space, not a margin: this has to survive into the row's
                announced name, and a margin does not. */}{' '}
            <span className="text-[10.5px] text-rt-ink-faint">(you)</span>
          </>
        ) : null}
        {note ? <span className="sr-only">{note}</span> : null}
      </span>
    </li>
  );
}
