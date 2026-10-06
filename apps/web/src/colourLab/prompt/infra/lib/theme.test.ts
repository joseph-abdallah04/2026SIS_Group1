import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  THEME_KEY,
  applyTheme,
  followTheme,
  readThemePreference,
  resolveTheme,
  useResolvedTheme,
  useThemePreference,
  writeThemePreference,
} from './theme';

/** A stand-in for `matchMedia` whose answer can be changed, like a device switching theme. */
function installDevice(dark: boolean) {
  const handlers = new Set<() => void>();
  const query = {
    matches: dark,
    addEventListener: (_: string, handler: () => void) => handlers.add(handler),
    removeEventListener: (_: string, handler: () => void) => handlers.delete(handler),
  };
  window.matchMedia = vi.fn().mockReturnValue(query);
  return {
    set(next: boolean) {
      query.matches = next;
      for (const handler of handlers) handler();
    },
    listening: () => handlers.size,
  };
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  // @ts-expect-error The suite has no matchMedia, on purpose, and puts it back that way.
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe('readThemePreference', () => {
  it('follows the device until a choice is made', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('reads a choice, and ignores anything it does not know', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readThemePreference()).toBe('dark');
    localStorage.setItem(THEME_KEY, 'light');
    expect(readThemePreference()).toBe('light');
    localStorage.setItem(THEME_KEY, 'purple');
    expect(readThemePreference()).toBe('system');
  });

  it('does not fail where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readThemePreference()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('is the choice, or the device when the choice is to follow it', () => {
    installDevice(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system')).toBe('dark');
  });

  it('is light where the browser cannot say', () => {
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('applyTheme and writeThemePreference', () => {
  it('puts the theme on the page', () => {
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('remembers a choice, and forgets it when the choice is to follow the device', () => {
    installDevice(false);
    writeThemePreference('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    writeThemePreference('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('still changes the page where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    writeThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('followTheme', () => {
  it('follows the device while the choice is to follow it', () => {
    const device = installDevice(false);
    applyTheme();
    const stop = followTheme();
    device.set(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    device.set(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
    expect(device.listening()).toBe(0);
  });

  it('does not follow it once a choice is made', () => {
    const device = installDevice(false);
    writeThemePreference('light');
    const stop = followTheme();
    device.set(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    stop();
  });

  it('follows a choice made in another tab', () => {
    installDevice(false);
    const stop = followTheme();
    localStorage.setItem(THEME_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    stop();
  });

  it('works where there is no way to ask the device', () => {
    const stop = followTheme();
    expect(() => stop()).not.toThrow();
  });
});

describe('useThemePreference', () => {
  it('gives the choice and changes it', () => {
    installDevice(false);
    const { result } = renderHook(() => useThemePreference());
    expect(result.current[0]).toBe('system');
    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => result.current[1]('system'));
    expect(result.current[0]).toBe('system');
  });
});

describe('useResolvedTheme', () => {
  it('is the theme that is showing, and follows it as it changes', () => {
    const device = installDevice(false);
    applyTheme();
    const stop = followTheme();
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');
    act(() => device.set(true));
    expect(result.current).toBe('dark');
    act(() => writeThemePreference('light'));
    expect(result.current).toBe('light');
    stop();
  });
});
