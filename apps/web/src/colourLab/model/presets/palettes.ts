import { type Oklch, type Rgb, oklchToRgb, rgbToOklch } from '../../colour/convert';
import { toHex } from '../../colour/parse';

/**
 * The palettes the lab recommends, all pastel, each with a light and a dark theme.
 *
 * A palette is a few decisions (which hues, how much colour, how warm the greys are) and the
 * colours are worked out from them on two fixed ladders, one per theme. The ladders were tuned so
 * every palette reads well: near-black ink, a soft pastel button with dark text on it, and deep
 * versions of each hue for text, which pass AA on the page. A palette therefore cannot drift into
 * a pale colour that cannot be read, and two palettes differ in their hues, not in their care.
 */

export type TokenName =
  | 'primary'
  | 'primary-deep'
  | 'primary-tint'
  | 'secondary'
  | 'secondary-tint'
  | 'secondary-wash'
  | 'secondary-deep'
  | 'cool'
  | 'cool-deep'
  | 'cool-tint'
  | 'tertiary'
  | 'surface'
  | 'surface-alt'
  | 'surface-sunken'
  | 'ink'
  | 'ink-muted'
  | 'ink-faint';

export const TOKEN_NAMES: readonly TokenName[] = [
  'primary',
  'primary-deep',
  'primary-tint',
  'secondary',
  'secondary-tint',
  'secondary-wash',
  'secondary-deep',
  'cool',
  'cool-deep',
  'cool-tint',
  'tertiary',
  'surface',
  'surface-alt',
  'surface-sunken',
  'ink',
  'ink-muted',
  'ink-faint',
];

/** A colour by role. A `wash` is the colour to use instead when the fill is thin, at or below `upTo`. */
export interface RoleColours {
  base: string;
  text?: string;
  fill?: string;
  border?: string;
  wash?: { upTo: number; hex: string };
}

export type ThemeColours = Record<TokenName | 'white', RoleColours>;

export interface Palette {
  id: string;
  name: string;
  /** One line on what it is for. */
  mood: string;
  kind: 'baseline' | 'single' | 'playful' | 'logo';
  /** OKLCH hues, in degrees. */
  hues: {
    /** The greys and the page are tinted towards this. */
    neutral: number;
    /** Chrome: active tiles, rails, focus outlines. */
    primary: number;
    /** The button, accents, links. */
    secondary: number;
    /** Live dots, vote rings, links in notes. */
    cool: number;
  };
  /** How much colour the accents carry: 1 is the ladder's own. */
  chroma: number;
  /** How much the greys and the page lean towards the neutral hue: 1 is the ladder's own. */
  tint: number;
  /** The four sticky-note papers, kept apart so a person can still tell them apart. */
  paper: { yellow: string; pink: string; blue: string; green: string };
  /**
   * Colours set by hand, over what the ladders make. For a palette taken from something that
   * already has its colours, like the logo, rather than from a few hues.
   */
  light?: Partial<ThemeColours>;
  dark?: Partial<ThemeColours>;
  /**
   * The plate behind a drawing or a diagram on a card. It is a copy of the rail colour, and
   * follows it, unless a palette whose rails are not light enough to draw on sets its own.
   */
  plate?: string;
}

/** The OKLCH colour, with its colourfulness reduced until it fits in sRGB without clipping. */
export function fit({ L, C, h }: Oklch): Rgb {
  let low = 0;
  let high = C;
  let best = oklchToRgb({ L, C: 0, h });
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    const rgb = oklchToRgb({ L, C: mid, h });
    const back = rgbToOklch(rgb);
    if (Math.abs(back.L - L) < 0.004 && Math.abs(back.C - mid) < 0.006) {
      best = rgb;
      low = mid;
    } else high = mid;
  }
  const full = oklchToRgb({ L, C, h });
  const back = rgbToOklch(full);
  return Math.abs(back.L - L) < 0.004 && Math.abs(back.C - C) < 0.006 ? full : best;
}

const hex = (L: number, C: number, h: number): string => {
  const rgb = fit({ L, C: Math.max(0, C), h });
  return toHex({ r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) });
};

/** The light theme of a palette. */
export function lightColours(p: Palette): ThemeColours {
  const { neutral: n, primary: pr, secondary: s, cool: c } = p.hues;
  const k = p.chroma;
  const t = p.tint;
  return {
    'secondary-wash': { base: hex(0.972, 0.016 * t, n) },
    surface: { base: hex(0.997, 0.003 * t, n) },
    'surface-alt': { base: hex(0.972, 0.009 * t, n) },
    'surface-sunken': { base: hex(0.982, 0.006 * t, n) },
    tertiary: { base: hex(0.86, 0.02 * t, n) },
    ink: { base: hex(0.2, 0.025 * t, n) },
    'ink-muted': { base: hex(0.47, 0.025 * t, n) },
    'ink-faint': { base: hex(0.6, 0.02 * t, n) },
    primary: { base: hex(0.86, 0.07 * k, pr), text: hex(0.45, 0.1 * k, pr) },
    'primary-tint': { base: hex(0.955, 0.025 * k, pr) },
    'primary-deep': { base: hex(0.42, 0.075 * k, pr) },
    secondary: { base: hex(0.8, 0.1 * k, s), text: hex(0.47, 0.12 * k, s) },
    'secondary-tint': { base: hex(0.88, 0.06 * k, s) },
    'secondary-deep': { base: hex(0.4, 0.085 * k, s) },
    cool: { base: hex(0.79, 0.06 * k, c) },
    'cool-deep': { base: hex(0.45, 0.07 * k, c) },
    'cool-tint': { base: hex(0.96, 0.018 * k, c) },
    white: { base: '#ffffff' },
    ...p.light,
  };
}

/** The dark theme of a palette: deep greys leaning to its hue, its pastels kept as accents. */
export function darkColours(p: Palette): ThemeColours {
  const { neutral: n, primary: pr, secondary: s, cool: c } = p.hues;
  const k = p.chroma;
  const t = p.tint;
  const surface = hex(0.235, 0.018 * t, n);
  const ink = hex(0.95, 0.012 * t, n);
  return {
    'secondary-wash': { base: hex(0.2, 0.016 * t, n) },
    surface: { base: surface, text: '#ffffff', border: surface, fill: surface },
    'surface-alt': { base: hex(0.27, 0.02 * t, n) },
    'surface-sunken': { base: hex(0.17, 0.014 * t, n) },
    tertiary: { base: hex(0.37, 0.022 * t, n) },
    // Ink is the page text, and as a solid fill the near-black of a scrim; as a thin wash it is light.
    ink: { base: ink, fill: hex(0.12, 0.01 * t, n), wash: { upTo: 0.22, hex: ink } },
    'ink-muted': { base: hex(0.78, 0.02 * t, n) },
    'ink-faint': { base: hex(0.66, 0.02 * t, n) },
    primary: { base: hex(0.83, 0.075 * k, pr), fill: hex(0.42, 0.07 * k, pr) },
    'primary-tint': { base: hex(0.29, 0.03 * k, pr), border: hex(0.52, 0.06 * k, pr) },
    'primary-deep': { base: hex(0.85, 0.06 * k, pr), border: hex(0.68, 0.075 * k, pr) },
    // The button: bright as a tint or a ring, deep enough as a solid fill for light text.
    secondary: {
      base: hex(0.81, 0.1 * k, s),
      fill: hex(0.45, 0.095 * k, s),
      wash: { upTo: 0.4, hex: hex(0.81, 0.1 * k, s) },
    },
    'secondary-tint': { base: hex(0.33, 0.05 * k, s) },
    'secondary-deep': {
      base: hex(0.86, 0.06 * k, s),
      fill: hex(0.38, 0.08 * k, s),
      border: hex(0.71, 0.08 * k, s),
      wash: { upTo: 0.3, hex: hex(0.86, 0.06 * k, s) },
    },
    cool: { base: hex(0.78, 0.065 * k, c) },
    // As text a link has to lift; as a background (an avatar) it stays deep for white initials.
    'cool-deep': {
      base: hex(0.83, 0.055 * k, c),
      fill: hex(0.45, 0.07 * k, c),
      border: hex(0.45, 0.07 * k, c),
    },
    'cool-tint': { base: hex(0.28, 0.025 * k, c) },
    white: { base: '#ffffff', fill: surface, wash: { upTo: 0.25, hex: '#ffffff' } },
    ...p.dark,
  };
}

/** The app as it is: no change at all, to come back to. */
export const BASELINE_ID = 'roundtable';

export const PALETTES: readonly Palette[] = [
  {
    id: 'peach-sorbet',
    name: 'Peach Sorbet',
    mood: 'One warm colour: apricot washes, peach buttons, cocoa accents. Friendly, close to today.',
    kind: 'single',
    hues: { neutral: 60, primary: 62, secondary: 52, cool: 40 },
    chroma: 1,
    tint: 1.1,
    paper: { yellow: '#fbf1d8', pink: '#fae8e6', blue: '#e9f0f2', green: '#ebf2e8' },
  },
  {
    id: 'lavender-haze',
    name: 'Lavender Haze',
    mood: 'One calm colour: lilac washes, periwinkle buttons, plum accents. Quiet and focused.',
    kind: 'single',
    hues: { neutral: 295, primary: 300, secondary: 285, cool: 270 },
    chroma: 1,
    tint: 1.2,
    paper: { yellow: '#f8f2dc', pink: '#f6e9f3', blue: '#e9eef8', green: '#e8f2ee' },
  },
  {
    id: 'sage-garden',
    name: 'Sage Garden',
    mood: 'One fresh colour: sage and mint washes, eucalyptus accents. Light and unhurried.',
    kind: 'single',
    hues: { neutral: 150, primary: 155, secondary: 160, cool: 185 },
    chroma: 0.9,
    tint: 1.1,
    paper: { yellow: '#f6f2da', pink: '#f6ebeb', blue: '#e7eff1', green: '#e5f1e6' },
  },
  {
    id: 'powder-blue',
    name: 'Powder Blue',
    mood: 'One clear colour: sky washes, cornflower buttons, navy accents. Calm and trustworthy.',
    kind: 'single',
    hues: { neutral: 245, primary: 240, secondary: 255, cool: 220 },
    chroma: 1,
    tint: 1.1,
    paper: { yellow: '#f7f2dd', pink: '#f6eaef', blue: '#e6eef8', green: '#e8f2ec' },
  },
  {
    id: 'macaron',
    name: 'Macaron',
    mood: 'Playful: lilac buttons, peach chrome, mint for what is live, on a cream page.',
    kind: 'playful',
    hues: { neutral: 75, primary: 55, secondary: 305, cool: 165 },
    chroma: 1.05,
    tint: 0.9,
    paper: { yellow: '#fcf2d6', pink: '#f9e7ef', blue: '#e7eefa', green: '#e4f4ea' },
  },
  {
    id: 'sherbet-pop',
    name: 'Sherbet Pop',
    mood: 'Playful and bright: coral-pink buttons, butter-yellow chrome, aqua for what is live.',
    kind: 'playful',
    hues: { neutral: 340, primary: 95, secondary: 15, cool: 200 },
    chroma: 1.15,
    tint: 0.8,
    paper: { yellow: '#fdf3cf', pink: '#fde6ea', blue: '#e2f2f6', green: '#e6f5e3' },
  },
];

/** The logo's own colours: a slate table, a white ring, black seats and one mustard seat. */
const LOGO = { slate: '#8ca4ac', mustard: '#e0a33c', grey: '#cfcfcf', black: '#000000' };

/** The sticky papers as the app ships them, which already sit well beside the logo. */
const APP_PAPER = { yellow: '#fdf4e5', pink: '#f9eef2', blue: '#eef2f4', green: '#eef4f0' };

/**
 * Palettes taken from the logo rather than built from hues: the logo's colours as they are, and
 * two steps away from them. Their light themes are set by hand; their dark themes come from the
 * ladder, in the logo's hues.
 */
export const LOGO_PALETTES: readonly Palette[] = [
  {
    id: 'logo',
    name: 'Logo',
    mood: 'The logo as it is: a slate desk and bars, white sheets and cards, black ink, mustard buttons.',
    kind: 'logo',
    hues: { neutral: 220, primary: 77, secondary: 77, cool: 220 },
    chroma: 1.3,
    tint: 1.6,
    paper: APP_PAPER,
    plate: '#f7f7f8',
    light: {
      'secondary-wash': { base: LOGO.slate },
      surface: { base: '#ffffff' },
      'surface-alt': { base: LOGO.slate },
      'surface-sunken': { base: LOGO.slate },
      tertiary: { base: LOGO.grey },
      ink: { base: LOGO.black },
      'ink-muted': { base: '#233035' },
      'ink-faint': { base: '#3c4a4f' },
      primary: { base: LOGO.mustard, text: '#81520a' },
      'primary-tint': { base: '#fdf3df' },
      'primary-deep': { base: '#3c2a0e' },
      secondary: { base: LOGO.mustard, text: '#81520a' },
      'secondary-tint': { base: '#f1c881' },
      'secondary-deep': { base: '#3c2a0e', fill: '#7a5116' },
      // Deeper than the slate, so what is live still shows on the slate rails.
      cool: { base: '#4d6a74' },
      'cool-deep': { base: '#3e5a64' },
      'cool-tint': { base: '#eef2f4' },
    },
    dark: { cool: { base: LOGO.slate } },
  },
  {
    id: 'logo-mist',
    name: 'Logo Mist',
    mood: 'The logo in pastel: a pale slate mist, butter-mustard buttons, slate-black ink.',
    kind: 'logo',
    hues: { neutral: 220, primary: 80, secondary: 80, cool: 220 },
    chroma: 1,
    tint: 1.3,
    paper: APP_PAPER,
    plate: '#f6fafb',
    light: {
      'secondary-wash': { base: '#ddebef' },
      surface: { base: '#ffffff' },
      'surface-alt': { base: '#d0e1e7' },
      'surface-sunken': { base: '#e6f1f4' },
      tertiary: { base: '#c9d3d6' },
      ink: { base: '#0b181c' },
      'ink-muted': { base: '#415359' },
      'ink-faint': { base: '#617278' },
      primary: { base: '#efd4a3', text: '#7d541a' },
      'primary-tint': { base: '#fbf3e1' },
      'primary-deep': { base: '#634b28' },
      secondary: { base: '#edc47d', text: '#7d541a' },
      'secondary-tint': { base: '#f2dbb1' },
      'secondary-deep': { base: '#604825' },
      cool: { base: '#a0bdc7' },
      'cool-deep': { base: '#41606a' },
      'cool-tint': { base: '#ebf3f6' },
    },
  },
  {
    id: 'head-seat',
    name: 'Head Seat',
    mood: 'The logo turned round: the mustard seat becomes a warm room, and the slate the buttons.',
    kind: 'logo',
    hues: { neutral: 80, primary: 220, secondary: 220, cool: 77 },
    chroma: 0.6,
    tint: 1.2,
    paper: APP_PAPER,
    plate: '#fdf9f2',
    light: {
      'secondary-wash': { base: '#f7e2bc' },
      surface: { base: '#ffffff' },
      'surface-alt': { base: '#f3d6a7' },
      'surface-sunken': { base: '#faedd5' },
      tertiary: { base: '#d8ccb8' },
      ink: { base: '#171008' },
      'ink-muted': { base: '#524536' },
      'ink-faint': { base: '#6f6151' },
      primary: { base: '#a3c0ca', text: '#3c5b65' },
      'primary-tint': { base: '#e6f1f4' },
      'primary-deep': { base: '#2e4d57' },
      secondary: { base: LOGO.slate, text: '#3c5b65' },
      'secondary-tint': { base: '#c0d5dc' },
      'secondary-deep': { base: '#294751' },
      cool: { base: LOGO.mustard },
      'cool-deep': { base: '#714d1d' },
      'cool-tint': { base: '#fbf1dc' },
    },
    dark: { cool: { base: LOGO.mustard } },
  },
];
