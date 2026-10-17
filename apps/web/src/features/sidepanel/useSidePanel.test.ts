import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSidePanel } from './useSidePanel';

describe('useSidePanel', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useSidePanel());
    expect(result.current.tab).toBeNull();
  });

  it('opens a feature from its button, and closes when that button is pressed again', () => {
    const { result } = renderHook(() => useSidePanel());
    act(() => result.current.toggle('chat'));
    expect(result.current.tab).toBe('chat');
    act(() => result.current.toggle('assistant'));
    expect(result.current.tab).toBe('assistant');
    act(() => result.current.toggle('assistant'));
    expect(result.current.tab).toBeNull();
  });

  it('opens a feature directly, whatever is showing', () => {
    const { result } = renderHook(() => useSidePanel());
    act(() => result.current.open('people'));
    act(() => result.current.open('people'));
    expect(result.current.tab).toBe('people');
  });

  it('reopens the rail on whatever was last showing, People before anything has', () => {
    const { result } = renderHook(() => useSidePanel());
    act(() => result.current.toggleOpen());
    expect(result.current.tab).toBe('people');

    act(() => result.current.open('assistant'));
    act(() => result.current.close());
    expect(result.current.tab).toBeNull();
    act(() => result.current.toggleOpen());
    expect(result.current.tab).toBe('assistant');
    act(() => result.current.toggleOpen());
    expect(result.current.tab).toBeNull();
  });
});
