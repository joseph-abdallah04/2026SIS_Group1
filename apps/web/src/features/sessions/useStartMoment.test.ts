import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COUNT_STEP_MS, START_MOMENT_MS, useStartMoment } from './useStartMoment';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useStartMoment', () => {
  it('counts 3-2-1, lights the table, then hands over', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useStartMoment(onDone, false));
    expect(result.current.moment).toEqual({ phase: 'idle' });

    act(() => result.current.begin());
    expect(result.current.moment).toEqual({ phase: 'counting', count: 3 });
    act(() => vi.advanceTimersByTime(COUNT_STEP_MS));
    expect(result.current.moment).toEqual({ phase: 'counting', count: 2 });
    act(() => vi.advanceTimersByTime(COUNT_STEP_MS));
    expect(result.current.moment).toEqual({ phase: 'counting', count: 1 });
    act(() => vi.advanceTimersByTime(COUNT_STEP_MS));
    expect(result.current.moment).toEqual({ phase: 'lit' });
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(START_MOMENT_MS - COUNT_STEP_MS * 3));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // The broadcast and the leader's own Start both begin it.
  it('plays once however many times it is begun', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useStartMoment(onDone, false));

    act(() => result.current.begin());
    act(() => vi.advanceTimersByTime(COUNT_STEP_MS));
    act(() => result.current.begin());
    expect(result.current.moment).toEqual({ phase: 'counting', count: 2 });

    act(() => vi.advanceTimersByTime(START_MOMENT_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips straight to the board with reduced motion', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useStartMoment(onDone, true));

    act(() => result.current.begin());
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.moment).toEqual({ phase: 'idle' });
  });

  it('does not hand over after the page has gone', () => {
    const onDone = vi.fn();
    const { result, unmount } = renderHook(() => useStartMoment(onDone, false));

    act(() => result.current.begin());
    unmount();
    vi.advanceTimersByTime(START_MOMENT_MS);
    expect(onDone).not.toHaveBeenCalled();
  });
});
