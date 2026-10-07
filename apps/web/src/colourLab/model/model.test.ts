import { afterEach, describe, expect, it, vi } from 'vitest';

import { contrastRatio } from '../colour/contrast';
import { labelForSlot } from './brand';
import { CURATED, heuristicDark } from './dark';
import { ISLAND_SELECTOR } from './islands';
import {
  type ResolveInput,
  type SchemeEdits,
  changedRoles,
  computeDefaultLinks,
  customSpec,
  defaultColour,
  effectiveSpec,
  isChanged,
  resolveSlot,
} from './resolve';
import {
  hexSlotKey,
  packRgb,
  rgbOfHexSlot,
  slotKeyForVar,
  slotKind,
  varNameForSlot,
} from './slots';
import { LabStore, STORAGE_KEY, emptyState, parseStored } from './store';

const ink = { r: 8, g: 12, b: 21 };
const gold = { r: 241, g: 200, b: 129 };
const white = { r: 255, g: 255, b: 255 };

const originals = new Map([
  ['token:rt-primary', gold],
  ['token:rt-secondary-tint', gold],
  ['token:rt-ink', ink],
  ['token:rt-surface', white],
  ['token:rt-secondary', { r: 224, g: 163, b: 60 }],
  ['tw:white', white],
]);

const input = (
  edits: SchemeEdits = {},
  extra: string[] = [],
  scheme: 'light' | 'dark' = 'light',
): ResolveInput => ({
  scheme,
  originals,
  defaultLinks: computeDefaultLinks(originals, ['hex:#080c15', 'hex:#f1c881', ...extra]),
  edits,
});

const custom = (hex: string) => ({ kind: 'custom', hex }) as const;

describe('slot keys', () => {
  it('names var slots by their custom property', () => {
    expect(slotKeyForVar('--color-rt-ink')).toBe('token:rt-ink');
    expect(slotKeyForVar('--color-white')).toBe('tw:white');
    expect(slotKeyForVar('--color-red-600')).toBe('tw:red-600');
    expect(slotKeyForVar('--font-sans')).toBeNull();
    expect(slotKeyForVar('--color-')).toBeNull();
  });

  it('goes the other way', () => {
    expect(varNameForSlot('token:rt-ink')).toBe('--color-rt-ink');
    expect(varNameForSlot('tw:red-600')).toBe('--color-red-600');
    expect(varNameForSlot('hex:#fff000')).toBeNull();
  });

  it('keys a hardcoded colour by its 8-bit sRGB value', () => {
    expect(hexSlotKey(gold)).toBe('hex:#f1c881');
    expect(hexSlotKey({ r: 241.4, g: 199.6, b: 129 })).toBe('hex:#f1c881');
    expect(rgbOfHexSlot('hex:#f1c881')).toEqual(gold);
    expect(rgbOfHexSlot('token:rt-ink')).toBeNull();
    expect(slotKind('hex:#f1c881')).toBe('hex');
    expect(packRgb(gold)).toBe(0xf1c881);
  });
});

describe('default links', () => {
  it('links a hardcoded colour to the token that has its value', () => {
    expect(input().defaultLinks.get('hex:#080c15')).toBe('token:rt-ink');
  });

  it('prefers the token declared first when several share a value', () => {
    expect(input().defaultLinks.get('hex:#f1c881')).toBe('token:rt-primary');
  });

  it('prefers a token over a Tailwind colour of the same value', () => {
    expect(input({}, ['hex:#ffffff']).defaultLinks.get('hex:#ffffff')).toBe('token:rt-surface');
  });

  it('leaves a colour nothing owns unlinked', () => {
    expect(input({}, ['hex:#123456']).defaultLinks.has('hex:#123456')).toBe(false);
  });
});

describe('resolveSlot in the light theme', () => {
  it('is the original when nothing has been edited', () => {
    expect(resolveSlot('token:rt-ink', 'other', input())).toEqual(ink);
    expect(isChanged('token:rt-ink', input())).toBe(false);
  });

  it('applies a custom colour to every role', () => {
    const edits = { 'token:rt-ink': { base: custom('#101828') } };
    for (const role of ['other', 'text', 'fill', 'border'] as const) {
      expect(resolveSlot('token:rt-ink', role, input(edits))).toEqual({ r: 16, g: 24, b: 40 });
    }
    expect(isChanged('token:rt-ink', input(edits))).toBe(true);
  });

  it('applies a role setting to that role alone', () => {
    const edits = { 'token:rt-ink': { roles: { fill: custom('#ff0000') } } };
    expect(resolveSlot('token:rt-ink', 'fill', input(edits))).toEqual({ r: 255, g: 0, b: 0 });
    expect(resolveSlot('token:rt-ink', 'text', input(edits))).toEqual(ink);
    expect(changedRoles('token:rt-ink', input(edits))).toEqual(['fill']);
  });

  it('lets a role setting win over the colour overall', () => {
    const edits = {
      'token:rt-ink': { base: custom('#101828'), roles: { text: custom('#00ff00') } },
    };
    expect(resolveSlot('token:rt-ink', 'text', input(edits))).toEqual({ r: 0, g: 255, b: 0 });
    expect(resolveSlot('token:rt-ink', 'border', input(edits))).toEqual({ r: 16, g: 24, b: 40 });
  });

  it('makes a linked copy follow the token it was matched to, role by role', () => {
    const edits = { 'token:rt-ink': { roles: { text: custom('#101828') } } };
    expect(resolveSlot('hex:#080c15', 'text', input(edits))).toEqual({ r: 16, g: 24, b: 40 });
    expect(resolveSlot('hex:#080c15', 'fill', input(edits))).toEqual(ink);
  });

  it('stops following once told to stay original', () => {
    const edits = {
      'token:rt-ink': { base: custom('#101828') },
      'hex:#080c15': { base: { kind: 'original' } },
    } as const;
    expect(resolveSlot('hex:#080c15', 'other', input(edits))).toEqual(ink);
    expect(effectiveSpec('hex:#080c15', 'other', input(edits))).toEqual({ kind: 'original' });
  });

  it('lets a copy take its own colour', () => {
    const edits = { 'hex:#080c15': { base: custom('#ff0000') } };
    expect(resolveSlot('hex:#080c15', 'other', input(edits))).toEqual({ r: 255, g: 0, b: 0 });
    expect(resolveSlot('token:rt-ink', 'other', input(edits))).toEqual(ink);
  });

  it('resolves a link between slots of different values to the target', () => {
    const edits = { 'tw:white': { base: { kind: 'link', slot: 'token:rt-ink' } } } as const;
    expect(resolveSlot('tw:white', 'other', input(edits))).toEqual(ink);
  });

  it('survives a cycle by falling back to the original', () => {
    const edits = {
      'token:rt-ink': { base: { kind: 'link', slot: 'tw:white' } },
      'tw:white': { base: { kind: 'link', slot: 'token:rt-ink' } },
    } as const;
    expect(resolveSlot('token:rt-ink', 'other', input(edits))).not.toBeNull();
  });

  it('knows nothing about a var slot that was never defined', () => {
    expect(resolveSlot('token:rt-nope', 'other', input())).toBeNull();
    expect(isChanged('token:rt-nope', input())).toBe(false);
  });

  it('ignores a malformed custom colour', () => {
    const edits = { 'token:rt-ink': { base: custom('nope') } };
    expect(resolveSlot('token:rt-ink', 'other', input(edits))).toEqual(ink);
  });
});

describe('resolveSlot in the dark theme', () => {
  const dark = (edits: SchemeEdits = {}, extra: string[] = []) => input(edits, extra, 'dark');
  const hex = (slot: string, role: Parameters<typeof resolveSlot>[1], alpha = 1) => {
    const rgb = resolveSlot(slot, role, dark({}, ['hex:#ffffff']), alpha);
    return rgb ? `#${packRgb(rgb).toString(16).padStart(6, '0')}` : null;
  };

  it('uses the dark palette where one has been chosen', () => {
    expect(hex('token:rt-ink', 'text')).toBe('#eceef3');
    expect(hex('token:rt-surface', 'fill')).toBe('#1c1f26');
  });

  it('sets a colour apart by role: bright as text, deep as a fill', () => {
    expect(hex('token:rt-secondary', 'text')).toBe('#e0a33c');
    expect(hex('token:rt-secondary', 'fill')).toBe('#8a5c12');
    expect(hex('token:rt-secondary', 'border')).toBe('#e0a33c');
  });

  it('lets opacity decide: a wash of gold stays gold, a solid fill goes deep', () => {
    expect(hex('token:rt-secondary', 'fill', 0.1)).toBe('#e0a33c');
    expect(hex('token:rt-secondary', 'fill', 0.9)).toBe('#8a5c12');
    expect(hex('tw:white', 'fill', 0.1)).toBe('#ffffff');
    expect(hex('tw:white', 'fill', 0.9)).toBe('#1c1f26');
  });

  it('turns ink into a light wash for a hover and a black one for a scrim', () => {
    expect(hex('token:rt-ink', 'fill', 0.08)).toBe('#eceef3');
    expect(hex('token:rt-ink', 'fill', 0.35)).toBe('#07080b');
  });

  it('takes a hardcoded copy of a token along with it, role by role', () => {
    expect(hex('hex:#080c15', 'text')).toBe('#eceef3');
    expect(hex('hex:#ffffff', 'fill')).toBe('#1c1f26');
    // White text on a coloured button stays white, though white is a surface.
    expect(hex('hex:#ffffff', 'text')).toBe('#ffffff');
  });

  it('leaves a shadow dark, whatever its colour follows', () => {
    expect(hex('hex:#080c15', 'shadow')).toBe('#080c15');
  });

  it('works out a colour nobody chose by rule', () => {
    const slot = 'hex:#f7f4ee';
    const fill = resolveSlot(slot, 'fill', dark());
    expect(fill).not.toBeNull();
    expect(packRgb(fill ?? white)).toBeLessThan(0x303030);
    // A mid-tone reads on either theme and is left alone.
    expect(resolveSlot('hex:#c17b4a', 'fill', dark())).toEqual({ r: 193, g: 123, b: 74 });
  });

  it("applies the user's own setting over the palette", () => {
    const edits = { 'token:rt-ink': { roles: { text: custom('#ffffff') } } };
    expect(resolveSlot('token:rt-ink', 'text', dark(edits))).toEqual(white);
    expect(resolveSlot('token:rt-ink', 'fill', dark(edits))).not.toEqual(white);
  });

  it('is not changed until the user changes it', () => {
    expect(isChanged('token:rt-ink', dark())).toBe(false);
    expect(isChanged('token:rt-ink', dark({ 'token:rt-ink': { base: custom('#ffffff') } }))).toBe(
      true,
    );
    expect(
      defaultColour('token:rt-ink', 'text', dark({ 'token:rt-ink': { base: custom('#ffffff') } })),
    ).toEqual({
      r: 236,
      g: 238,
      b: 243,
    });
  });
});

describe('the dark palette', () => {
  const rgb = (value: string) => ({
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  });
  const solid = (slot: string, role: 'base' | 'text' | 'fill' | 'border', alpha = 1): string => {
    const entry = CURATED[slot]?.[role] ?? CURATED[slot]?.base;
    if (entry === undefined) throw new Error(`no ${role} for ${slot}`);
    return typeof entry === 'function' ? entry(alpha) : entry;
  };

  it('keeps ink readable on the page, on a surface and on a raised panel', () => {
    const ink = rgb(solid('token:rt-ink', 'text'));
    for (const background of [
      'token:rt-secondary-wash',
      'token:rt-surface',
      'token:rt-surface-alt',
    ]) {
      expect(contrastRatio(ink, rgb(solid(background, 'fill')))).toBeGreaterThanOrEqual(7);
    }
  });

  it('keeps secondary text readable on a surface', () => {
    const surface = rgb(solid('token:rt-surface', 'fill'));
    expect(contrastRatio(rgb(solid('token:rt-ink-muted', 'text')), surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(rgb(solid('token:rt-ink-faint', 'text')), surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(rgb(solid('token:rt-secondary-deep', 'text')), surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(rgb(solid('token:rt-cool-deep', 'text')), surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(rgb(solid('tw:red-600', 'text')), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps light text readable on a solid mustard button and on its hover', () => {
    const text = rgb(solid('token:rt-ink', 'text'));
    expect(contrastRatio(text, rgb(solid('token:rt-secondary', 'fill')))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(white, rgb(solid('token:rt-secondary-deep', 'fill'))),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the gold bright as a ring or a link against the page', () => {
    const page = rgb(solid('token:rt-secondary-wash', 'fill'));
    expect(contrastRatio(rgb(solid('token:rt-secondary', 'border')), page)).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('keeps slate deep as a background, so white initials on an avatar still read', () => {
    const avatar = rgb('#4d6a74');
    const dark = (role: 'text' | 'fill') => {
      const resolved = resolveSlot('token:rt-cool-deep', role, {
        scheme: 'dark',
        originals: new Map([['token:rt-cool-deep', avatar]]),
        defaultLinks: new Map(),
        edits: {},
      });
      return resolved ?? avatar;
    };
    expect(contrastRatio(white, dark('fill'))).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(dark('text'), rgb(solid('token:rt-surface', 'fill'))),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps white text readable on a red button', () => {
    expect(contrastRatio(white, rgb('#e7000b'))).toBeGreaterThanOrEqual(4.5);
  });

  it('turns light surfaces dark and dark text light by rule', () => {
    expect(packRgb(heuristicDark({ r: 253, g: 244, b: 229 }, 'fill'))).toBeLessThan(0x303030);
    expect(packRgb(heuristicDark({ r: 8, g: 12, b: 21 }, 'text'))).toBeGreaterThan(0xd0d0d0);
    expect(packRgb(heuristicDark({ r: 207, g: 207, b: 207 }, 'border'))).toBeLessThan(0x505050);
    expect(heuristicDark({ r: 77, g: 106, b: 116 }, 'fill')).toEqual({ r: 77, g: 106, b: 116 });
    expect(heuristicDark({ r: 255, g: 255, b: 255 }, 'shadow')).toEqual(white);
  });

  it('names where board content stays light', () => {
    expect(ISLAND_SELECTOR).toContain('[data-card-plate]');
    expect(ISLAND_SELECTOR).toContain('sticky-composer-label');
  });
});

describe('customSpec', () => {
  it('rounds to a lower-case hex', () => {
    expect(customSpec({ r: 16.4, g: 23.6, b: 40 })).toEqual({ kind: 'custom', hex: '#101828' });
  });
});

describe('labelForSlot', () => {
  it('names the brand tokens', () => {
    expect(labelForSlot('token:rt-ink').label).toBe('Ink');
    expect(labelForSlot('token:rt-tertiary').label).toBe('Border grey');
  });

  it('names a token it has never heard of from its own name', () => {
    expect(labelForSlot('token:rt-brand-new').label).toBe('Brand new');
  });

  it('names Tailwind colours', () => {
    expect(labelForSlot('tw:red-600').label).toBe('Red 600');
    expect(labelForSlot('tw:white').label).toBe('White');
  });

  it('names a hardcoded colour by its value', () => {
    expect(labelForSlot('hex:#f4e3ad').label).toBe('#f4e3ad');
  });
});

describe('parseStored', () => {
  it('starts fresh from nothing, or from junk', () => {
    expect(parseStored(null)).toEqual(emptyState());
    expect(parseStored('not json')).toEqual(emptyState());
    expect(parseStored('[]')).toEqual(emptyState());
  });

  it('keeps well-formed edits, roles included, and drops the rest', () => {
    const stored = JSON.stringify({
      scheme: 'dark',
      edits: {
        light: {
          'token:rt-ink': { base: { kind: 'custom', hex: '#ABCDEF' } },
          'token:rt-secondary': {
            roles: { fill: { kind: 'custom', hex: '#112233' }, nonsense: { kind: 'original' } },
          },
          'hex:#ffffff': { base: { kind: 'link', slot: 'token:rt-surface' } },
          bad: { base: { kind: 'custom', hex: 'zzz' } },
          worse: 3,
          empty: {},
        },
      },
      ui: { x: 10, y: 20, minimised: true, filter: 'all', search: 'ink' },
    });
    const state = parseStored(stored);
    expect(state.scheme).toBe('dark');
    expect(state.edits.light).toEqual({
      'token:rt-ink': { base: { kind: 'custom', hex: '#abcdef' } },
      'token:rt-secondary': { roles: { fill: { kind: 'custom', hex: '#112233' } } },
      'hex:#ffffff': { base: { kind: 'link', slot: 'token:rt-surface' } },
    });
    expect(state.ui).toEqual({ x: 10, y: 20, minimised: true, filter: 'all', search: 'ink' });
  });

  it("reads the first version's bare specs as the colour overall", () => {
    const state = parseStored(
      JSON.stringify({ edits: { light: { 'token:rt-ink': { kind: 'custom', hex: '#101828' } } } }),
    );
    expect(state.edits.light['token:rt-ink']).toEqual({ base: { kind: 'custom', hex: '#101828' } });
  });
});

describe('LabStore', () => {
  afterEach(() => vi.useRealTimers());

  it('notifies listeners and replaces the state on every change', () => {
    const store = new LabStore(null);
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getState();
    store.setSpec('light', 'token:rt-ink', custom('#101828'));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).not.toBe(before);
    expect(store.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#101828') });
  });

  it('sets a role apart without touching the colour overall', () => {
    const store = new LabStore(null);
    store.setSpec('dark', 'token:rt-secondary', custom('#111111'));
    store.setSpec('dark', 'token:rt-secondary', custom('#222222'), 'fill');
    expect(store.getState().edits.dark['token:rt-secondary']).toEqual({
      base: custom('#111111'),
      roles: { fill: custom('#222222') },
    });
    store.setSpec('dark', 'token:rt-secondary', null, 'fill');
    expect(store.getState().edits.dark['token:rt-secondary']).toEqual({ base: custom('#111111') });
  });

  it('forgets a slot entirely once nothing is set for it', () => {
    const store = new LabStore(null);
    store.setSpec('light', 'token:rt-ink', { kind: 'original' });
    store.setSpec('light', 'token:rt-ink', null);
    expect(store.getState().edits.light).toEqual({});
    store.setSpec('light', 'token:rt-ink', custom('#111111'), 'text');
    store.setSpec('light', 'token:rt-ink', null, 'text');
    expect(store.getState().edits.light).toEqual({});
  });

  it('clears every role of a slot at once', () => {
    const store = new LabStore(null);
    store.setSpec('light', 'token:rt-ink', custom('#111111'));
    store.setSpec('light', 'token:rt-ink', custom('#222222'), 'text');
    store.clearSlot('light', 'token:rt-ink');
    expect(store.getState().edits.light).toEqual({});
  });

  it('keeps the two themes apart, and resets one or both', () => {
    const store = new LabStore(null);
    store.setSpec('light', 'a', { kind: 'original' });
    store.setSpec('dark', 'b', { kind: 'original' });
    store.resetAll('light');
    expect(store.getState().edits).toEqual({
      light: {},
      dark: { b: { base: { kind: 'original' } } },
    });
    store.resetAll();
    expect(store.getState().edits).toEqual({ light: {}, dark: {} });
  });

  it('remembers which theme is showing', () => {
    const store = new LabStore(null);
    store.setScheme('dark');
    expect(store.getState().scheme).toBe('dark');
    const listener = vi.fn();
    store.subscribe(listener);
    store.setScheme('dark');
    expect(listener).not.toHaveBeenCalled();
  });

  it('saves after a pause, and a new store reads it back', () => {
    vi.useFakeTimers();
    const first = new LabStore(localStorage);
    first.setSpec('light', 'token:rt-ink', custom('#101828'));
    first.setUi({ minimised: true });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    const second = new LabStore(localStorage);
    expect(second.getState().edits.light['token:rt-ink']).toEqual({ base: custom('#101828') });
    expect(second.getState().ui.minimised).toBe(true);
  });

  it('picks up what the first version saved', () => {
    localStorage.setItem(
      'rt_colour_lab:v1',
      JSON.stringify({ edits: { light: { 'token:rt-ink': { kind: 'custom', hex: '#101828' } } } }),
    );
    expect(new LabStore(localStorage).getState().edits.light['token:rt-ink']).toEqual({
      base: custom('#101828'),
    });
  });

  it('picks up edits another tab saved but keeps its own panel position', () => {
    const a = new LabStore(localStorage);
    const b = new LabStore(localStorage);
    a.setUi({ x: 5, y: 5 });
    b.setUi({ x: 99, y: 99 });
    a.setSpec('light', 'token:rt-ink', { kind: 'original' });
    a.flush();
    b.syncEdits();
    expect(b.getState().edits.light['token:rt-ink']).toEqual({ base: { kind: 'original' } });
    expect(b.getState().ui.x).toBe(99);
  });

  it('works with no storage at all', () => {
    const store = new LabStore(null);
    store.setUi({ search: 'x' });
    expect(() => store.flush()).not.toThrow();
  });
});

describe('a colour with a wash', () => {
  const originals = new Map([['token:rt-ink', ink]]);
  const input = (spec: SchemeEdits[string]['base']): ResolveInput => ({
    scheme: 'dark',
    originals,
    defaultLinks: new Map(),
    edits: { 'token:rt-ink': { base: spec } },
  });
  const spec = { kind: 'custom' as const, hex: '#07080b', wash: { upTo: 0.22, hex: '#eceef3' } };

  it('is the wash when used thinly and the colour itself otherwise', () => {
    expect(resolveSlot('token:rt-ink', 'fill', input(spec), 0.05)).toEqual({
      r: 236,
      g: 238,
      b: 243,
    });
    expect(resolveSlot('token:rt-ink', 'fill', input(spec), 0.22)).toEqual({
      r: 236,
      g: 238,
      b: 243,
    });
    expect(resolveSlot('token:rt-ink', 'fill', input(spec), 0.6)).toEqual({ r: 7, g: 8, b: 11 });
    // With no opacity given, it is the solid colour.
    expect(resolveSlot('token:rt-ink', 'other', input(spec))).toEqual({ r: 7, g: 8, b: 11 });
  });

  it('is kept when stored, and dropped when it is not a colour', () => {
    const raw = JSON.stringify({ edits: { dark: { 'token:rt-ink': { base: spec } } } });
    expect(parseStored(raw).edits.dark['token:rt-ink']?.base).toEqual(spec);
    const broken = JSON.stringify({
      edits: { dark: { 'token:rt-ink': { base: { ...spec, wash: { upTo: 0.2, hex: 'nope' } } } } },
    });
    expect(parseStored(broken).edits.dark['token:rt-ink']?.base).toEqual({
      kind: 'custom',
      hex: '#07080b',
    });
  });
});
