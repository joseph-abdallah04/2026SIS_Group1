import type { MicStatus, VoiceParticipant, VoiceStatus } from '../voice';
import { seatParticipants, type ParticipantSeat } from '../voice/participantList';

/** Where one person is, as the People panel words it. */
export type PersonStatus =
  | 'speaking'
  | 'in-call'
  | 'muted'
  /** Yours only: the browser refused the microphone. */
  | 'mic-blocked'
  /** Yours only: there is no working input device. */
  | 'no-mic'
  /** On the board, not in the call. */
  | 'not-in-call'
  /** A session with no call, or a call this browser cannot see into. */
  | 'on-board';

export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  speaking: 'Speaking',
  'in-call': 'In call',
  muted: 'Muted',
  'mic-blocked': 'Mic blocked',
  'no-mic': 'No microphone found',
  'not-in-call': 'Not in call',
  'on-board': 'On the board',
};

/** The call as this browser sees it. Null for a session created with no call. */
export interface CallView {
  participants: readonly VoiceParticipant[];
  status: VoiceStatus;
  micStatus: MicStatus;
}

export interface PersonRow {
  seat: ParticipantSeat;
  status: PersonStatus;
  isLeader: boolean;
}

/**
 * Whether the call's roster can be trusted for who is in it. Reconnecting
 * still counts: the list may be a little stale, and the panel says so, but
 * calling everyone "not in call" for a blip would be wrong.
 */
export function callIsVisible(call: CallView | null): call is CallView {
  return call !== null && (call.status === 'connected' || call.status === 'reconnecting');
}

/**
 * Everyone in the session, once each.
 *
 * The board's presence is the base: being in the session means being on the
 * board, call or not. Where the call can be seen, its entry stands in for the
 * board's, since it carries the mic and speaking state. Anyone the call has
 * heard from before the board has is added rather than left out for a moment.
 */
export function mergeRoster(
  present: readonly VoiceParticipant[],
  call: CallView | null,
): VoiceParticipant[] {
  if (!callIsVisible(call)) return [...present];
  const inCall = new Map(call.participants.map((p) => [p.identity, p]));
  const onBoard = new Set(present.map((p) => p.identity));
  return [
    ...present.map((p) => inCall.get(p.identity) ?? p),
    ...call.participants.filter((p) => !onBoard.has(p.identity)),
  ];
}

/**
 * Everyone in the session, in the board's order, with where each of them is.
 *
 * Mic trouble is only knowable for yourself. Someone else whose browser
 * refused the microphone is simply not publishing, which LiveKit reports as
 * muted, so that is what their row says.
 */
export function peopleRows({
  present,
  call,
  speaking,
  leaderId,
}: {
  present: readonly VoiceParticipant[];
  call: CallView | null;
  speaking: ReadonlySet<string>;
  leaderId: string | null;
}): PersonRow[] {
  const seen = callIsVisible(call) ? call : null;
  const inCall = new Map(seen ? seen.participants.map((p) => [p.identity, p]) : []);

  return seatParticipants(mergeRoster(present, call)).map((seat) => {
    let status: PersonStatus;
    const voice = inCall.get(seat.identity);
    if (!seen) status = 'on-board';
    else if (!voice) status = 'not-in-call';
    else if (voice.isLocal && seen.micStatus === 'blocked') status = 'mic-blocked';
    else if (voice.isLocal && seen.micStatus === 'no-device') status = 'no-mic';
    else if (voice.isMuted) status = 'muted';
    else status = speaking.has(seat.identity) ? 'speaking' : 'in-call';
    return { seat, status, isLeader: leaderId !== null && seat.identity === leaderId };
  });
}

/**
 * Whether the leader's Mute has anything to do for this person: in the call,
 * microphone on, and not the leader themselves. The server draws the same
 * line for "Mute all" (everyone but whoever asked).
 */
export function canBeMuted(row: PersonRow): boolean {
  return !row.seat.isLocal && (row.status === 'in-call' || row.status === 'speaking');
}

/** Whether "Mute all" would mute anyone right now. */
export function anyoneToMute(present: readonly VoiceParticipant[], call: CallView | null): boolean {
  return peopleRows({ present, call, speaking: new Set(), leaderId: null }).some(canBeMuted);
}

/**
 * The one line above the list that explains it, when it needs explaining.
 * `boardLive` is the board's own connection, which presence comes from.
 */
export function peopleNote(call: CallView | null, boardLive: boolean): string | null {
  // First: while it holds, it is the one thing about the list worth knowing.
  if (!boardLive || call?.status === 'reconnecting') {
    return 'Reconnecting. This list may be out of date.';
  }
  if (call === null) return 'No call in this session. Everyone works on the board.';
  switch (call.status) {
    case 'idle':
    case 'connecting':
      return 'Joining the call…';
    case 'failed':
      return 'Voice is offline, so who is in the call cannot be shown.';
    case 'unavailable':
      return 'Voice is not available on this server.';
    default:
      return null;
  }
}
