import { useCallback, useSyncExternalStore } from 'react';

/**
 * Which theme the app is in: light, dark, or whichever the device is in.
 *
 * The choice lives on this device in `localStorage`, not on the server: it is a preference about
 * a screen, and a person can want a dark laptop and a light phone. A device that has never been
 * asked follows its own setting, which is what no key at all means.
 *
 * The theme itself is one attribute, `data-theme` on `<html>`, which the stylesheet reads. The
 * inline script in `index.html` sets it before the first paint so the page does not flash light,
 * and this file keeps it right after that.
 *
 * Every access to storage is wrapped: it throws in some private modes and wherever site data is
 * blocked, and a theme is never worth failing a page over.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'rt_theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set<() => void>();

/** What was chosen on this device. Defaults to following the device. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** The device's own setting. Light where the browser cannot say. */
export function deviceTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): Theme {
  return preference === 'system' ? deviceTheme() : preference;
}

/** Puts the theme on the page, and tells whatever is showing it. Returns the theme it set. */
export function applyTheme(preference: ThemePreference = readThemePreference()): Theme {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  for (const listener of listeners) listener();
  return theme;
}

/** Remembers a choice on this device and puts it on the page. */
export function writeThemePreference(preference: ThemePreference): void {
  try {
    // Following the device is the absence of a choice, so nothing is left behind for it.
    if (preference === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // The choice holds for this visit; only its memory is lost.
  }
  applyTheme(preference);
}

/**
 * Keeps the page in step with the device while the choice is to follow it, and with another tab
 * that changes it. Call once, at start-up. Returns how to stop.
 */
export function followTheme(): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  const onDevice = (): void => {
    if (readThemePreference() === 'system') applyTheme('system');
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === THEME_KEY || event.key === null) applyTheme();
  };
  query?.addEventListener('change', onDevice);
  window.addEventListener('storage', onStorage);
  return () => {
    query?.removeEventListener('change', onDevice);
    window.removeEventListener('storage', onStorage);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The choice on this device, and how to change it. */
export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, readThemePreference, () => 'system' as const);
  const set = useCallback((next: ThemePreference) => writeThemePreference(next), []);
  return [preference, set];
}

/**
 * The theme that is showing, light or dark, for a component whose picture depends on it. Not the
 * choice: a device that follows its own setting is one or the other at any moment.
 */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    () => 'light' as const,
  );
}
