import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSetup, setupAutosaveKey, writeSetup } from './setupAutosave';
import { initialSetupState, type SetupFormState } from './useSessionSetupForm';
import { AUTOSAVE_MS, useSetupAutosave } from './useSetupAutosave';

const KEY = setupAutosaveKey('u1')!;
const form = (title: string): SetupFormState => ({
  ...initialSetupState({ title, questions: [{ text: 'Q?', votingEnabled: true }] }, () => 'k1'),
  edited: true,
});

describe('useSetupAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps the form once it has been still for a moment', () => {
    const { rerender } = renderHook(
      ({ state }) => useSetupAutosave({ key: KEY, state, hasUnsavedWork: true }),
      { initialProps: { state: form('Road') } },
    );
    rerender({ state: form('Roadmap') });
    act(() => vi.advanceTimersByTime(AUTOSAVE_MS - 1));
    expect(readSetup(KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(readSetup(KEY)?.state.title).toBe('Roadmap');
  });

  it('keeps nothing for a form that has been sent, even if a save was waiting', () => {
    const state = form('Roadmap');
    const { result } = renderHook(() =>
      useSetupAutosave({ key: KEY, state, hasUnsavedWork: true }),
    );
    act(() => result.current.markSent(state));
    act(() => vi.advanceTimersByTime(AUTOSAVE_MS * 2));
    expect(readSetup(KEY)).toBeNull();
  });

  it('leaves a kept form alone while it is on offer and nothing new is written', () => {
    writeSetup(KEY, form('Old'));
    const untouched = { ...form(''), edited: false };
    const { result } = renderHook(() =>
      useSetupAutosave({ key: KEY, state: untouched, hasUnsavedWork: false }),
    );
    expect(result.current.kept?.state.title).toBe('Old');
    act(() => vi.advanceTimersByTime(AUTOSAVE_MS * 2));
    expect(readSetup(KEY)?.state.title).toBe('Old');

    act(() => result.current.discard());
    expect(result.current.kept).toBeNull();
    expect(readSetup(KEY)).toBeNull();
  });

  // Code review: new work written over an unanswered offer was never kept, and
  // was lost to a closed tab.
  it('withdraws the offer once something new is written, and keeps that instead', () => {
    writeSetup(KEY, form('Old'));
    const blank = { ...form(''), edited: false };
    const { result, rerender } = renderHook(
      ({ state, hasUnsavedWork }) => useSetupAutosave({ key: KEY, state, hasUnsavedWork }),
      { initialProps: { state: blank, hasUnsavedWork: false } },
    );
    expect(result.current.kept?.state.title).toBe('Old');

    rerender({ state: form('New'), hasUnsavedWork: true });
    expect(result.current.kept).toBeNull();
    act(() => vi.advanceTimersByTime(AUTOSAVE_MS));
    expect(readSetup(KEY)?.state.title).toBe('New');
  });

  it('keeps nothing without a key', () => {
    const { result } = renderHook(() =>
      useSetupAutosave({ key: null, state: form('Roadmap'), hasUnsavedWork: true }),
    );
    act(() => vi.advanceTimersByTime(AUTOSAVE_MS * 2));
    expect(result.current.kept).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
