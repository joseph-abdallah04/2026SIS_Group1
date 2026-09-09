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
