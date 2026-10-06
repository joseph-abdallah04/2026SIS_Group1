import { type Role } from '../catalogue/types';
import { type Rgb, oklchToRgb, rgbToOklch } from '../colour/convert';
import { toHex } from '../colour/parse';
import { isRoleKey, type RoleKey } from './roles';
import { type Spec } from './spec';
import { type SlotKey } from './slots';

/**
 * The dark theme the app does not have yet, as a starting point to be judged and
 * changed. Nothing here is the app's: it is a guess at what the brand would do
 * in the dark, made by hand where a colour matters and by rule everywhere else.
 *
 * It is worked out per role, because one colour is asked to do opposite jobs.
 * Ink is the text on a page and the near-black of a tooltip; the mustard is a
 * text accent that has to stay bright and a button fill that has to go deep
 * enough for light text to read on it.
 */

/** `'original'` keeps what the app has. A function is given the alpha the colour is used at. */
export type DarkValue = string | ((alpha: number) => string);
export type RoleTable = Partial<Record<RoleKey | 'base', DarkValue>>;

const PAGE = '#14161b';
const SURFACE = '#1c1f26';
const RAISED = '#242831';
const SUNKEN = '#101216';
const HAIRLINE = '#383c47';
const INK = '#eceef3';
const INK_MUTED = '#a8adb9';
const INK_FAINT = '#868b97';
const SCRIM = '#07080b';

/** Used at a low opacity a colour is an overlay and wants to stay light; at a high one it is a surface. */
const overlay =
  (light: string, solid: string, upTo: number): DarkValue =>
  (alpha) =>
    alpha <= upTo ? light : solid;

export const CURATED: Readonly<Record<SlotKey, RoleTable>> = {
  // The page and what sits on it.
  'token:rt-secondary-wash': { base: PAGE },
  'token:rt-surface': { base: SURFACE, text: '#ffffff', border: SURFACE, image: PAGE },
  'token:rt-surface-alt': { base: RAISED },
  'token:rt-surface-sunken': { base: SUNKEN },
  'token:rt-tertiary': { base: HAIRLINE },
  'token:rt-primary-tint': { base: '#2b2619', border: '#7a6638' },
  'token:rt-cool-tint': { base: '#1e272c' },

  // Ink. A scrim or a tooltip is the dark one; a hover wash over a dark surface is a light one.
  'token:rt-ink': { base: INK, fill: overlay(INK, SCRIM, 0.22) },
  'token:rt-ink-muted': { base: INK_MUTED },
  'token:rt-ink-faint': { base: INK_FAINT },

  // Gold. Bright as text, a ring or a tint; deep as a solid fill so light text reads on it.
  'token:rt-secondary': { base: '#e0a33c', fill: overlay('#e0a33c', '#8a5c12', 0.4) },
  'token:rt-secondary-deep': {
    base: '#d2b98a',
    fill: overlay('#d2b98a', '#6e4c12', 0.3),
    border: '#c9a35a',
  },
  'token:rt-secondary-tint': { base: '#3b3118' },
  'token:rt-primary': { base: '#d9b25f', fill: '#5e4a1f' },
  'token:rt-primary-deep': { base: '#cdb98f', border: '#b49a64' },

  // The cool pair. Pale blue reads on either; the slate text has to lift.
  'token:rt-cool': { base: 'original' },
  // Slate lifts to read as text; as a background (an avatar) it must stay deep for white initials.
  'token:rt-cool-deep': { base: '#9cc0cc', fill: 'original', border: 'original' },

  // Tailwind.
  'tw:white': { base: '#ffffff', fill: overlay('#ffffff', SURFACE, 0.25) },
  'tw:black': { base: 'original', image: INK },
  'tw:red-50': { base: '#3b1c1f' },
  'tw:red-100': { base: '#4a2326' },
  'tw:red-200': { base: '#7a2f33' },
  'tw:red-300': { base: '#9b3b3f' },
  'tw:red-400': { base: 'original' },
  'tw:red-500': { base: 'original' },
  'tw:red-600': { base: '#ff7a7f', fill: 'original', border: 'original' },
  'tw:red-700': { base: '#ff9a9e', fill: 'original', border: 'original' },
};

/**
 * A rule for a colour nobody has chosen a dark value for. Light surfaces go to
 * dark ones, dark text goes to light, light borders go to dark, and anything in
 * the middle of the range, which reads on either, is left alone. Hue is kept.
 */
export function heuristicDark(original: Rgb, role: Role): Rgb {
  const { L, C, h } = rgbToOklch(original);
  switch (role) {
    case 'text':
      return L < 0.62 ? oklchToRgb({ L: 0.98 - L * 0.6, C, h }) : original;
    case 'border':
      return L > 0.6 ? oklchToRgb({ L: 0.52 - (L - 0.6) * 0.75, C: C * 0.8, h }) : original;
    case 'fill':
    case 'other':
      return L > 0.78 ? oklchToRgb({ L: 0.16 + (1 - L) * 0.6, C: C * 0.7, h }) : original;
    default:
      return original;
  }
}

const hexOf = (value: DarkValue, alpha: number): string =>
  typeof value === 'function' ? value(alpha) : value;

/**
 * What a slot is in the dark, for one role, before anyone has changed it.
 *
 * A hardcoded copy of a token follows that token, so it goes dark with it. A
 * shadow is left as it is: a soft shadow is already dark, and following ink
 * would turn it into a glow.
 */
export function darkSpec(
  slot: SlotKey,
  role: Role,
  alpha: number,
  original: Rgb | null,
  link: SlotKey | undefined,
): Spec {
  const table = CURATED[slot];
  const own = isRoleKey(role) ? table?.[role] : undefined;
  const chosen = own ?? table?.base;
  if (chosen !== undefined) {
    const value = hexOf(chosen, alpha);
    return value === 'original' ? { kind: 'original' } : { kind: 'custom', hex: value };
  }
  if (role === 'shadow' || !original) return { kind: 'original' };
  if (link) return { kind: 'link', slot: link };
  return { kind: 'custom', hex: toHex(heuristicDark(original, role)) };
}
