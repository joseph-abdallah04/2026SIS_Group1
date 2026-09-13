import { useCallback, useMemo, useRef, useState } from 'react';

import { AnchoredPopover } from '../../components/ui/AnchoredPopover';
import { ParticipantBubble } from './ParticipantBubble';
import { ParticipantRow } from './ParticipantRow';
import { presenceLabel, seatParticipants, splitForHeader } from './participantList';
import type { ParticipantSeat } from './participantList';
import type { VoiceParticipant, VoiceStatus } from './useVoiceRoom';
import { useCompactHeader } from './useCompactHeader';
import { useSustainedSpeaking } from './useSustainedSpeaking';

interface ParticipantClusterProps {
  participants: readonly VoiceParticipant[];
  /** The connection, so an empty roster can say *why* it is empty. */
  status: VoiceStatus;
}

/**
 * How many bubbles the chip shows before the rest go behind the overflow.
 *
 * Five, because five is the room size F13's acceptance criteria name, so the
 * common case shows everyone at once. Three on a narrow header, where
 * horizontal space is the scarcest thing on the screen.
 */
const VISIBLE_BUBBLES = 5;
const VISIBLE_BUBBLES_COMPACT = 3;

/** The overflow panel's geometry, fixed so it can be placed before it renders. */
const PANEL_WIDTH = 232;
const PANEL_MAX_HEIGHT = 320;

/**
 * What an empty roster means. Never "nobody is here" — you are always in your
 * own room, so an empty one is a statement about the connection.
 */
function emptyMessage(status: VoiceStatus): string {
  switch (status) {
    case 'connected':
    case 'connecting':
      return 'Joining the room…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'failed':
      return 'Voice is offline, so nobody can be listed here.';
    default:
      return 'Not connected to voice.';
  }
}

/** Everything the `aria-hidden` bubble cannot say, in one sentence. */
function describe(seat: ParticipantSeat, isSpeaking: boolean): string {
  const who = `${seat.name}${seat.isLocal ? ' (you)' : ''}`;
  if (seat.isMuted) return `${who}, muted`;
  return isSpeaking ? `${who}, speaking` : who;
}

/**
 * Who is in the session and who is talking (F13), in the middle of the board
 * header.
 *
 * It moved here from a rail on the right of the board (F13.2). The assistant's
 * bubble is fixed to the bottom-right corner and its panel opens over that
 * side, so both sat on top of the rail — the bubble permanently, whether the
 * rail was open or collapsed. Vacating the side settles it for good, and hands
 * the board back 256px.
 *
 * Dressed as one white chip rather than loose circles because everything else
 * in this header — the phase pill, the timer, the mic, the item count, the live
 * dot — is the same white `rounded-full` chip. Bare bubbles would read as a
 * different application, and a one-person session would look like a stray dot
 * rather than a roster.
 *
 * `useSustainedSpeaking` is called here rather than by the page, so the
 * re-render on every speech edge stays inside this chip instead of repainting
 * the whole header with it.
 */
export function ParticipantCluster({ participants, status }: ParticipantClusterProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const compact = useCompactHeader();
  const speaking = useSustainedSpeaking(participants);
  // The sort and the swatches do not change between speech edges.
  const seats = useMemo(() => seatParticipants(participants), [participants]);

  const { visible, hidden } = splitForHeader(
    seats,
    speaking,
    compact ? VISIBLE_BUBBLES_COMPACT : VISIBLE_BUBBLES,
  );

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
    setOpen((wasOpen) => !wasOpen);
  }, []);

  if (seats.length === 0) {
    return (
      <div className="flex shrink-0 items-center rounded-full border border-rt-secondary/25 bg-white px-3 py-1.5 shadow-sm">
        <span className="text-[10.5px] font-medium text-rt-ink-muted">{emptyMessage(status)}</span>
      </div>
    );
  }

  // A speaker that promotion could not fit — every visible seat was already
  // speaking, or was you. The overflow control's ring is the backstop.
  const speakerHidden = hidden.some((seat) => speaking.has(seat.identity) && !seat.isMuted);

  return (
    <div className="relative flex shrink-0 items-center gap-2 rounded-full border border-rt-secondary/25 bg-white px-2.5 py-1.5 shadow-sm">
      {/* `gap-2.5`, not `gap-2`: the speaking ring pulses ~4.5px past a 24px
          bubble, so at 8px two of them meet. The rail's strip learned the same
          lesson at its own size. */}
      <ul className="flex items-center gap-2.5">
        {visible.map((seat) => {
          const isSpeaking = speaking.has(seat.identity);
          const label = describe(seat, isSpeaking);

          return (
            <li key={seat.identity} title={label} className="flex">
              {/* The bubble is decorative, so the item needs words of its own. */}
              <span className="sr-only">{label}</span>
              <ParticipantBubble
                initials={seat.initials}
                swatch={seat.swatch}
                isSpeaking={isSpeaking}
                isMuted={seat.isMuted}
                size="header"
              />
            </li>
          );
        })}
      </ul>

      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Show everyone in the room — ${presenceLabel(seats.length)}`}
        title={`In the room · ${presenceLabel(seats.length)}`}
        data-speaking={speakerHidden ? 'true' : undefined}
        className="rt-voice-more flex items-center rounded-full px-1.5 text-[10.5px] font-semibold text-rt-secondary-deep transition-colors hover:bg-rt-secondary-wash focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-1 focus-visible:outline-none"
      >
        <span aria-hidden="true">{hidden.length > 0 ? `+${hidden.length}` : '⋯'}</span>
      </button>

      {open && anchor ? (
        <AnchoredPopover
          anchor={anchor}
          width={PANEL_WIDTH}
          maxHeight={PANEL_MAX_HEIGHT}
          label="In the room"
          onClose={close}
          ignore={triggerRef}
        >
          <p className="shrink-0 border-b border-rt-tertiary px-3 py-2 text-[10px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
            In the room {seats.length}
          </p>
          {/* Everyone, not just the hidden ones: the panel is the canonical
              list, and a viewer who opens it to find someone should not have to
              work out which half they are in. `overscroll-contain` so reaching
              the end does not hand the scroll to the board behind it. */}
          <ul className="rt-voice-roster flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5">
            {seats.map((seat) => (
              <ParticipantRow
                key={seat.identity}
                seat={seat}
                isSpeaking={speaking.has(seat.identity)}
              />
            ))}
          </ul>
          {status === 'reconnecting' ? (
            <p className="shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-rt-ink-faint">
              Reconnecting — this list may be out of date.
            </p>
          ) : null}
        </AnchoredPopover>
      ) : null}
    </div>
  );
}
