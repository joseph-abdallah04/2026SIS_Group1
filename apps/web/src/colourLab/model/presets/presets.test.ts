import { describe, expect, it } from 'vitest';

import { type Catalogue, type LiteralOccurrence } from '../../catalogue/types';
import { contrastRatio } from '../../colour/contrast';
import { type Rgb, rgbToOklch } from '../../colour/convert';
import { parseColour } from '../../colour/parse';
import { type Role } from '../../catalogue/types';
import { type ResolveInput, computeDefaultLinks, resolveSlot } from '../resolve';
import { type Scheme } from '../spec';
import { type SlotKey, hexSlotKey } from '../slots';
import { PAPER_SLOTS, PLATE_SLOT, buildPreset, remap } from './generate';
import { LOGO_PALETTES, PALETTES, TOKEN_NAMES } from './palettes';

const rgb = (value: string): Rgb => {
  const parsed = parseColour(value);
  if (!parsed) throw new Error(value);
  return { r: parsed.rgba.r, g: parsed.rgba.g, b: parsed.rgba.b };
};

/** The app's own brand colours, as `index.css` has them. */
const TOKENS: Record<string, string> = {
  primary: '#f1c881',
  'primary-deep': '#7a6a4c',
  'primary-tint': '#fdf4e5',
  secondary: '#e0a33c',
  'secondary-tint': '#f1c881',
  'secondary-wash': '#fdf4e5',
  'secondary-deep': '#7a6a4c',
  cool: '#8ca4ac',
  'cool-deep': '#4d6a74',
  'cool-tint': '#eef2f4',
  tertiary: '#cfcfcf',
  surface: '#ffffff',
  'surface-alt': '#f7f7f8',
  'surface-sunken': '#fafafa',
  ink: '#080c15',
  'ink-muted': '#5a5f68',
  'ink-faint': '#8a8f97',
};

const originals = new Map<SlotKey, Rgb>([
  ...Object.entries(TOKENS).map(
    ([name, value]) => [`token:rt-${name}`, rgb(value)] as [SlotKey, Rgb],
  ),
  ['tw:white', rgb('#ffffff')],
]);

const literal = (raw: string, role: Role, file = 'apps/web/src/index.css'): LiteralOccurrence => ({
  slot: hexSlotKey(rgb(raw)),
  file,
  line: 1,
  col: 1,
  raw,
  alpha: 1,
  role,
  context: '',
  snippet: '',
  exportOnly: false,
});

const catalogue: Catalogue = {
  generatedAt: 0,
  git: { sha: null, branch: null, mergeBase: null },
  tokens: [],
  literals: [
    literal('#f7f4ee', 'fill'), // the landing page's cream
    literal('#f4e3ad', 'fill'), // the waiting room's gold button
    literal('#5c4e2e', 'text'), // and its brown text
    literal('#4d6a74', 'fill'), // a copy of cool-deep: follows it
    literal('#fdf4e5', 'fill'), // yellow sticky paper, also a copy of the wash
    literal('#f9eef2', 'fill'), // pink sticky paper
    literal('#b42318', 'text'), // an error red
    literal('#ffffff', 'fill'),
    literal('#c6d2d7', 'border'), // a slate hairline
  ],
  classes: [],
  refs: [],
};

const context = {
  catalogue,
  originals,
  defaultLinks: computeDefaultLinks(originals, new Set(catalogue.literals.map((l) => l.slot))),
};

const inputFor = (palette: (typeof PALETTES)[number], scheme: Scheme): ResolveInput => ({
  scheme,
  originals,
  defaultLinks: context.defaultLinks,
  edits: buildPreset(palette, context)[scheme],
});

const colour = (input: ResolveInput, token: string, role: Role = 'other', alpha = 1): Rgb => {
  const value = resolveSlot(`token:rt-${token}`, role, input, alpha);
  if (!value) throw new Error(token);
  return value;
};
const white: Rgb = { r: 255, g: 255, b: 255 };

const ALL = [...PALETTES, ...LOGO_PALETTES];

describe.each(ALL.map((p) => [p.name, p] as const))('%s', (_, palette) => {
  describe('light', () => {
    const input = inputFor(palette, 'light');
    const page = colour(input, 'secondary-wash', 'fill');
    const surface = colour(input, 'surface', 'fill');
    const rail = colour(input, 'surface-alt', 'fill');
    const pairs: [string, Rgb, Rgb, number][] = [
      ['ink on the page', colour(input, 'ink', 'text'), page, 7],
      ['ink on a card', colour(input, 'ink', 'text'), surface, 7],
      ['ink on a rail', colour(input, 'ink', 'text'), rail, 7],
      ['muted text on a rail', colour(input, 'ink-muted', 'text'), rail, 4.5],
      ['faint text on a rail', colour(input, 'ink-faint', 'text'), rail, 3],
      ['muted text on a card', colour(input, 'ink-muted', 'text'), surface, 4.5],
      ['muted text on the page', colour(input, 'ink-muted', 'text'), page, 4.5],
      ['faint text on a card', colour(input, 'ink-faint', 'text'), surface, 3],
      ['ink on the button', colour(input, 'ink', 'text'), colour(input, 'secondary', 'fill'), 4.5],
      ['white on the button’s hover', white, colour(input, 'secondary-deep', 'fill'), 4.5],
      [
        'ink on an active tile',
        colour(input, 'ink', 'text'),
        colour(input, 'primary', 'fill'),
        4.5,
      ],
      ['accent text on a card', colour(input, 'secondary', 'text'), surface, 4.5],
      ['label text on a card', colour(input, 'secondary-deep', 'text'), surface, 4.5],
      ['label text on the page', colour(input, 'secondary-deep', 'text'), page, 4.5],
      ['gold-brown text on a card', colour(input, 'primary-deep', 'text'), surface, 4.5],
      ['link text on a card', colour(input, 'cool-deep', 'text'), surface, 4.5],
      ['white initials on an avatar', white, colour(input, 'cool-deep', 'fill'), 4.5],
      ['a hairline on a card', colour(input, 'tertiary', 'border'), surface, 1.25],
    ];
    it.each(pairs)('%s reads', (_name, fore, back, least) => {
      expect(contrastRatio(fore, back)).toBeGreaterThanOrEqual(least);
    });
  });

  describe('dark', () => {
    const input = inputFor(palette, 'dark');
    const page = colour(input, 'secondary-wash', 'fill');
    const surface = colour(input, 'surface', 'fill');
    const ink = colour(input, 'ink', 'text');
    const pairs: [string, Rgb, Rgb, number][] = [
      ['ink on the page', ink, page, 10],
      ['ink on a card', ink, surface, 10],
      ['ink on a rail', ink, colour(input, 'surface-alt', 'fill'), 7],
      ['muted text on a card', colour(input, 'ink-muted', 'text'), surface, 4.5],
      ['faint text on a card', colour(input, 'ink-faint', 'text'), surface, 3],
      ['ink on the button', ink, colour(input, 'secondary', 'fill'), 4.5],
      ['white on the button’s hover', white, colour(input, 'secondary-deep', 'fill'), 4.5],
      ['ink on an active tile', ink, colour(input, 'primary', 'fill'), 4.5],
      ['accent text on a card', colour(input, 'secondary', 'text'), surface, 4.5],
      ['label text on a card', colour(input, 'secondary-deep', 'text'), surface, 4.5],
      ['gold-brown text on a card', colour(input, 'primary-deep', 'text'), surface, 4.5],
      ['link text on a card', colour(input, 'cool-deep', 'text'), surface, 4.5],
      ['white initials on an avatar', white, colour(input, 'cool-deep', 'fill'), 4.5],
      ['a hairline on a card', colour(input, 'tertiary', 'border'), surface, 1.25],
    ];
    it.each(pairs)('%s reads', (_name, fore, back, least) => {
      expect(contrastRatio(fore, back)).toBeGreaterThanOrEqual(least);
    });

    it('keeps a thin ink wash light and makes a solid ink fill a dark scrim', () => {
      expect(rgbToOklch(colour(input, 'ink', 'fill', 0.08)).L).toBeGreaterThan(0.85);
      expect(rgbToOklch(colour(input, 'ink', 'fill', 0.6)).L).toBeLessThan(0.2);
    });

    it('keeps a thin button tint bright and makes the solid button deep', () => {
      const tint = colour(input, 'secondary', 'fill', 0.15);
      const solid = colour(input, 'secondary', 'fill', 1);
      expect(rgbToOklch(tint).L).toBeGreaterThan(rgbToOklch(solid).L + 0.2);
    });
  });

  it.skipIf(palette.kind === 'logo')(
    'is pastel: its button and chrome are light and soft in the light theme',
    () => {
      const input = inputFor(palette, 'light');
      for (const token of ['secondary', 'primary', 'cool', 'primary-tint', 'secondary-wash']) {
        const { L, C } = rgbToOklch(colour(input, token, 'fill'));
        expect(L, token).toBeGreaterThan(0.75);
        expect(C, token).toBeLessThan(0.13);
      }
    },
  );
});

describe('buildPreset', () => {
  const palette = PALETTES.find((p) => p.id === 'lavender-haze')!;
  const edits = buildPreset(palette, context);

  it('sets every brand colour in both themes', () => {
    for (const name of TOKEN_NAMES) {
      expect(edits.light[`token:rt-${name}`]?.base?.kind, name).toBe('custom');
      expect(edits.dark[`token:rt-${name}`]?.base?.kind, name).toBe('custom');
    }
    expect(edits.dark['tw:white']?.roles?.fill).toMatchObject({
      kind: 'custom',
      wash: { upTo: 0.25 },
    });
  });

  it('leaves a hardcoded copy of a brand colour following it', () => {
    expect(edits.light['hex:#4d6a74']).toBeUndefined();
  });

  it('gives the sticky papers the palette’s own, so they change and stay apart', () => {
    expect(edits.light[PAPER_SLOTS.yellow]?.base).toEqual({
      kind: 'custom',
      hex: palette.paper.yellow,
    });
    expect(edits.light[PAPER_SLOTS.pink]?.base).toEqual({
      kind: 'custom',
      hex: palette.paper.pink,
    });
    const papers = Object.values(palette.paper);
    expect(new Set(papers).size).toBe(4);
  });

  it('moves the warm hardcoded colours into the palette’s hues, keeping their lightness', () => {
    const cream = edits.light['hex:#f7f4ee']?.base;
    expect(cream?.kind).toBe('custom');
    const was = rgbToOklch(rgb('#f7f4ee'));
    const now = rgbToOklch(rgb(cream?.kind === 'custom' ? cream.hex : ''));
    expect(Math.abs(now.L - was.L)).toBeLessThan(0.01);
    const gold = edits.light['hex:#f4e3ad']?.base;
    expect(gold?.kind === 'custom' && rgbToOklch(rgb(gold.hex)).h).toBeGreaterThan(250);
  });

  it('gives a moved colour a dark value for each role it is used in', () => {
    expect(edits.dark['hex:#5c4e2e']?.base?.kind).toBe('custom');
  });

  it('leaves error reds, pure white and pure black alone', () => {
    expect(edits.light['hex:#b42318']).toBeUndefined();
    expect(remap(rgb('#ffffff'), palette)).toBeNull();
    expect(remap(rgb('#000000'), palette)).toBeNull();
    expect(remap(rgb('#ff6b5e'), palette)).toBeNull();
  });

  it('gives the same edits every time', () => {
    expect(buildPreset(palette, context)).toEqual(edits);
  });
});

describe('the palettes', () => {
  it('have distinct ids and names', () => {
    expect(new Set(ALL.map((p) => p.id)).size).toBe(ALL.length);
    expect(new Set(ALL.map((p) => p.name)).size).toBe(ALL.length);
  });

  it('include one with the logo’s colours as they are', () => {
    const logo = buildPreset(LOGO_PALETTES[0]!, context).light;
    expect(logo['token:rt-secondary']?.base).toEqual({ kind: 'custom', hex: '#e0a33c' });
    expect(logo['token:rt-secondary-wash']?.base).toEqual({ kind: 'custom', hex: '#8ca4ac' });
    expect(logo['token:rt-surface']?.base).toEqual({ kind: 'custom', hex: '#ffffff' });
    expect(logo['token:rt-tertiary']?.base).toEqual({ kind: 'custom', hex: '#cfcfcf' });
    expect(logo['token:rt-ink']?.base).toEqual({ kind: 'custom', hex: '#000000' });
    expect(LOGO_PALETTES.every((p) => p.kind === 'logo')).toBe(true);
  });

  it('keep the plate behind a drawing light where the rails are not, and let it follow them elsewhere', () => {
    const withPlate = {
      ...context,
      catalogue: { ...catalogue, literals: [literal('#f7f7f8', 'fill')] },
    };
    for (const palette of LOGO_PALETTES) {
      const plate = buildPreset(palette, withPlate).light[PLATE_SLOT]?.base;
      expect(
        plate?.kind === 'custom' && rgbToOklch(rgb(plate.hex)).L,
        palette.name,
      ).toBeGreaterThan(0.97);
    }
    const lavender = PALETTES.find((p) => p.id === 'lavender-haze')!;
    expect(buildPreset(lavender, withPlate).light[PLATE_SLOT]).toBeUndefined();
  });

  it('include some built around one colour and some that play with several', () => {
    expect(PALETTES.some((p) => p.kind === 'single')).toBe(true);
    expect(PALETTES.some((p) => p.kind === 'playful')).toBe(true);
  });
});
