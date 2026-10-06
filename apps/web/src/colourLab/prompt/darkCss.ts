import { ISLAND_SELECTORS } from '../model/islands';

/** One custom property with its light value and its dark one. */
export interface DarkProperty {
  name: string;
  light: string;
  dark: string;
}

export interface DarkGroups {
  /** Brand and palette colours that are another colour in the dark. */
  colours: DarkProperty[];
  /** Colours set apart by role. */
  roles: DarkProperty[];
  /** Hardcoded colours that became variables. */
  variables: DarkProperty[];
}

const declaration = (name: string, value: string): string => `  ${name}: ${value};`;

/** The selector list for the content that stays light, one selector to a line. */
export function islandSelectorList(): string {
  return ISLAND_SELECTORS.map((selector) => `  ${selector}`).join(',\n');
}

/**
 * The CSS that makes a dark theme, to be written into the app's stylesheet.
 *
 * Three blocks. The first gives the hardcoded colours their light values, which is what they
 * are in the light theme. The second is the dark theme: the root asks for dark native controls
 * and sets each colour that differs. The third is the content that stays light, like paper on a
 * dark desk: it takes the light values back, asks for light native controls, and sets its own
 * text colour, since text is inherited as a value and would otherwise arrive pale.
 *
 * It is the same CSS the lab applies to the page it is editing, so what was seen there is what
 * is written here.
 */
export function darkCss(groups: DarkGroups): string {
  const all = [...groups.colours, ...groups.roles, ...groups.variables];
  const parts: string[] = [];

  if (groups.variables.length > 0) {
    parts.push(
      '/* The light values of hardcoded colours that are different in the dark theme. */',
      ':root {',
      ...groups.variables.map((p) => declaration(p.name, p.light)),
      '}',
      '',
    );
  }

  parts.push(":root[data-theme='dark'] {", '  color-scheme: dark;');
  if (groups.colours.length > 0) {
    parts.push(
      '  /* Brand and palette colours */',
      ...groups.colours.map((p) => declaration(p.name, p.dark)),
    );
  }
  if (groups.roles.length > 0) {
    parts.push(
      '  /* Colours set apart by role */',
      ...groups.roles.map((p) => declaration(p.name, p.dark)),
    );
  }
  if (groups.variables.length > 0) {
    parts.push(
      '  /* Hardcoded colours */',
      ...groups.variables.map((p) => declaration(p.name, p.dark)),
    );
  }
  parts.push(
    '}',
    '',
    '/* Content that stays light, like paper on a dark desk: it gets the light values back. */',
    ":root[data-theme='dark'] :where(",
    islandSelectorList(),
    ') {',
    '  color-scheme: light;',
    '  color: var(--color-rt-ink);',
    ...all.map((p) => declaration(p.name, p.light)),
    '}',
  );
  return parts.join('\n');
}
