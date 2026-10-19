import { useMemo, type ReactNode } from 'react';
import type { SessionUserPayload } from '@roundtable/shared/events';

import { useSustainedSpeaking, voiceStateByIdentity, type VoiceParticipant } from '../voice';
import { TableScene, type TableSeatView } from './TableScene';
import { useTableSeating } from './useTableSeating';
import { initialsFromName, swatchForId } from './waitingRoomSeats';

/** Past this many chairs, place cards give way to all but the ones worth finding. */
const CROWDED_CHAIRS = 16;
/** A phone's table is smaller, so it crowds sooner. */
const CROWDED_CHAIRS_SMALL = 10;

interface WaitingRoomTableProps {
  /** Who is connected right now; null until the room's first snapshot. */
  participants: SessionUserPayload[] | null;
  leaderId: string | null;
  /** Whose screen this is, for "(you)". */
  viewerId: string | null;
  /**
   * Who is in the voice room, joined onto the seats by user id (LiveKit's
   * identity is the user id). A different set from `participants`, which is
   * socket presence: someone can be seated while still connecting, with a
   * blocked microphone, or on a server with no voice at all. Defaults to
   * empty, which draws plain seats.
   */
  voiceParticipants?: readonly VoiceParticipant[];
  /** A small screen: place cards thin out at a smaller crowd. */
  small?: boolean;
  /** A light circling the rim while members wait. */
  orbit?: boolean;
  /** `lit` as the session starts: the glow swells and everyone leans in. */
  mood?: 'lit';
  /** On the tabletop: Start, or what everyone is waiting for. */
  children?: ReactNode;
}

const NO_VOICE: readonly VoiceParticipant[] = [];

/**
 * The waiting room's round table, with the room's live presence sat at it.
 *
 * Until the first snapshot it shows the chairs alone: who is actually here is
 * not known yet, and the persisted member list would seat people who closed
 * their tab days ago, only to have them leave again a moment later.
 */
export function WaitingRoomTable({
  participants,
  leaderId,
  viewerId,
  voiceParticipants = NO_VOICE,
  small = false,
  orbit = false,
  mood,
  children,
}: WaitingRoomTableProps) {
  // Called here rather than by the page: this re-renders on every speech edge
  // and again when each 600ms tail expires, and one level up that would
  // repaint the invite card and the question list at the same rate.
  const speaking = useSustainedSpeaking(voiceParticipants);
  const voiceById = useMemo(() => voiceStateByIdentity(voiceParticipants), [voiceParticipants]);
  const { chairs, seated } = useTableSeating(participants, leaderId);

  const seats = useMemo<TableSeatView[]>(
    () =>
      seated.map((person) => ({
        id: person.id,
        name: person.displayName,
        initials: initialsFromName(person.displayName),
        // The board's colour rule, one fill per person whoever else is here,
        // so a seat matches that person's row in People and keeps it at Start.
        swatch: swatchForId(person.id),
        slot: person.slot,
        isLeader: person.id === leaderId,
        isLocal: person.id === viewerId,
        isSpeaking: speaking.has(person.id),
        // False means "nothing to show", not "silent": someone who has not
        // reached the voice room has said nothing about their microphone.
        isMuted: voiceById.get(person.id)?.isMuted ?? false,
        ...(person.motion ? { motion: person.motion } : {}),
      })),
    [seated, leaderId, viewerId, speaking, voiceById],
  );

  const leaderSeated = participants !== null && participants.some((p) => p.id === leaderId);

  return (
    <TableScene
      chairs={chairs}
      seats={seats}
      // Only once presence is known: before that, an empty head chair says
      // nothing about whether the leader is here.
      hostWaiting={participants !== null && leaderId !== null && !leaderSeated}
      orbit={orbit}
      {...(mood ? { mood } : {})}
      compact={chairs > (small ? CROWDED_CHAIRS_SMALL : CROWDED_CHAIRS)}
      label="At the table"
      centre={children}
    />
  );
}
