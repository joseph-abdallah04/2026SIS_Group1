import { describe, expect, it } from 'vitest';

import type { VoiceParticipant } from '../voice';
import { anyoneToMute, mergeRoster, peopleNote, peopleRows, type CallView } from './peopleRoster';

function person(
  identity: string,
  name: string,
  extra: Partial<VoiceParticipant> = {},
): VoiceParticipant {
  return { identity, name, isLocal: false, isSpeaking: false, isMuted: false, ...extra };
}

const me = person('u-me', 'Priya Shah', { isLocal: true });
const lead = person('u-lead', 'Jordan Avery');
const omar = person('u-omar', 'Omar Haddad');
const lena = person('u-lena', 'Lena Novak');

function call(participants: VoiceParticipant[], extra: Partial<CallView> = {}): CallView {
  return { participants, status: 'connected', micStatus: 'live', ...extra };
}

const NOBODY: ReadonlySet<string> = new Set();

describe('mergeRoster', () => {
  it('is the board when there is no call, or none this browser can see into', () => {
    expect(mergeRoster([me, lead], null)).toEqual([me, lead]);
    expect(mergeRoster([me, lead], call([], { status: 'connecting' }))).toEqual([me, lead]);
  });

  it('takes the call entry where there is one, and adds anyone only the call knows', () => {
    const mutedLead = { ...lead, isMuted: true };
    const merged = mergeRoster([me, lead], call([mutedLead, omar]));
    expect(merged).toEqual([me, mutedLead, omar]);
  });
});

describe('peopleRows', () => {
  it('orders you first, then everyone else by name, and marks the leader', () => {
    const rows = peopleRows({
      present: [omar, lead, me],
      call: null,
      speaking: NOBODY,
      leaderId: 'u-lead',
    });
    expect(rows.map((row) => row.seat.name)).toEqual(['Priya Shah', 'Jordan Avery', 'Omar Haddad']);
    expect(rows.map((row) => row.isLeader)).toEqual([false, true, false]);
  });

  it('says everyone is on the board in a session with no call', () => {
    const rows = peopleRows({ present: [me, lead], call: null, speaking: NOBODY, leaderId: null });
    expect(rows.map((row) => row.status)).toEqual(['on-board', 'on-board']);
  });

  it('reads where each person is from the call', () => {
    const rows = peopleRows({
      present: [me, lead, omar, lena],
      call: call([me, lead, { ...lena, isMuted: true }]),
      speaking: new Set(['u-lead']),
      leaderId: null,
    });
    const byName = Object.fromEntries(rows.map((row) => [row.seat.name, row.status]));
    expect(byName).toEqual({
      'Priya Shah': 'in-call',
      'Jordan Avery': 'speaking',
      'Lena Novak': 'muted',
      'Omar Haddad': 'not-in-call',
    });
  });

  it('names your own mic trouble, which only you can know about', () => {
    const blocked = peopleRows({
      present: [me],
      call: call([{ ...me, isMuted: true }], { micStatus: 'blocked' }),
      speaking: NOBODY,
      leaderId: null,
    });
    expect(blocked[0]?.status).toBe('mic-blocked');

    const missing = peopleRows({
      present: [me],
      call: call([{ ...me, isMuted: true }], { micStatus: 'no-device' }),
      speaking: NOBODY,
      leaderId: null,
    });
    expect(missing[0]?.status).toBe('no-mic');
  });

  it('does not call everyone "not in call" while the call itself cannot be seen', () => {
    const rows = peopleRows({
      present: [me, lead],
      call: call([], { status: 'failed' }),
      speaking: NOBODY,
      leaderId: null,
    });
    expect(rows.map((row) => row.status)).toEqual(['on-board', 'on-board']);
  });
});

describe('anyoneToMute', () => {
  it('is true only while someone besides you has their microphone on in the call', () => {
    expect(anyoneToMute([me, lead], call([me, lead]))).toBe(true);
    expect(anyoneToMute([me, lead], call([me, { ...lead, isMuted: true }]))).toBe(false);
    // On the board but not in the call: nothing to mute.
    expect(anyoneToMute([me, lead], call([me]))).toBe(false);
    expect(anyoneToMute([me, lead], null)).toBe(false);
  });
});

describe('peopleNote', () => {
  it('explains the list when it needs explaining, and is silent otherwise', () => {
    expect(peopleNote(null, true)).toMatch(/no call/i);
    expect(peopleNote(call([]), true)).toBeNull();
    expect(peopleNote(call([], { status: 'connecting' }), true)).toMatch(/joining the call/i);
    expect(peopleNote(call([], { status: 'failed' }), true)).toMatch(/voice is offline/i);
    expect(peopleNote(call([], { status: 'unavailable' }), true)).toMatch(/not available/i);
  });

  it('puts reconnecting first, from either connection', () => {
    expect(peopleNote(call([], { status: 'reconnecting' }), true)).toMatch(/reconnecting/i);
    expect(peopleNote(null, false)).toMatch(/reconnecting/i);
    expect(peopleNote(call([]), false)).toMatch(/reconnecting/i);
  });
});
