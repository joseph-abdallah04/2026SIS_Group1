export interface SeatSwatch {
  background: string;
  color: string;
}

export interface SeatPosition {
  x: number;
  y: number;
}

/**
 * Seat fills — not brand gold (that is the table and the leader ring).
 * Enough distinct swatches for a typical workshop; extras wrap after that.
 */
export const SEAT_PALETTE: readonly SeatSwatch[] = [
  { background: '#4d6a74', color: '#ffffff' },
  { background: '#c17b4a', color: '#ffffff' },
  { background: '#7a5c8a', color: '#ffffff' },
  { background: '#3d7a6a', color: '#ffffff' },
  { background: '#8b4d5c', color: '#ffffff' },
  { background: '#4a6b8a', color: '#ffffff' },
  { background: '#6a7a3d', color: '#ffffff' },
  { background: '#8a5a3a', color: '#ffffff' },
  { background: '#5c6b8a', color: '#ffffff' },
  { background: '#a05a6e', color: '#ffffff' },
  { background: '#3a7a82', color: '#ffffff' },
  { background: '#7a4d6a', color: '#ffffff' },
];

/** Two words → first letter of each; one word → first two letters. */
export function initialsFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) {
    return first.slice(0, Math.min(2, first.length)).toUpperCase();
  }
  const last = parts[parts.length - 1];
  if (!last) return first.charAt(0).toUpperCase();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Preferred swatch is `hash(id)` so a person looks the same across clients.
 * Collisions in this room walk to the next unused swatch; walk order is
 * sorted by id so every client resolves the same way.
 */
export function colorsForParticipants(ids: readonly string[]): Record<string, SeatSwatch> {
  const unique = [...new Set(ids)];
  const used = new Set<number>();
  const assigned: Record<string, SeatSwatch> = {};

  for (const id of [...unique].sort()) {
    let index = hashId(id) % SEAT_PALETTE.length;
    if (used.size < SEAT_PALETTE.length) {
      let steps = 0;
      while (used.has(index) && steps < SEAT_PALETTE.length) {
        index = (index + 1) % SEAT_PALETTE.length;
        steps += 1;
      }
    }
    used.add(index);
    const swatch = SEAT_PALETTE[index] ?? SEAT_PALETTE[0];
    if (swatch) assigned[id] = swatch;
  }

  return assigned;
}

/** Leader at index 0 (12 o'clock). Everyone else keeps arrival order. */
export function orderSeats<T extends { id: string }>(participants: readonly T[], leaderId: string): T[] {
  const leader = participants.find((person) => person.id === leaderId);
  const others = participants.filter((person) => person.id !== leaderId);
  return leader ? [leader, ...others] : [...others];
}

/**
 * Distance from the scene centre to each seat centre, as a percent of the
 * square scene. The table disc is inset inside this ring so bubbles sit
 * just outside the rim with a few pixels of air.
 */
export const SEAT_RING_PERCENT = 46;

/**
 * Circle positions in percent of the scene. Angle 0 is 12 o'clock, then clockwise.
 */
export function seatPositions(
  count: number,
  rx = SEAT_RING_PERCENT,
  ry = SEAT_RING_PERCENT,
): SeatPosition[] {
  if (count <= 0) return [];
  const positions: SeatPosition[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((-90 + (360 * i) / count) * Math.PI) / 180;
    positions.push({
      x: 50 + rx * Math.cos(angle),
      y: 50 + ry * Math.sin(angle),
    });
  }
  return positions;
}

/**
 * First snapshot (`seen === null`) pops nobody. After that, only ids that
 * were not already on the table.
 */
export function idsThatJustJoined(
  seen: ReadonlySet<string> | null,
  currentIds: readonly string[],
): Set<string> {
  if (seen === null) return new Set();
  return new Set(currentIds.filter((id) => !seen.has(id)));
}
