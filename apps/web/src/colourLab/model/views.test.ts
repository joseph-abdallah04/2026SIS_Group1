import { describe, expect, it } from 'vitest';

import { type Catalogue, type LiteralOccurrence, type Role } from '../catalogue/types';
import { computeDefaultLinks } from './resolve';
import { type ViewInputs, buildSlotViews, filterViews } from './views';

const gold = { r: 241, g: 200, b: 129 };
const ink = { r: 8, g: 12, b: 21 };
const white = { r: 255, g: 255, b: 255 };
const red = { r: 231, g: 0, b: 11 };
const mustard = { r: 224, g: 163, b: 60 };

const literal = (
  slot: string,
  context: string,
  extra: Partial<LiteralOccurrence> = {},
): LiteralOccurrence => ({
  slot,
  file: 'apps/web/src/index.css',
  line: 1,
  col: 1,
  raw: slot.slice(4),
  alpha: 1,
  role: 'fill',
  context,
  snippet: '',
  exportOnly: false,
  ...extra,
});

const catalogue: Catalogue = {
  generatedAt: 0,
  git: { sha: null, branch: null, mergeBase: null },
  tokens: [
    {
      slot: 'token:rt-primary',
      name: '--color-rt-primary',
      value: '#f1c881',
      file: 'a',
      line: 1,
      col: 1,
      snippet: '',
    },
    {
      slot: 'token:rt-ink',
      name: '--color-rt-ink',
      value: '#080c15',
      file: 'a',
      line: 2,
      col: 1,
      snippet: '',
    },
    {
      slot: 'token:rt-secondary',
      name: '--color-rt-secondary',
      value: '#e0a33c',
      file: 'a',
      line: 3,
      col: 1,
      snippet: '',
    },
  ],
  literals: [
    literal('hex:#080c15', '.rt-a'),
    literal('hex:#080c15', '.rt-a'),
    literal('hex:#080c15', '.rt-b', { role: 'shadow' }),
    literal('hex:#f4e3ad', '.rt-waiting-start'),
    literal('hex:#123456', 'INK', { file: 'apps/server/src/pdf.ts', exportOnly: true }),
  ],
  refs: [],
  classes: [
    {
      slot: 'token:rt-ink',
      file: 'apps/web/src/features/x/Foo.tsx',
      role: 'text',
      alpha: 1,
      count: 5,
    },
    {
      slot: 'token:rt-ink',
      file: 'apps/web/src/features/x/Bar.tsx',
      role: 'text',
      alpha: 1,
      count: 2,
    },
    {
      slot: 'token:rt-secondary',
      file: 'apps/web/src/features/x/Foo.tsx',
      role: 'fill',
      alpha: 1,
      count: 3,
    },
    {
      slot: 'token:rt-secondary',
      file: 'apps/web/src/features/x/Foo.tsx',
      role: 'text',
      alpha: 1,
      count: 1,
    },
    {
      slot: 'tw:red-600',
      file: 'apps/web/src/features/x/Foo.tsx',
      role: 'text',
      alpha: 1,
      count: 1,
    },
  ],
};

const originals = new Map([
  ['token:rt-primary', gold],
  ['token:rt-ink', ink],
  ['token:rt-secondary', mustard],
  ['tw:white', white],
  ['tw:red-600', red],
  ['tw:red-50', { r: 254, g: 242, b: 242 }],
]);

const inputs = (over: Partial<ViewInputs> = {}): ViewInputs => ({
  catalogue,
  scheme: 'light',
  originals,
  defaultLinks: computeDefaultLinks(originals, ['hex:#080c15', 'hex:#f4e3ad', 'hex:#123456']),
  liveHex: new Set(),
  usage: new Map(),
  roleUse: new Map(),
  usageKnown: false,
  edits: {},
  ...over,
});

const custom = (hex: string) => ({ kind: 'custom', hex }) as const;

describe('buildSlotViews', () => {
  const views = buildSlotViews(inputs());
  const byKey = (key: string) => views.find((view) => view.key === key);

  it('groups brand, Tailwind and hardcoded colours, in that order', () => {
    expect(views.map((v) => v.group)).toEqual([
      'brand',
      'brand',
      'brand',
      'tailwind',
      'tailwind',
      'tailwind',
      'hardcoded',
      'hardcoded',
      'hardcoded',
    ]);
  });

  it('keeps brand tokens in declaration order and Tailwind shades in numeric order', () => {
    expect(views.filter((v) => v.group === 'brand').map((v) => v.label)).toEqual([
      'Primary',
      'Ink',
      'Secondary',
    ]);
    expect(views.filter((v) => v.group === 'tailwind').map((v) => v.key)).toEqual([
      'tw:red-50',
      'tw:red-600',
      'tw:white',
    ]);
  });

  it('puts the most-used hardcoded colour first', () => {
    expect(views.filter((v) => v.group === 'hardcoded')[0]?.key).toBe('hex:#080c15');
  });

  it('names a hardcoded colour by its value and where it lives', () => {
    const inkCopy = byKey('hex:#080c15');
    expect(inkCopy?.label).toBe('#080c15');
    expect(inkCopy?.where).toEqual(['.rt-a', '.rt-b']);
    expect(inkCopy?.sites).toBe(3);
  });

  it('shows a copy of a token as following it', () => {
    expect(byKey('hex:#080c15')?.link).toEqual({
      target: 'token:rt-ink',
      label: 'Ink',
      following: true,
    });
    expect(byKey('hex:#f4e3ad')?.link).toBeNull();
  });

  it('counts class uses against a token and names the files that use it', () => {
    const view = byKey('token:rt-ink');
    expect(view?.sites).toBe(7);
    expect(view?.where).toEqual(['Foo.tsx', 'Bar.tsx']);
  });

  it('marks colours that only the exports use', () => {
    expect(byKey('hex:#123456')?.exportOnly).toBe(true);
    expect(byKey('hex:#080c15')?.exportOnly).toBe(false);
  });

  it('knows the roles a colour is used in, from the source and from the page', () => {
    expect(Object.keys(byKey('token:rt-ink')?.roles ?? {})).toEqual(['text']);
    expect(Object.keys(byKey('hex:#080c15')?.roles ?? {}).sort()).toEqual(['fill', 'shadow']);
    const live = buildSlotViews(
      inputs({ roleUse: new Map<string, Set<Role>>([['token:rt-ink', new Set<Role>(['fill'])]]) }),
    );
    expect(Object.keys(live.find((v) => v.key === 'token:rt-ink')?.roles ?? {}).sort()).toEqual([
      'fill',
      'text',
    ]);
  });

  it('reports a change on the token and on the copy that follows it', () => {
    const edited = buildSlotViews(
      inputs({ edits: { 'token:rt-ink': { base: custom('#101828') } } }),
    );
    const token = edited.find((v) => v.key === 'token:rt-ink');
    const copy = edited.find((v) => v.key === 'hex:#080c15');
    expect(token).toMatchObject({ changed: true, current: { r: 16, g: 24, b: 40 } });
    expect(token?.own).toEqual({ base: custom('#101828') });
    expect(copy).toMatchObject({ changed: true, own: null });
    expect(copy?.link?.following).toBe(true);
  });

  it('stops reporting a copy as following once it is unlinked', () => {
    const edited = buildSlotViews(
      inputs({ edits: { 'hex:#080c15': { base: { kind: 'original' } } } }),
    );
    expect(edited.find((v) => v.key === 'hex:#080c15')?.link?.following).toBe(false);
  });

  it('does not count a setting for one role as unfollowing', () => {
    const edited = buildSlotViews(
      inputs({ edits: { 'hex:#080c15': { roles: { fill: custom('#ff0000') } } } }),
    );
    expect(edited.find((v) => v.key === 'hex:#080c15')?.link?.following).toBe(true);
  });

  it('adds colours seen only on the live page', () => {
    const live = buildSlotViews(inputs({ liveHex: new Set(['hex:#3b82f6']) }));
    expect(live.some((v) => v.key === 'hex:#3b82f6')).toBe(true);
  });

  it('knows which colours are on the page', () => {
    const used = buildSlotViews(
      inputs({ usage: new Map([['token:rt-ink', 12]]), usageKnown: true }),
    );
    expect(used.find((v) => v.key === 'token:rt-ink')).toMatchObject({
      onPage: true,
      pageCount: 12,
    });
    expect(used.find((v) => v.key === 'token:rt-primary')?.onPage).toBe(false);
  });

  it('is not split while every role is the same colour', () => {
    expect(byKey('token:rt-secondary')?.split).toBe(false);
  });

  it('is split when one role is set apart', () => {
    const edited = buildSlotViews(
      inputs({ edits: { 'token:rt-secondary': { roles: { fill: custom('#112233') } } } }),
    );
    const view = edited.find((v) => v.key === 'token:rt-secondary');
    expect(view?.split).toBe(true);
    expect(view?.roles.fill).toMatchObject({ current: { r: 17, g: 34, b: 51 }, own: true });
    expect(view?.roles.text).toMatchObject({ current: mustard, own: false });
    expect(view?.changed).toBe(true);
  });
});

describe('buildSlotViews in the dark theme', () => {
  const dark = (over: Partial<ViewInputs> = {}) =>
    buildSlotViews(inputs({ scheme: 'dark', ...over }));
  const byKey = (views: ReturnType<typeof dark>, key: string) => views.find((v) => v.key === key);

  it("shows the dark palette as the colour, the app's own as the original", () => {
    const view = byKey(dark(), 'token:rt-ink');
    expect(view).toMatchObject({
      original: ink,
      baseline: { r: 236, g: 238, b: 243 },
      current: { r: 236, g: 238, b: 243 },
      changed: false,
    });
  });

  it('is changed only by what the user changed', () => {
    const view = byKey(
      dark({ edits: { 'token:rt-ink': { base: custom('#ffffff') } } }),
      'token:rt-ink',
    );
    expect(view).toMatchObject({
      changed: true,
      current: white,
      baseline: { r: 236, g: 238, b: 243 },
    });
  });

  it('splits a colour by role where the palette does: bright text, deep fill', () => {
    const view = byKey(dark(), 'token:rt-secondary');
    expect(view?.split).toBe(true);
    expect(view?.roles.text?.current).toEqual(mustard);
    expect(view?.roles.fill?.current).toEqual({ r: 138, g: 92, b: 18 });
  });

  it('carries a copy of a token along', () => {
    const view = byKey(dark(), 'hex:#080c15');
    expect(view?.current).toEqual({ r: 236, g: 238, b: 243 });
    expect(view?.changed).toBe(false);
  });
});

describe('filterViews', () => {
  const edits = { 'token:rt-ink': { base: custom('#101828') } };
  const views = buildSlotViews(
    inputs({ edits, usage: new Map([['token:rt-ink', 3]]), usageKnown: true }),
  );

  it('shows everything for "this page" until the page has been checked', () => {
    const unknown = buildSlotViews(inputs());
    const listing = filterViews(unknown, 'page', '', false);
    expect(listing.pending).toBe(true);
    expect(listing.views).toHaveLength(unknown.length);
  });

  it('narrows "this page" to what is used there', () => {
    const listing = filterViews(views, 'page', '', true);
    expect(listing.pending).toBe(false);
    expect(listing.views.map((v) => v.key)).toEqual(['token:rt-ink']);
  });

  it('narrows "changed" to what has been edited or is following an edit', () => {
    const listing = filterViews(views, 'changed', '', true);
    expect(listing.views.map((v) => v.key).sort()).toEqual(['hex:#080c15', 'token:rt-ink']);
  });

  it('searches names, hex values, hints and places', () => {
    expect(filterViews(views, 'all', 'ink', true).views.map((v) => v.key)).toContain(
      'token:rt-ink',
    );
    expect(filterViews(views, 'all', '#f4e3', true).views.map((v) => v.key)).toEqual([
      'hex:#f4e3ad',
    ]);
    expect(filterViews(views, 'all', 'waiting-start', true).views.map((v) => v.key)).toEqual([
      'hex:#f4e3ad',
    ]);
    expect(filterViews(views, 'all', 'zzz', true).views).toEqual([]);
  });
});
