import { describe, expect, it } from 'vitest';

import {
  HOST_SLOT,
  SEAT_PALETTE,
  SEAT_RING_PERCENT,
  chairFillOrder,
  chairsFor,
  initialsFromName,
  reseat,
  seatPositions,
  seatSizePercent,
  swatchForId,
} from './waitingRoomSeats';

describe('initialsFromName', () => {
  it('uses the first two letters of a single word', () => {
    expect(initialsFromName('Joey')).toBe('JO');
  });

  it('uses the first and last name initials', () => {
    expect(initialsFromName('Alice Smith')).toBe('AS');
  });

  it('ignores extra words in the middle', () => {
    expect(initialsFromName('Mary Ann Summer')).toBe('MS');
  });

  it('trims whitespace and uppercases', () => {
    expect(initialsFromName('  bob  ')).toBe('BO');
  });

  it('returns a placeholder when the name is empty', () => {
    expect(initialsFromName('   ')).toBe('?');
  });
});

describe('swatchForId', () => {
  it('gives the same person the same swatch every time', () => {
    expect(swatchForId('user-a')).toEqual(swatchForId('user-a'));
  });

  it('picks from the curated palette', () => {
    expect(SEAT_PALETTE).toContainEqual(swatchForId('anyone'));
  });
});

describe('seatPositions', () => {
  it('returns nothing for an empty table', () => {
    expect(seatPositions(0)).toEqual([]);
  });

  it('sits the first seat at 12 o’clock', () => {
    const leader = seatPositions(1, 48, 48)[0];
    expect(leader).toEqual({ x: expect.closeTo(50), y: expect.closeTo(2) });
  });

  it('puts a second seat at 6 o’clock', () => {
    const other = seatPositions(2, 48, 48)[1];
    expect(other).toEqual({ x: expect.closeTo(50), y: expect.closeTo(98) });
  });
});

describe('chairs', () => {
  it('sets two spare chairs, and never fewer than eight', () => {
    expect(chairsFor(0)).toBe(8);
    expect(chairsFor(6)).toBe(8);
    expect(chairsFor(7)).toBe(9);
    expect(chairsFor(20)).toBe(22);
  });

  it('fills either side of the host in turn, never the host’s own chair', () => {
    expect(chairFillOrder(8)).toEqual([1, 7, 2, 6, 3, 5, 4]);
    expect(chairFillOrder(9)).toEqual([1, 8, 2, 7, 3, 6, 4, 5]);
    expect(chairFillOrder(8)).not.toContain(HOST_SLOT);
  });

  it('shrinks seats for a crowded table before they would touch', () => {
    expect(seatSizePercent(8)).toBe(11.5);
    expect(seatSizePercent(30)).toBeLessThan(seatSizePercent(16));
    // Never wider than the arc each chair has round the ring.
    const arc = (2 * Math.PI * SEAT_RING_PERCENT) / 30;
    expect(seatSizePercent(30)).toBeLessThan(arc);
  });
});

describe('reseat', () => {
  const slotsOf = (seating: { slots: ReadonlyMap<string, number> }) =>
    Object.fromEntries(seating.slots);

  it('seats the leader at the head and everyone else either side', () => {
    const seating = reseat(null, ['a', 'leader', 'b', 'c'], 'leader');
    expect(seating.chairs).toBe(8);
    expect(slotsOf(seating)).toEqual({ leader: 0, a: 1, b: 7, c: 2 });
  });

  it('keeps the host’s chair for them while they are away', () => {
    const seating = reseat(null, ['a', 'b'], 'leader');
    expect([...seating.slots.values()]).not.toContain(HOST_SLOT);
  });

  it('leaves everyone in their chair when someone arrives, and seats the newcomer in the next', () => {
    const before = reseat(null, ['leader', 'a', 'b'], 'leader');
    const after = reseat(before, ['leader', 'a', 'b', 'c'], 'leader');
    expect(slotsOf(after)).toEqual({ ...slotsOf(before), c: 2 });
  });

  it('frees a chair for the next arrival once someone has gone', () => {
    const before = reseat(null, ['leader', 'a', 'b'], 'leader');
    const gone = reseat(before, ['leader', 'b'], 'leader');
    expect(slotsOf(gone)).toEqual({ leader: 0, b: 7 });
    // a's old chair, the first in the fill order, goes to whoever comes next.
    expect(slotsOf(reseat(gone, ['leader', 'b', 'd'], 'leader')).d).toBe(1);
  });

  it('grows the table by two when it is full, keeping everyone’s order round it', () => {
    const ids = ['leader', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const full = reseat(null, ids.slice(0, 7), 'leader');
    expect(full.chairs).toBe(9);
    const grown = reseat(full, [...ids, 'h', 'i'], 'leader');
    expect(grown.chairs).toBeGreaterThan(full.chairs);
    const order = chairFillOrder(grown.chairs);
    const rank = (id: string) => order.indexOf(grown.slots.get(id) ?? -1);
    expect(['a', 'b', 'c', 'd', 'e', 'f'].map(rank)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(grown.slots.values()).size).toBe(grown.slots.size);
  });
});
