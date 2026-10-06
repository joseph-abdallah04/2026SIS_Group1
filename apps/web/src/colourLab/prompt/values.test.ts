import { describe, expect, it } from 'vitest';

import { roleOfUtility } from '../catalogue/roles';
import { type RoleKey } from '../model/roles';
import { SITE_ROLES, UTILITY_PREFIXES, nthOnLine, rgbOfRaw, textFor } from './values';

describe('rgbOfRaw', () => {
  it('reads what the scanners find, named colours included', () => {
    expect(rgbOfRaw('#F1C881')).toEqual({ rgb: { r: 241, g: 200, b: 129, a: 1 }, alpha: 1 });
    expect(rgbOfRaw('rgba(8,12,21,0.12)')?.alpha).toBeCloseTo(0.12);
    expect(rgbOfRaw('white')).toEqual({ rgb: { r: 255, g: 255, b: 255 }, alpha: 1 });
    expect(rgbOfRaw('black')?.rgb).toEqual({ r: 0, g: 0, b: 0 });
    expect(rgbOfRaw('var(--x)')).toBeNull();
  });
});

describe('textFor', () => {
  const ink = { r: 16, g: 24, b: 40 };

  it('writes a colour the way the old one was written', () => {
    expect(textFor(ink, 1, '#080c15')).toBe('#101828');
    expect(textFor(ink, 1, '#080C15')).toBe('#101828');
    expect(textFor(ink, 1, '#fff')).toBe('#101828');
    expect(textFor(ink, 0.12, 'rgba(8, 12, 21, 0.12)')).toBe('rgba(16, 24, 40, 0.12)');
    expect(textFor(ink, 0.5, 'rgb(8 12 21 / 0.5)')).toBe('rgb(16 24 40 / 0.5)');
  });

  it('writes a name as hex, since a name has no syntax to keep', () => {
    expect(textFor({ r: 236, g: 238, b: 243 }, 1, 'black')).toBe('#eceef3');
  });

  it('keeps capitals where there were capitals', () => {
    expect(textFor({ r: 224, g: 163, b: 60 }, 1, '#F1C881')).toBe('#E0A33C');
    expect(textFor({ r: 16, g: 24, b: 40 }, 1, '#080C15')).toBe('#101828');
  });

  it('keeps a colour in a Tailwind class free of spaces, since a space would end the class', () => {
    expect(textFor(ink, 0.14, 'rgba(8,12,21,0.14)')).toBe('rgba(16,24,40,0.14)');
    expect(textFor(ink, 0.14, 'rgba(8,12,21,0.14)')).not.toMatch(/\s/);
  });

  it('keeps an opacity as it was written', () => {
    expect(textFor(ink, 0.3, 'rgba(8,12,21,0.30)')).toBe('rgba(16,24,40,0.30)');
    expect(textFor(ink, 0.1, 'rgba(8, 12, 21, 0.10)')).toBe('rgba(16, 24, 40, 0.10)');
    expect(textFor(ink, 0.5, 'rgb(8 12 21 / 0.50)')).toBe('rgb(16 24 40 / 0.50)');
  });

  it('keeps a lightness written as a percentage', () => {
    const text = textFor({ r: 192, g: 57, b: 43 }, 1, 'oklch(57.7% 0.245 27.325)');
    expect(text).toMatch(/^oklch\(54\.\d%/);
    expect(textFor({ r: 192, g: 57, b: 43 }, 1, 'oklch(0.577 0.245 27.325)')).toMatch(
      /^oklch\(0\.5/,
    );
  });
});

describe('nthOnLine', () => {
  const at = (line: number, col: number, raw = '#fff') => ({ file: 'a.css', line, col, raw });

  it('counts the same text before it on its own line, and nothing else', () => {
    const all = [at(1, 5), at(1, 20), at(1, 30, '#000'), at(2, 5)];
    expect(nthOnLine(all[0]!, all)).toBe(0);
    expect(nthOnLine(all[1]!, all)).toBe(1);
    expect(nthOnLine(all[2]!, all)).toBe(0);
    expect(nthOnLine(all[3]!, all)).toBe(0);
  });

  it('does not count another file', () => {
    const all = [at(1, 5), { ...at(1, 20), file: 'b.css' }];
    expect(nthOnLine(all[1]!, all)).toBe(0);
  });
});

describe('the utility prefixes', () => {
  // The scanner decides a class's role from its prefix, and the apply script finds classes by it
  // again. Both have to say the same, or a class would be counted in one role and moved in another.
  const prefixes = [
    'bg',
    'text',
    'border',
    'border-x',
    'border-y',
    'border-t',
    'border-b',
    'border-l',
    'border-r',
    'border-s',
    'border-e',
    'ring-offset',
    'ring',
    'outline',
    'fill',
    'stroke',
    'from',
    'via',
    'to',
    'divide',
    'placeholder',
    'decoration',
    'accent',
    'caret',
    'shadow',
    'inset-shadow',
    'drop-shadow',
  ];

  it.each(prefixes)('%s belongs to the role the scanner gives it, and to no other', (prefix) => {
    const role = roleOfUtility(prefix) as RoleKey;
    for (const candidate of SITE_ROLES) {
      const matches = new RegExp(`^(?:${UTILITY_PREFIXES[candidate]})$`).test(prefix);
      expect(matches, `${prefix} as ${candidate}`).toBe(candidate === role);
    }
  });
});
