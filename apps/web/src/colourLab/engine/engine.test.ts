import { describe, expect, it } from 'vitest';

import { type Rgb } from '../colour/convert';
import { cleanSelector, splitTopLevel } from './selectors';
import {
  type ColourPart,
  type Painter,
  type Template,
  type VarPart,
  buildTemplate,
  renderTemplate,
  renderValues,
  templateVars,
  touches,
  varNameFor,
} from './template';

const ink: Rgb = { r: 16, g: 24, b: 40 };
const reading = (...slots: string[]): Painter => ({ reads: (slot) => slots.includes(slot) });
const never: Painter = { reads: () => false };

const parts = (template: ReturnType<typeof buildTemplate>) =>
  (template?.parts ?? []).filter((part): part is ColourPart | VarPart => typeof part !== 'string');

describe('buildTemplate', () => {
  it('cuts a value around its colours', () => {
    const template = buildTemplate(
      '0 0 0 3px rgb(241, 200, 129), 0 1px 3px rgba(8, 12, 21, 0.12)',
      'shadow',
      'box-shadow',
    );
    expect(template?.slots).toEqual(['hex:#f1c881', 'hex:#080c15']);
    expect(template?.parts).toHaveLength(4);
  });

  it('is null when there is nothing to edit', () => {
    expect(buildTemplate('1px solid', 'border', 'border')).toBeNull();
    expect(buildTemplate('#0000', 'fill', 'background')).toBeNull();
    expect(buildTemplate('var(--spacing)', 'other', 'gap')).toBeNull();
  });

  it('counts a slot once however often the value uses it', () => {
    const template = buildTemplate(
      'rgba(8, 12, 21, 0.1), rgba(8, 12, 21, 0.2)',
      'fill',
      'background',
    );
    expect(template?.slots).toEqual(['hex:#080c15']);
  });

  it('reads a brand token or palette colour as a part of its own', () => {
    const template = buildTemplate('var(--color-rt-ink)', 'text', 'color');
    expect(parts(template)).toEqual([
      { kind: 'var', text: 'var(--color-rt-ink)', slot: 'token:rt-ink', alpha: 1, role: 'text' },
    ]);
    expect(buildTemplate('var(--color-red-600)', 'text', 'color')?.slots).toEqual(['tw:red-600']);
  });

  it('keeps the opacity Tailwind mixes a colour in at', () => {
    const template = buildTemplate(
      'color-mix(in oklab, var(--color-white) 10%, transparent)',
      'fill',
      'background-color',
    );
    expect(parts(template)[0]).toMatchObject({ slot: 'tw:white', alpha: 0.1 });
    // Not mixed, so not an opacity.
    expect(parts(buildTemplate('var(--color-white)', 'fill', 'background-color'))[0]?.alpha).toBe(
      1,
    );
  });

  it('does not find a colour inside the fallback of one it reads', () => {
    const template = buildTemplate('var(--color-rt-ink, #000000)', 'text', 'color');
    expect(parts(template)).toHaveLength(1);
  });

  it('still finds a colour in the fallback of an unrelated variable', () => {
    const template = buildTemplate(
      '0 1px 2px var(--tw-shadow-color, rgba(8,12,21,0.12))',
      'shadow',
      '--tw-shadow',
    );
    expect(template?.slots).toEqual(['hex:#080c15']);
  });

  it('tells the layers of a shadow apart: a soft one is a shadow, a ring is a border', () => {
    const template = buildTemplate(
      'inset 0 1px 0 rgba(255, 255, 255, 0.65), 0 0 0 3px #f1c881, 0 14px 32px rgba(122, 106, 76, 0.12)',
      'shadow',
      'box-shadow',
    );
    expect(parts(template).map((part) => [part.slot, part.role])).toEqual([
      ['hex:#ffffff', 'border'],
      ['hex:#f1c881', 'border'],
      ['hex:#7a6a4c', 'shadow'],
    ]);
  });

  it('gives every colour of an ordinary property the role of the property', () => {
    const template = buildTemplate('linear-gradient(#fff, #000)', 'fill', 'background-image');
    expect(parts(template).map((part) => part.role)).toEqual(['fill', 'fill']);
  });
});

describe('renderTemplate', () => {
  const template = buildTemplate(
    '0 0 0 3px rgb(241, 200, 129), 0 1px 3px rgba(8, 12, 21, 0.12)',
    'shadow',
    'box-shadow',
  );

  it('is the original when nothing is read', () => {
    if (!template) throw new Error('fixture');
    expect(renderTemplate(template, never)).toBe(template.original);
  });

  it("reads a variable for the colours that are to change, the app's own colour as its fallback", () => {
    if (!template) throw new Error('fixture');
    expect(renderTemplate(template, reading('hex:#080c15'))).toBe(
      '0 0 0 3px rgb(241, 200, 129), 0 1px 3px var(--cl-shadow-hex-080c15-120, rgba(8, 12, 21, 0.12))',
    );
  });

  it('names the variable by role, so one colour can be two things', () => {
    const ring = buildTemplate('2px solid var(--color-rt-secondary)', 'border', 'border');
    const fill = buildTemplate('var(--color-rt-secondary)', 'fill', 'background-color');
    if (!ring || !fill) throw new Error('fixture');
    expect(renderTemplate(ring, reading('token:rt-secondary'))).toBe(
      '2px solid var(--cl-border-token-rt-secondary, var(--color-rt-secondary))',
    );
    expect(renderTemplate(fill, reading('token:rt-secondary'))).toBe(
      'var(--cl-fill-token-rt-secondary, var(--color-rt-secondary))',
    );
  });

  it('decides per role and opacity', () => {
    const mixed = buildTemplate(
      'color-mix(in oklab, var(--color-white) 90%, transparent)',
      'fill',
      'background-color',
    );
    if (!mixed) throw new Error('fixture');
    const painter: Painter = {
      reads: (slot, role, alpha) => slot === 'tw:white' && role === 'fill' && alpha === 0.9,
    };
    expect(renderTemplate(mixed, painter)).toContain('var(--cl-fill-tw-white-900,');
    expect(renderTemplate(mixed, never)).toBe(mixed.original);
  });
});

describe('renderValues', () => {
  it('swaps colours outright, keeping alpha and syntax', () => {
    const template = buildTemplate('0 1px 3px rgba(8, 12, 21, 0.12)', 'shadow', 'box-shadow');
    if (!template) throw new Error('fixture');
    expect(renderValues(template, (slot) => (slot === 'hex:#080c15' ? ink : null))).toBe(
      '0 1px 3px rgba(16, 24, 40, 0.12)',
    );
    expect(renderValues(template, () => null)).toBe(template.original);
  });

  it('writes a named colour back as hex, and leaves a variable read alone', () => {
    const named: Template = {
      original: 'black var(--color-rt-ink)',
      slots: ['hex:#000000', 'token:rt-ink'],
      parts: [
        { kind: 'colour', text: 'black', slot: 'hex:#000000', alpha: 1, like: null, role: 'image' },
        ' ',
        { kind: 'var', text: 'var(--color-rt-ink)', slot: 'token:rt-ink', alpha: 1, role: 'image' },
      ],
    };
    expect(renderValues(named, () => ink)).toBe('#101828 var(--color-rt-ink)');
  });
});

describe('templateVars and varNameFor', () => {
  it('lists the variables a template can read, once each', () => {
    const template = buildTemplate(
      'rgba(8, 12, 21, 0.1), rgba(8, 12, 21, 0.1), var(--color-rt-ink)',
      'fill',
      'background',
    );
    if (!template) throw new Error('fixture');
    expect(templateVars(template).map((use) => use.name)).toEqual([
      '--cl-fill-hex-080c15-100',
      '--cl-fill-token-rt-ink',
    ]);
  });

  it('puts the opacity in thousandths and drops it when there is none', () => {
    expect(varNameFor('text', 'token:rt-ink', 1)).toBe('--cl-text-token-rt-ink');
    expect(varNameFor('fill', 'hex:#fdf4e5', 0.14)).toBe('--cl-fill-hex-fdf4e5-140');
    expect(varNameFor('image', 'tw:red-600', 0.5)).toBe('--cl-image-tw-red-600-500');
  });
});

describe('touches', () => {
  const template = buildTemplate('rgb(1, 2, 3)', 'fill', 'background');
  it('asks whether any of its slots changed', () => {
    if (!template) throw new Error('fixture');
    expect(touches(template, undefined)).toBe(true);
    expect(touches(template, new Set(['hex:#010203']))).toBe(true);
    expect(touches(template, new Set(['hex:#ffffff']))).toBe(false);
  });
});

describe('splitTopLevel', () => {
  it('ignores separators inside parens, brackets and strings', () => {
    expect(splitTopLevel('.a:is(.b, .c), .d[x="1,2"], .e', ',')).toEqual([
      '.a:is(.b, .c)',
      ' .d[x="1,2"]',
      ' .e',
    ]);
  });
});

describe('cleanSelector', () => {
  it('strips states a page is not in', () => {
    expect(cleanSelector('.hover\\:bg-white:hover', null)).toBe('.hover\\:bg-white');
    expect(cleanSelector('.focus-visible\\:ring-rt-secondary:focus-visible', null)).toBe(
      '.focus-visible\\:ring-rt-secondary',
    );
    expect(cleanSelector('button:hover:not(:disabled)', null)).toBe('button:not(:disabled)');
  });

  it('keeps an escaped colon in a class name', () => {
    expect(cleanSelector('.md\\:hover\\:bg-x', null)).toBe('.md\\:hover\\:bg-x');
  });

  it('strips pseudo-elements down to the element they belong to', () => {
    expect(cleanSelector(".rt-voice-seat[data-speaking='true']::after", null)).toBe(
      ".rt-voice-seat[data-speaking='true']",
    );
    expect(cleanSelector('.rt-studio-minimise::backdrop', null)).toBe('.rt-studio-minimise');
    expect(cleanSelector('.rt-assistant-feed::-webkit-scrollbar-thumb', null)).toBe(
      '.rt-assistant-feed',
    );
    expect(cleanSelector('.a:before', null)).toBe('.a');
  });

  it('strips a state inside :is() and :where()', () => {
    expect(cleanSelector('.group-hover\\:text-rt-primary:is(:where(.group):hover *)', null)).toBe(
      '.group-hover\\:text-rt-primary:is(:where(.group) *)',
    );
  });

  it('handles each selector in a list', () => {
    expect(cleanSelector('.a:hover, .b::after', null)).toBe('.a, .b');
  });

  it('resolves & against the rule it is nested in', () => {
    expect(cleanSelector('&:hover', '.nest')).toBe(':is(.nest)');
    expect(cleanSelector('& .child', '.nest')).toBe(':is(.nest) .child');
    expect(cleanSelector('&:hover', null)).toBe('*');
  });

  it('falls back to * when only a pseudo-element is left', () => {
    expect(cleanSelector('::backdrop', null)).toBe('*');
    expect(cleanSelector('*, ::before, ::after', null)).toBe('*, *, *');
  });
});
