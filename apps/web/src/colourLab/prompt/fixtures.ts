import {
  type Catalogue,
  type ClassUse,
  type LiteralOccurrence,
  type TokenDef,
  type VarRef,
} from '../catalogue/types';
import { type Rgb } from '../colour/convert';
import { parseColour } from '../colour/parse';
import { computeDefaultLinks } from '../model/resolve';
import { type SlotKey, hexSlotKey } from '../model/slots';
import { type PromptInputs } from './inputs';
import { rgbOfRaw } from './values';

/** A small app in the shape of the real one, for trying the prompts on. Not a copy of any file. */

const rgb = (value: string): Rgb => {
  const parsed = parseColour(value);
  if (!parsed) throw new Error(`bad fixture colour ${value}`);
  return { r: parsed.rgba.r, g: parsed.rgba.g, b: parsed.rgba.b };
};

const token = (name: string, value: string, line: number): TokenDef => ({
  slot: `token:${name}`,
  name: `--color-${name}`,
  value,
  file: 'apps/web/src/index.css',
  line,
  col: 3 + `--color-${name}: `.length,
  snippet: `--color-${name}: ${value};`,
});

export const TOKENS: TokenDef[] = [
  token('rt-secondary', '#e0a33c', 10),
  token('rt-secondary-deep', '#7a6a4c', 11),
  token('rt-surface', '#ffffff', 12),
  token('rt-ink', '#080c15', 13),
  token('rt-tertiary', '#cfcfcf', 14),
];

const literal = (
  file: string,
  line: number,
  col: number,
  raw: string,
  role: LiteralOccurrence['role'],
  context: string,
  snippet: string,
  over: Partial<LiteralOccurrence> = {},
): LiteralOccurrence => {
  const read = rgbOfRaw(raw);
  if (!read) throw new Error(`bad fixture colour ${raw}`);
  const alpha = read.alpha;
  return {
    slot: hexSlotKey(read.rgb),
    file,
    line,
    col,
    raw,
    alpha,
    role,
    context,
    snippet,
    exportOnly: false,
    ...over,
  };
};

export const LITERALS: LiteralOccurrence[] = [
  literal(
    'apps/web/src/index.css',
    20,
    25,
    'rgba(8, 12, 21, 0.12)',
    'shadow',
    '.rt-card',
    'box-shadow: 0 8px 24px rgba(8, 12, 21, 0.12);',
  ),
  literal('apps/web/src/index.css', 21, 14, '#ffffff', 'fill', '.rt-card', 'background: #ffffff;'),
  literal(
    'apps/web/src/index.css',
    30,
    38,
    '#e0a33c',
    'border',
    '.rt-ring',
    'box-shadow: 0 1px 2px rgba(8,12,21,0.1), 0 0 0 3px #e0a33c;',
  ),
  literal(
    'apps/web/src/features/pinboard/pinboardTokens.ts',
    12,
    26,
    '#080C15',
    'text',
    'CARD_INK',
    "export const CARD_INK = '#080C15';",
  ),
  literal(
    'apps/web/src/features/pinboard/pinboardTokens.ts',
    14,
    20,
    '#FDF4E5',
    'fill',
    'STICKY_PAPER · yellow',
    "yellow: { bg: '#FDF4E5' },",
  ),
  literal(
    'apps/web/src/features/marketing/cta.ts',
    4,
    60,
    'rgba(8,12,21,0.14)',
    'shadow',
    'class shadow-[…]',
    'export const cta = `bg-rt-secondary shadow-[0_8px_20px_rgba(8,12,21,0.14)]`;',
  ),
  literal(
    'apps/web/src/features/marketing/LandingNav.tsx',
    34,
    66,
    '#f7f4ee',
    'fill',
    'class bg-[…]',
    '<header className="sticky top-0 bg-[#f7f4ee]/85 backdrop-blur">',
    { colourClass: true },
  ),
  literal(
    'apps/server/src/modules/summary/pdf.ts',
    12,
    14,
    '#080c15',
    'text',
    'INK',
    "const INK = '#080c15';",
    { exportOnly: true },
  ),
  literal(
    'packages/shared/src/assets/roundtable-logo.svg',
    3,
    16,
    'black',
    'image',
    'fill',
    '<path fill="black" d="M0 0"/>',
  ),
];

const use = (
  slot: SlotKey,
  file: string,
  role: ClassUse['role'],
  alpha: number,
  count: number,
): ClassUse => ({
  slot,
  file,
  role,
  alpha,
  count,
});

export const CLASSES: ClassUse[] = [
  use('token:rt-secondary', 'apps/web/src/features/a/A.tsx', 'fill', 1, 3),
  use('token:rt-secondary', 'apps/web/src/features/a/A.tsx', 'fill', 0.1, 2),
  use('token:rt-secondary', 'apps/web/src/features/a/A.tsx', 'text', 1, 1),
  use('token:rt-secondary', 'apps/web/src/features/b/B.tsx', 'fill', 1, 4),
  use('token:rt-secondary', 'apps/web/src/features/b/B.tsx', 'border', 1, 5),
  use('token:rt-ink', 'apps/web/src/features/a/A.tsx', 'text', 1, 6),
  use('token:rt-ink', 'apps/web/src/features/b/B.tsx', 'fill', 0.1, 1),
  use('token:rt-ink', 'apps/web/src/features/b/B.tsx', 'fill', 0.6, 2),
  use('token:rt-surface', 'apps/web/src/features/a/A.tsx', 'fill', 1, 4),
  use('tw:red-600', 'apps/web/src/features/a/A.tsx', 'text', 1, 2),
  use('tw:white', 'apps/web/src/features/b/B.tsx', 'fill', 1, 2),
  use('tw:white', 'apps/web/src/features/b/B.tsx', 'text', 1, 3),
];

const ref = (
  slot: SlotKey,
  file: string,
  line: number,
  col: number,
  role: VarRef['role'],
  context: string,
  snippet: string,
  alpha = 1,
): VarRef => ({
  slot,
  file,
  line,
  col,
  raw: `var(--color-${slot.slice(slot.indexOf(':') + 1)})`,
  name: `--color-${slot.slice(slot.indexOf(':') + 1)}`,
  alpha,
  role,
  context,
  snippet,
});

export const REFS: VarRef[] = [
  ref(
    'token:rt-secondary',
    'apps/web/src/index.css',
    40,
    15,
    'fill',
    '.rt-chip',
    'background: var(--color-rt-secondary);',
  ),
  ref(
    'token:rt-secondary',
    'apps/web/src/index.css',
    41,
    20,
    'border',
    '.rt-chip',
    'border-color: var(--color-rt-secondary);',
  ),
  ref(
    'token:rt-ink',
    'apps/web/src/index.css',
    42,
    10,
    'text',
    '.rt-chip',
    'color: var(--color-rt-ink);',
  ),
];

export const CATALOGUE: Catalogue = {
  generatedAt: 0,
  git: {
    sha: 'f1d9446abcdef0123456789abcdef0123456789a',
    branch: 'colour-testing',
    mergeBase: '28bda6dabcdef0123456789abcdef0123456789a',
  },
  tokens: TOKENS,
  literals: LITERALS,
  classes: CLASSES,
  refs: REFS,
};

const originals = new Map<SlotKey, Rgb>([
  ['token:rt-secondary', rgb('#e0a33c')],
  ['token:rt-secondary-deep', rgb('#7a6a4c')],
  ['token:rt-surface', rgb('#ffffff')],
  ['token:rt-ink', rgb('#080c15')],
  ['token:rt-tertiary', rgb('#cfcfcf')],
  ['tw:white', rgb('#ffffff')],
  ['tw:black', rgb('#000000')],
  ['tw:red-600', rgb('oklch(57.7% 0.245 27.325)')],
]);

export const FIXED_DATE = new Date('2026-10-06T14:32:00Z');

/** Inputs for a prompt with the given edits. */
export function inputsWith(edits: PromptInputs['edits'] = { light: {}, dark: {} }): PromptInputs {
  return {
    catalogue: CATALOGUE,
    originals,
    defaultLinks: computeDefaultLinks(originals, new Set(LITERALS.map((l) => l.slot))),
    edits,
    generatedAt: FIXED_DATE,
  };
}
