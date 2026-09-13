import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';
import type { SeatSwatch } from '../sessions/waitingRoomSeats';
import type { VoiceParticipant } from './useVoiceRoom';

/**
 * A participant as the rail draws them (F13): the room's own facts, plus the
 * bubble that stands in for the avatar this product never had.
 */
export interface ParticipantSeat extends VoiceParticipant {
  initials: string;
  swatch: SeatSwatch;
}

/**
 * Stable order for the list.
 *
 * You first — it is your own state you check most often, and a row that moves
 * is a row you have to find again. Everyone else is alphabetical rather than
 * in arrival order: arrival order is per-client (it depends on who was already
 * in the room when *you* joined) and it reshuffles on every reconnect, so two
 * people comparing screens would see the same five names in two orders. Ties
 * fall back to identity so duplicate display names still sort identically
 * everywhere. The locale is pinned rather than left to the browser: `undefined`
 * means *each viewer's* locale, and locales genuinely disagree — 'Ödegaard'
 * sorts before 'Zoe' in en and after it in sv — which would reintroduce exactly
 * the disagreement this sort exists to remove.
 */
export function orderParticipants(
  participants: readonly VoiceParticipant[],
): readonly VoiceParticipant[] {
  return [...participants].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.identity.localeCompare(b.identity);
  });
}

/**
 * Order the room and give everyone their bubble.
 *
 * The colour comes from `swatchForId`, keyed on LiveKit identity — which the
 * token mints as the user id (`issueVoiceToken`). Deliberately the *unwalked*
 * hash rather than `colorsForParticipants`: that one resolves collisions
 * against the set it is handed, so a person's fill would depend on who else
 * happened to be connected, and someone already on the rail would visibly
 * change colour when a fifth person joined. Here a person's swatch is a
 * function of that person alone, which is what makes it stable across joins,
 * drops, reconnects and every other client's screen.
 */
export function seatParticipants(
  participants: readonly VoiceParticipant[],
): readonly ParticipantSeat[] {
  return orderParticipants(participants).map((person) => ({
    ...person,
    initials: initialsFromName(person.name),
    swatch: swatchForId(person.identity),
  }));
}

/**
 * How the count reads above the list. Plain words rather than a bare number:
 * "1" alone on a rail is ambiguous about what is being counted.
 */
export function presenceLabel(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

/**
 * Split the room into the bubbles the header shows and the rest behind its
 * overflow (F13.2).
 *
 * The header has room for a handful of people, and cutting the list at that
 * handful would sooner or later hide whoever is talking — which is the one
 * thing a presence indicator exists to report. (The rail solved this by never
 * truncating at all; a header cannot scroll, so it needs this instead.) So a
 * speaker who falls outside the window is *promoted* into it.
 *
 * Promotion takes slots, not the whole order: a speaker replaces the seat that
 * will be least missed — from the back — so the other bubbles keep the
 * positions the viewer has already learned. Two seats are never given up:
 * anyone already speaking, and you. Your own bubble vanishing to make room for
 * someone else is a worse surprise than not seeing that someone. Where several
 * speakers are promoted at once they still land in room order, so the visible
 * row reads the same way the full list does.
 *
 * When everyone visible is speaking there is nothing left to displace, so a
 * further speaker stays hidden and the caller's overflow control is left to say
 * so. Deterministic for a given room, speaking set and limit, so every client
 * resolves it the same way.
 */
export function splitForHeader(
  seats: readonly ParticipantSeat[],
  speaking: ReadonlySet<string>,
  limit: number,
): { visible: readonly ParticipantSeat[]; hidden: readonly ParticipantSeat[] } {
  if (limit <= 0) return { visible: [], hidden: seats };
  if (seats.length <= limit) return { visible: seats, hidden: [] };

  const head = seats.slice(0, limit);
  const overflowed = seats.slice(limit);
  const waiting = overflowed.filter((seat) => speaking.has(seat.identity));
  if (waiting.length === 0) return { visible: head, hidden: overflowed };

  const visible = [...head];
  const evicted: ParticipantSeat[] = [];

  // Which slots may be given up, least-missed first — so back to front, and
  // never a seat that is speaking or is you.
  const spare: number[] = [];
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    const seat = visible[i];
    if (!seat || seat.isLocal || speaking.has(seat.identity)) continue;
    spare.push(i);
  }

  // Fill those slots low-to-high with the waiting speakers in room order, so
  // promoted bubbles read in the same order as everything else. Taking them in
  // the order they were found would seat the later speaker further left.
  const slots = spare.slice(0, waiting.length).sort((a, b) => a - b);
  slots.forEach((slot, index) => {
    const speaker = waiting[index];
    const leaving = visible[slot];
    if (!speaker || !leaving) return;
    visible[slot] = speaker;
    evicted.push(leaving);
  });

  // Whoever is not on show, back in the room's own order, so the overflow
  // panel reads the same way the list always does.
  const shown = new Set(visible.map((seat) => seat.identity));
  const rank = new Map(seats.map((seat, index) => [seat.identity, index]));
  const hidden = [...overflowed, ...evicted]
    .filter((seat) => !shown.has(seat.identity))
    .sort((a, b) => (rank.get(a.identity) ?? 0) - (rank.get(b.identity) ?? 0));

  return { visible, hidden };
}
