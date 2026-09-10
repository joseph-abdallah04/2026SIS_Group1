import { describe, expect, it } from 'vitest';

import { phaseTimerView } from './PhaseTimer';

describe('phaseTimerView', () => {
  it('counts down in minutes and seconds', () => {
    expect(phaseTimerView(125_000, true)).toEqual({ label: '2:05', tone: 'count' });
  });

  it('flashes in the last ten seconds', () => {
    expect(phaseTimerView(10_000, true).tone).toBe('warn');
    expect(phaseTimerView(9_000, false)).toEqual({ label: '0:09', tone: 'warn' });
  });

  it('stays on 0:00 in red when overtime is not allowed', () => {
    expect(phaseTimerView(-1_000, false)).toEqual({ label: '0:00', tone: 'over' });
  });

  it('keeps counting past zero in red when overtime is allowed', () => {
    expect(phaseTimerView(0, true)).toEqual({ label: '0:00', tone: 'over' });
    expect(phaseTimerView(-15_000, true)).toEqual({ label: '+0:15', tone: 'over' });
  });
});
