import { useMemo, useState } from 'react';

import { BoardRail } from '../../components/BoardRail';
import { ParticipantBubble } from './ParticipantBubble';
import { presenceLabel, seatParticipants } from './participantList';
import type { VoiceParticipant, VoiceStatus } from './useVoiceRoom';
import { useSustainedSpeaking } from './useSustainedSpeaking';

interface ParticipantPanelProps {
  participants: readonly VoiceParticipant[];
  /** The connection, so an empty list can say *why* it is empty. */
  status: VoiceStatus;
}

/**
 * What an empty list means. Never "nobody is here" — you are always in your own
 * room, so an empty roster is a statement about the connection, not the room.
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

/**
 * The part of a row a sighted viewer reads off the bubble instead of the text.
 * Empty for the ordinary case, so most rows announce as just a name.
 */
function stateNote(isMuted: boolean, isSpeaking: boolean): string {
  if (isMuted) return ', muted';
  return isSpeaking ? ', speaking' : '';
}

/**
 * Who is in the session and who is talking (F13).
 *
 * The chrome is `BoardRail` — the same piece as F24's agenda, mirrored onto
 * the right. Presence stays readable without a click: a speaking indicator
 * behind a popover is a speaking indicator nobody sees. It collapses to a
 * strip of bubbles that keeps the rings and the mute badges, which is what
 * makes room for F34's assistant panel to open over this side later without
 * taking presence away.
 *
 * Collapse is local state, like `AgendaPanel`'s: one person tidying their own
 * screen is not an instruction to the other four.
 *
 * The roster is LiveKit's and only LiveKit's. Everyone who opens the session
 * view joins the room whether or not they ever grant a microphone (F11), so
 * the room already *is* the presence list; asking the sessions module for its
 * members as well would put two sources of truth on one rail.
 *
 * Every row is named by its own content rather than by an `aria-label` on the
 * `<li>`: screen-reader support for labelling a bare list item is patchy, and
 * a row that announces as nothing is worse than one that announces plainly.
 */
export function ParticipantPanel({ participants, status }: ParticipantPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const speaking = useSustainedSpeaking(participants);
  // `useSustainedSpeaking` re-renders on every speech edge; the sort and the
  // swatches do not change between those.
  const seats = useMemo(() => seatParticipants(participants), [participants]);
  const count = seats.length;
  const title = `In the room ${count > 0 ? count : ''}`;

  return (
    <BoardRail
      side="right"
      title={title}
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel={`Expand participants — ${presenceLabel(count)} in the room`}
      collapseLabel="Collapse participants"
      expandTitle={`Expand participants (${presenceLabel(count)})`}
      collapseTitle="Collapse participants"
      collapsedExtra={
        // Scrolls rather than truncating to a "+N". Cutting the list short
        // would sooner or later hide whoever is talking behind a counter,
        // which is the one thing the strip exists to keep visible.
        //
        // Which makes this the scroll container, and `overflow-y: auto`
        // computes `overflow-x` to `auto` with it — so the padding here is the
        // ring's room rather than decoration. The speaking halo sits at
        // `inset: -3px` and pulses ~4.7px past a 32px bubble, the mute badge
        // 2px past its right edge, and without padding the strip clips exactly
        // the two things it stays open to show. A 44px rail leaves 6px either
        // side of the bubble, so that room comes out of the strip and the rail
        // keeps F24's width. The gap is 2.5 for the same reason: at 2, two
        // pulsing rings meet in the 8px between them.
        <ul className="flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto p-1.5">
          {seats.map((person) => {
            const isSpeaking = speaking.has(person.identity);
            const label = `${person.name}${person.isLocal ? ' (you)' : ''}${stateNote(
              person.isMuted,
              isSpeaking,
            )}`;

            return (
              <li key={person.identity} title={label}>
                {/* The bubble is decorative, so the row needs words of its own. */}
                <span className="sr-only">{label}</span>
                <ParticipantBubble
                  initials={person.initials}
                  swatch={person.swatch}
                  isSpeaking={isSpeaking}
                  isMuted={person.isMuted}
                  size="strip"
                />
              </li>
            );
          })}
        </ul>
      }
    >
      {count === 0 ? (
        <p className="py-3 text-[12px] text-rt-ink-muted">{emptyMessage(status)}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2">
          {seats.map((person) => {
            const isSpeaking = speaking.has(person.identity);
            const note = stateNote(person.isMuted, isSpeaking);

            return (
              <li
                key={person.identity}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2"
              >
                <ParticipantBubble
                  initials={person.initials}
                  swatch={person.swatch}
                  isSpeaking={isSpeaking}
                  isMuted={person.isMuted}
                  size="row"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-[12.5px] leading-snug ${
                    isSpeaking ? 'font-medium text-rt-ink' : 'text-rt-ink-muted'
                  }`}
                  title={person.name}
                >
                  {person.name}
                  {person.isLocal ? (
                    <>
                      {/* A real space, not a margin: this has to survive into the
                          row's announced name, and a margin does not. */}{' '}
                      <span className="text-[10.5px] text-rt-ink-faint">(you)</span>
                    </>
                  ) : null}
                  {note ? <span className="sr-only">{note}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Said once, at the foot of the rail, rather than as a badge on every
          muted row: with five people the badges are already on the bubbles. */}
      {count > 0 && status === 'reconnecting' ? (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-rt-ink-faint">
          Reconnecting — this list may be out of date.
        </p>
      ) : null}
    </BoardRail>
  );
}
