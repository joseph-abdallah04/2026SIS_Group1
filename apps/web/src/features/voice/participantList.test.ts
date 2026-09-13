import { describe, expect, it } from 'vitest';

import { initialsFromName, swatchForId } from '../sessions/waitingRoomSeats';
import {
  orderParticipants,
  presenceLabel,
  seatParticipants,
  splitForHeader,
} from './participantList';
import type { VoiceParticipant } from './useVoiceRoom';

function person(overrides: Partial<VoiceParticipant> & { identity: string }): VoiceParticipant {
  return {
    name: overrides.identity,
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    ...overrides,
  };
}

describe('orderParticipants', () => {
  it('puts you first, whatever your name sorts as', () => {
    const ordered = orderParticipants([
      person({ identity: 'u2', name: 'Ada' }),
      person({ identity: 'u1', name: 'Zoë', isLocal: true }),
      person({ identity: 'u3', name: 'Mia' }),
    ]);

    expect(ordered.map((p) => p.name)).toEqual(['Zoë', 'Ada', 'Mia']);
  });

  it('sorts everyone else by name, case-insensitively', () => {
    const ordered = orderParticipants([
      person({ identity: 'u1', name: 'bella' }),
      person({ identity: 'u2', name: 'Ada' }),
      person({ identity: 'u3', name: 'Carla' }),
    ]);

    expect(ordered.map((p) => p.name)).toEqual(['Ada', 'bella', 'Carla']);
  });

  it('orders the same room identically however each client received it', () => {
    // The point of sorting at all: arrival order differs per client, so two
    // screens must not show the same five people in two orders.
    const room = [
      person({ identity: 'u1', name: 'Ada' }),
      person({ identity: 'u2', name: 'Mia' }),
      person({ identity: 'u3', name: 'Sam' }),
      person({ identity: 'u4', name: 'Joe' }),
      person({ identity: 'u5', name: 'Kim' }),
    ];

    const mine = orderParticipants(room).map((p) => p.identity);
    const theirs = orderParticipants([...room].reverse()).map((p) => p.identity);

    expect(mine).toEqual(theirs);
  });

  it('breaks ties on identity so duplicate display names still agree', () => {
    const twins = [
      person({ identity: 'u9', name: 'Alex' }),
      person({ identity: 'u4', name: 'Alex' }),
    ];

    expect(orderParticipants(twins).map((p) => p.identity)).toEqual(['u4', 'u9']);
    expect(orderParticipants([...twins].reverse()).map((p) => p.identity)).toEqual(['u4', 'u9']);
  });

  it('does not mutate what it was given', () => {
    const room = [person({ identity: 'u2', name: 'Zoë' }), person({ identity: 'u1', name: 'Ada' })];
    orderParticipants(room);

    expect(room.map((p) => p.name)).toEqual(['Zoë', 'Ada']);
  });
});

describe('seatParticipants', () => {
  it('derives initials the way the waiting room does', () => {
    const seats = seatParticipants([
      person({ identity: 'u1', name: 'Alice Smith' }),
      person({ identity: 'u2', name: 'Joey' }),
    ]);

    expect(seats.map((s) => s.initials)).toEqual(['AS', 'JO']);
    expect(seats[0]?.initials).toBe(initialsFromName('Alice Smith'));
  });

  it('colours each person from their identity alone', () => {
    // LiveKit identity is the user id (`issueVoiceToken`), which is the key the
    // waiting room hashes — so the colour carries across the join.
    const ids = ['user-a', 'user-b', 'user-c'];
    const seats = seatParticipants(ids.map((identity) => person({ identity })));

    for (const seat of seats) {
      expect(seat.swatch).toEqual(swatchForId(seat.identity));
    }
  });

  it('does not recolour anyone when the room changes around them', () => {
    // The bug this guards: `colorsForParticipants` resolves collisions against
    // whichever set it is handed, so seating the rail with it made a person's
    // fill depend on who else was connected — about a fifth of five-person
    // rooms visibly recoloured someone when the next person joined.
    const alone = seatParticipants([person({ identity: 'user-15' })]);
    const crowded = seatParticipants(
      ['user-15', 'user-0', 'user-3', 'user-7'].map((identity) => person({ identity })),
    );

    const before = alone.find((s) => s.identity === 'user-15')?.swatch;
    const after = crowded.find((s) => s.identity === 'user-15')?.swatch;
    expect(before).toEqual(after);
  });

  it('keeps the ordering it inherits', () => {
    const seats = seatParticipants([
      person({ identity: 'u2', name: 'Mia' }),
      person({ identity: 'u1', name: 'Ada', isLocal: true }),
    ]);

    expect(seats.map((s) => s.name)).toEqual(['Ada', 'Mia']);
  });

  it('carries speaking and muted through untouched', () => {
    const [seat] = seatParticipants([
      person({ identity: 'u1', name: 'Ada', isSpeaking: true, isMuted: true }),
    ]);

    expect(seat?.isSpeaking).toBe(true);
    expect(seat?.isMuted).toBe(true);
  });
});

describe('presenceLabel', () => {
  it('counts people in words', () => {
    expect(presenceLabel(0)).toBe('0 people');
    expect(presenceLabel(1)).toBe('1 person');
    expect(presenceLabel(5)).toBe('5 people');
  });
});

describe('splitForHeader', () => {
  /** Seats in the order `seatParticipants` would produce them. */
  function roomOf(...names: string[]) {
    return seatParticipants(names.map((name, i) => person({ identity: `u${i}`, name })));
  }

  const nobody: ReadonlySet<string> = new Set();

  it('shows everyone when the room fits', () => {
    const seats = roomOf('Ada', 'Bea', 'Cal');
    const { visible, hidden } = splitForHeader(seats, nobody, 5);

    expect(visible).toHaveLength(3);
    expect(hidden).toHaveLength(0);
  });

  it('keeps the first N and hides the rest, in order', () => {
    const seats = roomOf('Ada', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus');
    const { visible, hidden } = splitForHeader(seats, nobody, 5);

    expect(visible.map((s) => s.name)).toEqual(['Ada', 'Bea', 'Cal', 'Dee', 'Eli']);
    expect(hidden.map((s) => s.name)).toEqual(['Fay', 'Gus']);
  });

  it('promotes a hidden speaker into the last slot', () => {
    // The whole point: a header cannot scroll, so truncating would hide exactly
    // the person a presence indicator exists to report.
    const seats = roomOf('Ada', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus');
    const { visible, hidden } = splitForHeader(seats, new Set(['u6']), 5);

    expect(visible.map((s) => s.name)).toEqual(['Ada', 'Bea', 'Cal', 'Dee', 'Gus']);
    // The displaced seat rejoins the hidden set in the room's own order.
    expect(hidden.map((s) => s.name)).toEqual(['Eli', 'Fay']);
  });

  it('leaves the other bubbles where the viewer already found them', () => {
    const seats = roomOf('Ada', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay');
    const before = splitForHeader(seats, nobody, 5).visible.map((s) => s.name);
    const after = splitForHeader(seats, new Set(['u5']), 5).visible.map((s) => s.name);

    // Only the final slot changes identity.
    expect(after.slice(0, 4)).toEqual(before.slice(0, 4));
  });

  it('never displaces you', () => {
    // Your own bubble vanishing to make room for someone else is a worse
    // surprise than not seeing that someone.
    const seats = seatParticipants([
      person({ identity: 'me', name: 'Zoe', isLocal: true }),
      ...['Ada', 'Bea', 'Cal', 'Dee'].map((name, i) =>
        person({ identity: `u${i}`, name, isSpeaking: true }),
      ),
      person({ identity: 'late', name: 'Gus', isSpeaking: true }),
    ]);
    const speaking = new Set(['u0', 'u1', 'u2', 'u3', 'late']);
    const { visible, hidden } = splitForHeader(seats, speaking, 5);

    expect(visible.some((s) => s.isLocal)).toBe(true);
    // Everyone else visible is already speaking, so Gus has to stay hidden.
    expect(hidden.map((s) => s.name)).toEqual(['Gus']);
  });

  it('does not displace someone who is speaking to show someone else who is', () => {
    const seats = roomOf('Ada', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay');
    // Eli (visible, last) and Fay (hidden) both talking.
    const { visible } = splitForHeader(seats, new Set(['u4', 'u5']), 5);

    const names = visible.map((s) => s.name);
    expect(names).toContain('Eli');
    expect(names).toContain('Fay');
    // Dee was the last non-speaking seat, so Dee is the one who gave way.
    expect(names).not.toContain('Dee');
  });

  it('promotes several speakers when there is room to', () => {
    const seats = roomOf('Ada', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal');
    const { visible } = splitForHeader(seats, new Set(['u6', 'u7']), 5);

    expect(visible.map((s) => s.name)).toEqual(['Ada', 'Bea', 'Cal', 'Gus', 'Hal']);
  });

  it('resolves a room the same way on every client', () => {
    // Arrival order differs per client, so the seating step is what has to
    // agree; this checks the split rides on that rather than on input order.
    const names = ['Ada', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay'];
    const people = names.map((name, i) => person({ identity: `u${i}`, name }));
    const mine = splitForHeader(seatParticipants(people), new Set(['u5']), 5);
    const theirs = splitForHeader(seatParticipants([...people].reverse()), new Set(['u5']), 5);

    expect(theirs.visible.map((s) => s.identity)).toEqual(mine.visible.map((s) => s.identity));
    expect(theirs.hidden.map((s) => s.identity)).toEqual(mine.hidden.map((s) => s.identity));
  });

  it('hides everyone at a limit of zero rather than throwing', () => {
    const seats = roomOf('Ada', 'Bea');
    const { visible, hidden } = splitForHeader(seats, nobody, 0);

    expect(visible).toHaveLength(0);
    expect(hidden).toHaveLength(2);
  });
});
