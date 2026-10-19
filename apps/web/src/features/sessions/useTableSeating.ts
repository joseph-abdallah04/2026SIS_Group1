import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { chairsFor, reseat, type Seating } from './waitingRoomSeats';

/**
 * How long an arrival is drawn as arriving: the chair slides out, the person
 * drops into it, and their place card stands up. Matches `rt-table-*` in
 * index.css, with a little to spare.
 */
export const JOIN_MS = 1200;
/** How long a departure stays on screen to fade out of its chair. */
export const LEAVE_MS = 520;

export interface TablePerson {
  id: string;
  displayName: string;
}

export interface SeatedPerson extends TablePerson {
  /** Which chair, counting clockwise from the host's at 12 o'clock. */
  slot: number;
  motion?: 'joining' | 'leaving';
}

interface Model {
  seating: Seating | null;
  joining: ReadonlySet<string>;
  /** Gone from the room, still fading out of their chair. */
  leaving: ReadonlyMap<string, TablePerson>;
}

const EMPTY: Model = { seating: null, joining: new Set(), leaving: new Map() };

/**
 * Who sits in which chair around the table, and who is arriving or leaving.
 *
 * `people` is the room's live presence, null until the first snapshot. That
 * first list is the baseline: everyone in it is simply seated, with nobody
 * drawn arriving, so opening the page does not play an entrance for the whole
 * room. After it, a newcomer takes an empty chair and is drawn arriving; a
 * departure keeps its chair while it fades, then frees it.
 *
 * Each arrival and departure runs on a timer of its own, rather than one
 * timer for everyone or the animation's end event: a second arrival cannot
 * cut the first one's short, and with reduced motion (no animation, so no
 * end event) nothing is left flagged as arriving.
 */
export function useTableSeating(
  people: readonly TablePerson[] | null,
  leaderId: string | null,
): { chairs: number; seated: SeatedPerson[] } {
  const [model, setModel] = useState<Model>(EMPTY);
  const lastPeople = useRef<ReadonlyMap<string, TablePerson> | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // Layout, not passive: the seat a newcomer takes is decided before the
  // browser paints the room with them in it.
  useLayoutEffect(() => {
    if (people === null) return;
    const now = new Map(people.map((person) => [person.id, person]));
    const before = lastPeople.current;
    lastPeople.current = now;

    if (before === null) {
      setModel({
        seating: reseat(null, [...now.keys()], leaderId),
        joining: new Set(),
        leaving: new Map(),
      });
      return;
    }

    const arrived = [...now.keys()].filter((id) => !before.has(id));
    const departed = [...before.values()].filter((person) => !now.has(person.id));
    if (arrived.length === 0 && departed.length === 0) return;

    setModel((current) => {
      const leaving = new Map(current.leaving);
      const joining = new Set(current.joining);
      for (const id of arrived) {
        // Back before they had finished leaving: still in their chair.
        if (leaving.delete(id)) continue;
        joining.add(id);
      }
      for (const person of departed) {
        joining.delete(person.id);
        leaving.set(person.id, person);
      }
      return {
        seating: reseat(current.seating, [...now.keys(), ...leaving.keys()], leaderId),
        joining,
        leaving,
      };
    });

    const schedule = (key: string, ms: number, run: () => void) => {
      const existing = timers.current.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          run();
        }, ms),
      );
    };
    const cancel = (key: string) => {
      const existing = timers.current.get(key);
      if (existing === undefined) return;
      clearTimeout(existing);
      timers.current.delete(key);
    };

    for (const id of arrived) {
      cancel(`leave:${id}`);
      schedule(`join:${id}`, JOIN_MS, () =>
        setModel((current) => {
          if (!current.joining.has(id)) return current;
          const joining = new Set(current.joining);
          joining.delete(id);
          return { ...current, joining };
        }),
      );
    }
    for (const person of departed) {
      cancel(`join:${person.id}`);
      schedule(`leave:${person.id}`, LEAVE_MS, () =>
        setModel((current) => {
          if (!current.leaving.has(person.id) || current.seating === null) return current;
          const leaving = new Map(current.leaving);
          leaving.delete(person.id);
          const slots = new Map(current.seating.slots);
          slots.delete(person.id);
          return { ...current, leaving, seating: { chairs: current.seating.chairs, slots } };
        }),
      );
    }
  }, [people, leaderId]);

  const seated = useMemo(() => {
    if (model.seating === null) return [];
    const present = new Map((people ?? []).map((person) => [person.id, person]));
    const result: SeatedPerson[] = [];
    for (const [id, slot] of model.seating.slots) {
      const leaving = model.leaving.get(id);
      const person = present.get(id) ?? leaving;
      if (!person) continue;
      result.push({
        id,
        displayName: person.displayName,
        slot,
        ...(leaving && !present.has(id)
          ? { motion: 'leaving' as const }
          : model.joining.has(id)
            ? { motion: 'joining' as const }
            : {}),
      });
    }
    return result;
  }, [model, people]);

  return { chairs: model.seating?.chairs ?? chairsFor(0), seated };
}
