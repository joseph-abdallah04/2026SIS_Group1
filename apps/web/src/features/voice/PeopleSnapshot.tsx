import { useMemo } from 'react';

import { Tooltip } from '../../components/ui/Tooltip';
import { ParticipantBubble } from './ParticipantBubble';
import { presenceLabel, seatParticipants, splitForHeader } from './participantList';
import type { VoiceParticipant } from './useVoiceRoom';
import { useCompactHeader } from './useCompactHeader';
import { useSustainedSpeaking } from './useSustainedSpeaking';

/**
 * How many people the header shows. Up to this many sit side by side; past it,
 * this many overlap and the total follows. Three on a narrow header, where
 * horizontal space is the scarcest thing on the screen.
 */
const SHOWN = 4;
const SHOWN_COMPACT = 3;

interface PeopleSnapshotProps {
  /** Everyone in the session, call or not, in any order. */
  participants: readonly VoiceParticipant[];
  leaderId: string | null;
  /** The full list, in the side panel's People tab: shown, or put away again. */
  onToggle: () => void;
  /** Whether that list is on show now, so a second press says it closes it. */
  listOpen?: boolean;
}

/** Names, as a sentence: "Ada", "Ada and Sam", "Ada, Sam and Kim". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * Who is in the session at a glance, in the board header (F13): a few faces,
 * the leader's crowned, whoever is talking ringed in green. Pressing it opens
 * the People tab, which is the whole list, and pressing it again closes it, as
 * the side strip's own People button does.
 *
 * Up to four sit apart, so a small room reads as people rather than a stack.
 * Past four, four overlap and the total follows. Someone who is not among the
 * four and starts talking is moved in (`splitForHeader`), so the room can see
 * who is speaking; you, and anyone already talking, are never the ones moved
 * out. When every face shown is already talking, the total takes the ring.
 *
 * `useSustainedSpeaking` is called here rather than by the page, so the
 * re-render on every speech edge stays inside this button instead of
 * repainting the whole header with it.
 */
export function PeopleSnapshot({
  participants,
  leaderId,
  onToggle,
  listOpen = false,
}: PeopleSnapshotProps) {
  const compact = useCompactHeader();
  const speaking = useSustainedSpeaking(participants);
  // The sort and the swatches do not change between speech edges.
  const seats = useMemo(() => seatParticipants(participants), [participants]);

  if (seats.length === 0) return null;

  const { visible, hidden } = splitForHeader(seats, speaking, compact ? SHOWN_COMPACT : SHOWN);
  const overlap = hidden.length > 0;
  const talking = (identity: string, isMuted: boolean) => !isMuted && speaking.has(identity);
  const speakerHidden = hidden.some((seat) => talking(seat.identity, seat.isMuted));
  const speakers = seats.filter((seat) => talking(seat.identity, seat.isMuted)).map((s) => s.name);
  const count = presenceLabel(seats.length);

  return (
    <Tooltip label={`${count} • ${listOpen ? 'close' : 'open'} list`} placement="bottom">
      <button
        type="button"
        onClick={onToggle}
        data-people-snapshot
        aria-expanded={listOpen}
        aria-label={`${count}${speakers.length ? `, ${listNames(speakers)} speaking` : ''}. ${
          listOpen ? 'Close' : 'Open'
        } the people list`}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full px-1.5 transition-colors hover:bg-rt-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
      >
        <span
          aria-hidden="true"
          data-overlap={overlap ? 'true' : undefined}
          className={`rt-people-snapshot flex items-center ${overlap ? '' : 'gap-1.5'}`}
        >
          {visible.map((seat, index) => {
            const isSpeaking = talking(seat.identity, seat.isMuted);
            return (
              <span
                key={seat.identity}
                className="relative flex"
                // Overlapped, the first sits on top, so every face keeps its
                // right edge, where the mute and crown badges are. A speaker
                // rises above both neighbours so its ring is never cut.
                style={
                  overlap
                    ? { zIndex: isSpeaking ? visible.length + 1 : visible.length - index }
                    : undefined
                }
              >
                <ParticipantBubble
                  initials={seat.initials}
                  swatch={seat.swatch}
                  isSpeaking={isSpeaking}
                  isMuted={seat.isMuted}
                  isLeader={leaderId !== null && seat.identity === leaderId}
                  size="header"
                />
              </span>
            );
          })}
        </span>
        {overlap ? (
          <span
            aria-hidden="true"
            className="rt-voice-more rounded-full px-1 text-[12px] font-semibold text-rt-ink-muted tabular-nums"
            data-speaking={speakerHidden ? 'true' : undefined}
          >
            {seats.length}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}
