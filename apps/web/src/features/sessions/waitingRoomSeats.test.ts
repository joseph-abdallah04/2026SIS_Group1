import { describe, expect, it } from 'vitest';

import {
  SEAT_PALETTE,
  colorsForParticipants,
  idsThatJustJoined,
  initialsFromName,
  orderSeats,
  seatPositions,
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

describe('colorsForParticipants', () => {
  it('gives the same person the same swatch', () => {
    const first = colorsForParticipants(['user-a']);
    const second = colorsForParticipants(['user-a']);
    expect(first['user-a']).toEqual(second['user-a']);
  });

  it('assigns unique swatches in a typical room', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
    const colors = colorsForParticipants(ids);
    const backgrounds = ids.map((id) => colors[id]?.background);
    expect(new Set(backgrounds).size).toBe(ids.length);
  });

  it('resolves collisions the same way regardless of input order', () => {
    const ids = ['zeta', 'alpha', 'mu'];
    const forward = colorsForParticipants(ids);
    const reverse = colorsForParticipants([...ids].reverse());
    expect(forward).toEqual(reverse);
  });

  it('picks from the curated palette', () => {
    const colors = colorsForParticipants(['anyone']);
    expect(SEAT_PALETTE).toContainEqual(colors.anyone);
  });
});

describe('orderSeats', () => {
  it('pins the leader at index 0 and keeps everyone else in arrival order', () => {
    const people = [
      { id: 'a', displayName: 'A' },
      { id: 'leader', displayName: 'L' },
      { id: 'b', displayName: 'B' },
    ];
    expect(orderSeats(people, 'leader').map((p) => p.id)).toEqual(['leader', 'a', 'b']);
  });

  it('leaves the list as-is when the leader is not present', () => {
    const people = [
      { id: 'a', displayName: 'A' },
      { id: 'b', displayName: 'B' },
    ];
    expect(orderSeats(people, 'leader').map((p) => p.id)).toEqual(['a', 'b']);
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

describe('idsThatJustJoined', () => {
  it('pops nobody on the first snapshot', () => {
    expect(idsThatJustJoined(null, ['a', 'b'])).toEqual(new Set());
  });

  it('returns only ids that were not already seen', () => {
    expect(idsThatJustJoined(new Set(['a']), ['a', 'b'])).toEqual(new Set(['b']));
  });
});
