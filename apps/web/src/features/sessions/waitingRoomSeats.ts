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
 * The swatch for one person, independent of who else is in the room.
 *
 * One rule everywhere a person is drawn: the waiting room's table, People, the
 * board's header and the ballot. A fill that depended on the rest of the room
 * (the table once walked collisions so no two heads shared one) would recolour
 * people as others joined or left, differ between the table and the People
 * list on one page, and change at Start. Two people can share a fill this way;
 * their names tell them apart, and stability is worth more.
 */
export function swatchForId(id: string): SeatSwatch {
  const swatch = SEAT_PALETTE[hashId(id) % SEAT_PALETTE.length];
  // The modulo cannot leave the array; this only satisfies the checker.
  return swatch ?? { background: '#4d6a74', color: '#ffffff' };
}

/**
 * Distance from the scene centre to each seat centre, as a percent of the
 * square scene: far enough in that a chair fits behind every seat and a place
 * card in front of it, on the tabletop.
 */
export const SEAT_RING_PERCENT = 39;

/** The leader's chair, at 12 o'clock. Kept for them while they are away. */
export const HOST_SLOT = 0;

/**
 * Chairs set for a room this size: two spare, so the table looks ready for
 * whoever is still coming, and never fewer than eight.
 */
export function chairsFor(people: number): number {
  return Math.max(8, people + 2);
}

/**
 * The order empty chairs fill: either side of the host in turn, working round
 * to the far side, so a table that is not yet full still looks balanced.
 * The host's own chair is never in it.
 */
export function chairFillOrder(chairs: number): number[] {
  const order: number[] = [];
  for (let step = 1; order.length < chairs - 1; step += 1) {
    order.push(step);
    if (order.length < chairs - 1 && chairs - step !== step) order.push(chairs - step);
  }
  return order;
}

/** Where everyone sits: a chair index per person. */
export interface Seating {
  chairs: number;
  slots: ReadonlyMap<string, number>;
}

/**
 * Seat these people from scratch: the leader at the head, everyone else along
 * `chairFillOrder` in the order given. `chairs` must leave a chair for each.
 */
function seatInOrder(ids: readonly string[], leaderId: string | null, chairs: number): Seating {
  const order = chairFillOrder(chairs);
  const slots = new Map<string, number>();
  let next = 0;
  for (const id of ids) {
    if (id === leaderId) {
      slots.set(id, HOST_SLOT);
      continue;
    }
    const slot = order[next];
    next += 1;
    if (slot !== undefined) slots.set(id, slot);
  }
  return { chairs, slots };
}

/**
 * Who sits where once the room has changed to `ids`.
 *
 * Anyone already seated keeps their chair, so the table does not shuffle
 * under people; a newcomer takes the next empty one. When none is left the
 * table grows by two chairs and everyone is seated again in the same order
 * round it, which moves them along the rim rather than across it. The first
 * call (`prev` null) seats everyone with the room's spare chairs set.
 */
export function reseat(
  prev: Seating | null,
  ids: readonly string[],
  leaderId: string | null,
): Seating {
  if (prev === null) return seatInOrder(ids, leaderId, chairsFor(ids.length));

  const wanted = new Set(ids);
  const slots = new Map([...prev.slots].filter(([id]) => wanted.has(id)));
  const taken = new Set(slots.values());
  const order = chairFillOrder(prev.chairs);
  for (const id of ids) {
    if (slots.has(id)) continue;
    if (id === leaderId) {
      slots.set(id, HOST_SLOT);
      taken.add(HOST_SLOT);
      continue;
    }
    const free = order.find((slot) => !taken.has(slot));
    if (free === undefined) {
      // Full: reseat everyone, those already here in their order round the
      // table and then whoever is new, at a table with spare chairs again.
      const rank = new Map(order.map((slot, index) => [slot, index]));
      const seated = [...slots]
        .sort(([, a], [, b]) => (rank.get(a) ?? -1) - (rank.get(b) ?? -1))
        .map(([seatedId]) => seatedId);
      const newcomers = ids.filter((other) => !slots.has(other));
      return seatInOrder([...seated, ...newcomers], leaderId, chairsFor(ids.length));
    }
    slots.set(id, free);
    taken.add(free);
  }
  return { chairs: prev.chairs, slots };
}

/**
 * A seat's diameter, as a percent of the scene's width. As big as a full
 * table allows, so a small room gets big friendly seats and a crowded one
 * shrinks them before they touch.
 */
export function seatSizePercent(chairs: number): number {
  const arc = (2 * Math.PI * SEAT_RING_PERCENT) / Math.max(chairs, 1);
  return Math.min(11.5, arc * 0.6);
}

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
