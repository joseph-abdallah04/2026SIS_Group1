import appearanceSource from './infra/features/settings/AppearanceSettings.tsx?raw';
import appearanceTestSource from './infra/features/settings/AppearanceSettings.test.tsx?raw';
import themeSource from './infra/lib/theme.ts?raw';
import themeTestSource from './infra/lib/theme.test.ts?raw';

/**
 * The code that gives the app a way to be dark: a script that sets the theme before the first
 * paint, a small module that keeps it right, and the Settings tab that lets a person choose.
 *
 * The files are real and tested, in `infra/`, laid out as they will be in the app so that their
 * imports are the same in both places. The prompt carries them word for word.
 */

export interface InfraFile {
  path: string;
  language: string;
  source: string;
}

export const INFRA_FILES: readonly InfraFile[] = [
  { path: 'apps/web/src/lib/theme.ts', language: 'ts', source: themeSource },
  { path: 'apps/web/src/lib/theme.test.ts', language: 'ts', source: themeTestSource },
  {
    path: 'apps/web/src/features/settings/AppearanceSettings.tsx',
    language: 'tsx',
    source: appearanceSource,
  },
  {
    path: 'apps/web/src/features/settings/AppearanceSettings.test.tsx',
    language: 'tsx',
    source: appearanceTestSource,
  },
];

/**
 * Runs in `<head>`, before anything is drawn, so a page for someone in dark mode is never light
 * for a moment. It repeats the rule in `lib/theme.ts` in the fewest words, because it runs
 * before any module has loaded.
 */
export const THEME_INIT_SCRIPT = [
  '(function () {',
  '  try {',
  "    var stored = localStorage.getItem('rt_theme');",
  '    var dark =',
  "      stored === 'dark' ||",
  "      (stored !== 'light' &&",
  '        window.matchMedia &&',
  "        window.matchMedia('(prefers-color-scheme: dark)').matches);",
  "    document.documentElement.dataset.theme = dark ? 'dark' : 'light';",
  '  } catch (error) {',
  "    document.documentElement.dataset.theme = 'light';",
  '  }',
  '})();',
].join('\n');

/** The logo, which is a picture and so cannot read the page's colours: it has a dark twin. */
export const LOGO_COMPONENT = [
  "import logoUrl from '@roundtable/shared/assets/roundtable-logo.svg';",
  "import logoDarkUrl from '@roundtable/shared/assets/roundtable-logo-dark.svg';",
  '',
  "import { useResolvedTheme } from '../lib/theme';",
  '',
  'interface RoundTableLogoProps {',
  '  className?: string;',
  '}',
  '',
  "export function RoundTableLogo({ className = 'h-7 w-auto shrink-0' }: RoundTableLogoProps) {",
  '  const theme = useResolvedTheme();',
  '  return (',
  '    <img',
  "      src={theme === 'dark' ? logoDarkUrl : logoUrl}",
  '      alt="RoundTable"',
  '      className={className}',
  '      draggable={false}',
  '    />',
  '  );',
  '}',
].join('\n');

export const LOGO_EXPORT_KEY = './assets/roundtable-logo-dark.svg';
