import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INFRA_FILES, LOGO_COMPONENT, THEME_INIT_SCRIPT } from './infra';
import { THEME_KEY, applyTheme } from './infra/lib/theme';

const run = (): void => {
  new Function(THEME_INIT_SCRIPT)();
};

const device = (dark: boolean | null): void => {
  if (dark === null) {
    // @ts-expect-error The suite has no matchMedia, on purpose.
    delete window.matchMedia;
  } else {
    window.matchMedia = vi.fn().mockReturnValue({ matches: dark });
  }
};

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  device(null);
  vi.restoreAllMocks();
});

describe('the script that sets the theme before the first paint', () => {
  const cases: [string | null, boolean | null, 'light' | 'dark'][] = [
    [null, null, 'light'],
    [null, false, 'light'],
    [null, true, 'dark'],
    ['dark', false, 'dark'],
    ['dark', null, 'dark'],
    ['light', true, 'light'],
    ['purple', true, 'dark'],
    ['purple', false, 'light'],
  ];

  it.each(cases)(
    'with %s chosen and a device that is dark: %s, it sets %s',
    (stored, dark, theme) => {
      if (stored !== null) localStorage.setItem(THEME_KEY, stored);
      device(dark);
      run();
      expect(document.documentElement.dataset.theme).toBe(theme);
    },
  );

  it.each(cases)('and says what the module says (%s, %s)', (stored, dark) => {
    if (stored !== null) localStorage.setItem(THEME_KEY, stored);
    device(dark);
    run();
    const fromScript = document.documentElement.dataset.theme;
    delete document.documentElement.dataset.theme;
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe(fromScript);
  });

  it('is light where storage is blocked, and does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(run).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('the files the prompt carries', () => {
  it('are the real ones, laid out for the app', () => {
    expect(INFRA_FILES.map((f) => f.path)).toEqual([
      'apps/web/src/lib/theme.ts',
      'apps/web/src/lib/theme.test.ts',
      'apps/web/src/features/settings/AppearanceSettings.tsx',
      'apps/web/src/features/settings/AppearanceSettings.test.tsx',
    ]);
    for (const file of INFRA_FILES) expect(file.source.length).toBeGreaterThan(200);
  });

  it('import each other the way they will in the app', () => {
    const appearance = INFRA_FILES.find((f) => f.path.endsWith('AppearanceSettings.tsx'));
    expect(appearance?.source).toContain("from '../../lib/theme'");
    const test = INFRA_FILES.find((f) => f.path.endsWith('theme.test.ts'));
    expect(test?.source).toContain("from './theme'");
  });

  it('do not mention the lab, which the app does not have', () => {
    for (const file of INFRA_FILES) expect(file.source.toLowerCase()).not.toContain('colour lab');
    expect(LOGO_COMPONENT.toLowerCase()).not.toContain('colour lab');
  });
});
