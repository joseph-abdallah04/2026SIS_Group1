import { useMemo } from 'react';
import { MicOff } from 'lucide-react';

import { useSustainedSpeaking, type LeaderMute, type VoiceParticipant } from '../voice';
import { ParticipantBubble } from '../voice/ParticipantBubble';
import { InviteFooter } from './InviteFooter';
import {
  canBeMuted,
  peopleNote,
  peopleRows,
  personStatusLabel,
  type CallView,
  type PeoplePlace,
  type PersonRow,
  type PersonStatus,
} from './peopleRoster';

const NO_ONE: readonly VoiceParticipant[] = [];

/** Speaking in the ring's green, trouble in the mic's red or the banner's amber. */
const STATUS_TONE: Record<PersonStatus, string> = {
  speaking: 'font-medium text-[#2f8f5b]',
  'in-call': 'text-rt-ink-faint',
  muted: 'text-[#b42318]',
  'mic-blocked': 'text-[#b45309]',
  'no-mic': 'text-[#b45309]',
  'not-in-call': 'text-rt-ink-faint',
  'on-board': 'text-rt-ink-faint',
};

/**
 * Shown on the row's hover, and whenever it has focus, so a list of names
 * does not read as a column of buttons. Always shown where nothing can hover.
 */
const ROW_MUTE =
  'inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full border border-rt-tertiary bg-white px-2.5 text-[11px] font-semibold text-rt-ink-muted opacity-0 transition-[color,border-color,opacity] group-hover:opacity-100 hover:border-[#b42318]/35 hover:text-[#b42318] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:cursor-default disabled:opacity-100 [@media(hover:none)]:opacity-100';

interface PeoplePanelProps {
  /** Everyone connected to the board, from socket presence. */
  present: readonly VoiceParticipant[];
  /** The call as this browser sees it, or null for a session with no call. */
  call: CallView | null;
  leaderId: string | null;
  /** While the session is joinable; the invite footer goes without it. */
  joinCode: string | null;
  /** The board's own connection, which `present` comes from. */
  boardLive: boolean;
  /** The leader's mute buttons. Left out for everyone else, and with no call. */
  moderation?: LeaderMute;
  /** The waiting room words presence as "In the waiting room", not "On the board". */
  place?: PeoplePlace;
}

function Person({
  row,
  onMute,
  muting,
  place,
}: {
  row: PersonRow;
  /** Only where the leader's Mute has something to do. */
  onMute?: () => void;
  muting: boolean;
  place: PeoplePlace;
}) {
  const { seat, status, isLeader } = row;
  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5">
      <ParticipantBubble
        initials={seat.initials}
        swatch={seat.swatch}
        isSpeaking={status === 'speaking'}
        isMuted={status === 'muted'}
        isLeader={isLeader}
        size="row"
      />
      <div className="min-w-0 flex-1">
        {/* The commas are for a screen reader, which would otherwise run the
            name and its tags together; flex gaps are not spaces. */}
        <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] leading-snug font-medium text-rt-ink">
          <span className="truncate" title={seat.name}>
            {seat.name}
          </span>
          {seat.isLocal ? (
            <span className="shrink-0 text-[10.5px] font-normal text-rt-ink-faint">
              <span className="sr-only">,</span>(you)
            </span>
          ) : null}
          {isLeader ? (
            <span className="shrink-0 rounded-full bg-rt-secondary-wash px-1.5 text-[9px] leading-4 font-bold tracking-[0.1em] text-rt-secondary-deep uppercase">
              <span className="sr-only">,</span>Leader
            </span>
          ) : null}
        </p>
        <p className={`text-[11px] leading-snug ${STATUS_TONE[status]}`}>
          {personStatusLabel(status, place)}
        </p>
      </div>
      {onMute ? (
        <button
          type="button"
          onClick={onMute}
          disabled={muting}
          aria-label={`Mute ${seat.name}`}
          className={ROW_MUTE}
        >
          <MicOff aria-hidden="true" size={12} strokeWidth={2} />
          {muting ? 'Muting…' : 'Mute'}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Who is in the session and where they are: on the board, in the call,
 * talking, muted. You first, then everyone else alphabetically, as the rest
 * of the board orders people. The leader wears a crown and a tag.
 *
 * The leader can mute anyone whose microphone is on (`moderation`). Nobody can
 * unmute anyone else; the person muted turns their own back on.
 *
 * At the bottom, the way to bring someone else in.
 */
export function PeoplePanel({
  present,
  call,
  leaderId,
  joinCode,
  boardLive,
  moderation,
  place = 'board',
}: PeoplePanelProps) {
  // Called here rather than by the page, so a speech edge repaints this list
  // and not the session around it.
  const speaking = useSustainedSpeaking(call?.participants ?? NO_ONE);
  const rows = useMemo(
    () => peopleRows({ present, call, speaking, leaderId }),
    [present, call, speaking, leaderId],
  );
  const note = peopleNote(call, boardLive, place);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {note ? (
        <p className="mt-2.5 shrink-0 rounded-[10px] border border-rt-tertiary/60 bg-white px-2.5 py-2 text-[11.5px] leading-snug text-rt-ink-muted">
          {note}
        </p>
      ) : null}
      {moderation?.error ? (
        <p
          role="alert"
          className="mt-2.5 shrink-0 px-0.5 text-[11.5px] leading-snug text-[#b42318]"
        >
          {moderation.error}
        </p>
      ) : null}
      {/* `overscroll-contain` so reaching the end does not hand the scroll to
          the board behind it. */}
      <ul className="-mx-1.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain py-2">
        {rows.map((row) => (
          <Person
            key={row.seat.identity}
            row={row}
            {...(moderation && canBeMuted(row)
              ? { onMute: () => void moderation.mute(row.seat.identity) }
              : {})}
            muting={moderation?.pending.has(row.seat.identity) ?? false}
            place={place}
          />
        ))}
      </ul>
      {joinCode ? <InviteFooter code={joinCode} /> : null}
    </div>
  );
}
