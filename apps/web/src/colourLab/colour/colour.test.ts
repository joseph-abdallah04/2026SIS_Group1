import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast';
import { hsvToRgb, oklchToRgb, rgbToHsl, rgbToHsv, rgbToOklch } from './convert';
import { formatCss, formatLike, formatRgb, parseColour, parseHex, toHex } from './parse';
import {
  findColourTokens,
  findColourVars,
  findVarRefs,
  replaceColourTokens,
  splitDeclarations,
} from './tokens';

const near = (actual: number, expected: number, tolerance = 1) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

describe('parseHex', () => {
  it('reads the four hex forms', () => {
    expect(parseHex('#fff')?.rgba).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex('#F1C881')?.rgba).toEqual({ r: 241, g: 200, b: 129, a: 1 });
    expect(parseHex('#0000')?.rgba.a).toBe(0);
    const eight = parseHex('#3B82F614');
    expect(eight?.rgba).toMatchObject({ r: 59, g: 130, b: 246 });
    near(eight?.rgba.a ?? 0, 20 / 255, 0.001);
    expect(eight?.hexDigits).toBe(8);
  });

  it('refuses what is not hex', () => {
    expect(parseHex('#ggg')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('fff')).toBeNull();
  });
});

describe('parseColour', () => {
  it('reads rgb in the legacy and the modern syntax', () => {
    expect(parseColour('rgba(8, 12, 21, 0.12)')?.rgba).toEqual({ r: 8, g: 12, b: 21, a: 0.12 });
    const modern = parseColour('rgb(0 0 0 / 0.1)');
    expect(modern?.rgba).toEqual({ r: 0, g: 0, b: 0, a: 0.1 });
    expect(modern?.modern).toBe(true);
    expect(parseColour('rgb(100% 50% 0%)')?.rgba).toMatchObject({ r: 255, g: 128, b: 0 });
  });

  it('reads hsl', () => {
    expect(parseColour('hsl(0, 100%, 50%)')?.rgba).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(parseColour('hsl(120deg 100% 25% / 50%)')?.rgba).toMatchObject({ g: 128, a: 0.5 });
  });

  it('reads oklch the way the Tailwind palette writes it', () => {
    // Tailwind red-600 is about #e7000b.
    const red = parseColour('oklch(57.7% 0.245 27.325)')?.rgba;
    near(red?.r ?? 0, 0xe7, 3);
    near(red?.g ?? 0, 0x00, 3);
    near(red?.b ?? 0, 0x0b, 4);
    expect(parseColour('oklch(0.577 0.245 27.325)')?.rgba).toEqual(red);
  });

  it('returns null for what it cannot edit', () => {
    expect(parseColour('red')).toBeNull();
    expect(parseColour('color(display-p3 1 0 0)')).toBeNull();
    expect(parseColour('rgb(1 2)')).toBeNull();
  });
});

describe('formatting', () => {
  it('writes hex in lower case and adds alpha only below 1', () => {
    expect(toHex({ r: 241, g: 200, b: 129 })).toBe('#f1c881');
    expect(toHex({ r: 59, g: 130, b: 246 }, 0.5)).toBe('#3b82f680');
  });

  it('formats an rgb in the legacy syntax', () => {
    expect(formatRgb({ r: 1, g: 2, b: 3 })).toBe('rgb(1, 2, 3)');
    expect(formatRgb({ r: 1, g: 2, b: 3 }, 0.5)).toBe('rgba(1, 2, 3, 0.5)');
  });

  it('keeps the syntax the original was written in', () => {
    const next = { r: 16, g: 24, b: 40 };
    const like = (text: string) => {
      const parsed = parseColour(text);
      if (!parsed) throw new Error('unparsable fixture: ' + text);
      return parsed;
    };
    expect(formatLike(next, 1, like('#080C15'))).toBe('#101828');
    expect(formatLike(next, 0.12, like('rgba(8, 12, 21, 0.12)'))).toBe('rgba(16, 24, 40, 0.12)');
    expect(formatLike(next, 0.1, like('rgb(0 0 0 / 0.1)'))).toBe('rgb(16 24 40 / 0.1)');
    expect(formatLike(next, 1, like('#fff'))).toBe('#101828');
    expect(formatLike(next, 0.08, like('#3B82F614'))).toBe('#10182814');
    expect(formatLike(next, 1, like('oklch(0.5 0.1 200)'))).toMatch(/^oklch\(0\.\d+ 0\.\d+ \d+/);
  });
});

describe('colour spaces', () => {
  it('round-trips rgb through oklch', () => {
    for (const rgb of [
      { r: 241, g: 200, b: 129 },
      { r: 8, g: 12, b: 21 },
      { r: 77, g: 106, b: 116 },
    ]) {
      const back = oklchToRgb(rgbToOklch(rgb));
      near(back.r, rgb.r);
      near(back.g, rgb.g);
      near(back.b, rgb.b);
    }
  });

  it('round-trips rgb through hsv, and finds the hue of gold', () => {
    const rgb = { r: 224, g: 163, b: 60 };
    const { h, s, v } = rgbToHsv(rgb);
    const back = hsvToRgb(h, s, v);
    near(back.r, rgb.r);
    near(back.g, rgb.g);
    near(back.b, rgb.b);
    const hsl = rgbToHsl(rgb);
    expect(hsl.h).toBeGreaterThan(30);
    expect(hsl.h).toBeLessThan(45);
  });

  it('measures contrast', () => {
    near(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21, 0.01);
    near(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }), 1, 0.001);
  });
});

describe('findColourTokens', () => {
  it('finds every colour in a shadow list', () => {
    const value =
      'rgba(255, 255, 255, 0.65) 0px 1px 0px inset, #f1c881 0px 0px 0px 3px, rgba(122, 106, 76, 0.12) 0px 14px 32px';
    expect(findColourTokens(value).map((t) => t.text)).toEqual([
      'rgba(255, 255, 255, 0.65)',
      '#f1c881',
      'rgba(122, 106, 76, 0.12)',
    ]);
  });

  it('searches through gradients and var() fallbacks', () => {
    const gradient = 'radial-gradient(circle at 50% 42%, #fffaf0 0%, rgb(253, 244, 229) 48%)';
    expect(findColourTokens(gradient)).toHaveLength(2);
    const fallback = '0 1px 2px var(--tw-shadow-color, rgba(8,12,21,0.12))';
    expect(findColourTokens(fallback).map((t) => t.text)).toEqual(['rgba(8,12,21,0.12)']);
  });

  it('reports positions that slice back to the text', () => {
    const value = '1px solid #cfcfcf';
    const [token] = findColourTokens(value);
    expect(value.slice(token?.start, token?.end)).toBe('#cfcfcf');
  });

  it('does not read a colour out of url(), strings or ids', () => {
    expect(findColourTokens('url(#grad)')).toEqual([]);
    expect(findColourTokens('url("data:image/svg+xml,%3Csvg fill=%23f00 stroke=#fff")')).toEqual(
      [],
    );
    expect(findColourTokens('"#fff"')).toEqual([]);
    expect(findColourTokens('var(--color-rt-ink)')).toEqual([]);
  });

  it('steps over colour functions it cannot edit', () => {
    expect(findColourTokens('color(display-p3 1 0 0) lab(50% 40 59.5) #fff')).toHaveLength(1);
  });

  it('finds the colour inside color-mix but not the vars', () => {
    const mix = 'color-mix(in oklab, var(--color-rt-ink) 10%, transparent)';
    expect(findColourTokens(mix)).toEqual([]);
    expect(findColourTokens('color-mix(in srgb, rgb(241, 200, 129), transparent)')).toHaveLength(1);
  });
});

describe('replaceColourTokens', () => {
  it('rewrites only the colours it is given a replacement for', () => {
    const value = '0 0 0 3px #f1c881, 0 1px 3px rgba(8, 12, 21, 0.12)';
    const next = replaceColourTokens(value, (t) => (t.text === '#f1c881' ? '#000000' : null));
    expect(next).toBe('0 0 0 3px #000000, 0 1px 3px rgba(8, 12, 21, 0.12)');
  });

  it('returns the value untouched when nothing is replaced', () => {
    expect(replaceColourTokens('none', () => 'x')).toBe('none');
  });
});

describe('findVarRefs', () => {
  it('lists the custom properties a value reads', () => {
    expect(findVarRefs('var(--color-rt-ink) var( --tw-x , 1px)').map((r) => r.name)).toEqual([
      '--color-rt-ink',
      '--tw-x',
    ]);
  });
});

describe('splitDeclarations', () => {
  it('splits at top-level semicolons only', () => {
    const css =
      'color: red; background: url("data:image/svg+xml;utf8,<svg/>") no-repeat; margin: calc(1px + 2px) !important';
    expect(splitDeclarations(css)).toEqual([
      { name: 'color', value: 'red', important: false },
      {
        name: 'background',
        value: 'url("data:image/svg+xml;utf8,<svg/>") no-repeat',
        important: false,
      },
      { name: 'margin', value: 'calc(1px + 2px)', important: true },
    ]);
  });

  it('keeps a custom property whose value has colons', () => {
    expect(splitDeclarations('--x: a:b;')).toEqual([
      { name: '--x', value: 'a:b', important: false },
    ]);
  });
});

describe('findColourVars', () => {
  it('finds a brand token read as it is, with full opacity', () => {
    const [span, ...rest] = findColourVars('1px solid var(--color-rt-hairline)');
    expect(rest).toEqual([]);
    expect(span).toMatchObject({ name: '--color-rt-hairline', alpha: 1 });
    expect(span?.text).toBe('var(--color-rt-hairline)');
  });

  it('reads the opacity Tailwind gives a token with color-mix', () => {
    const value = 'color-mix(in oklab, var(--color-rt-secondary) 40%, transparent)';
    const [span] = findColourVars(value);
    expect(span?.name).toBe('--color-rt-secondary');
    expect(span?.alpha).toBeCloseTo(0.4);
    expect(value.slice(span?.start, span?.end)).toBe(span?.text);
  });

  it('does not take a percentage that is not an opacity for one', () => {
    const [span] = findColourVars('color-mix(in srgb, var(--color-white) 60%, var(--color-black))');
    expect(span?.alpha).toBe(1);
  });

  it('finds each of several, and leaves a fallback to the var that holds it', () => {
    const spans = findColourVars(
      '0 1px var(--color-rt-ink), 0 0 0 2px var(--color-rt-primary, var(--color-white))',
    );
    expect(spans.map((s) => s.name)).toEqual(['--color-rt-ink', '--color-rt-primary']);
    expect(spans[1]?.text).toBe('var(--color-rt-primary, var(--color-white))');
  });

  it('ignores variables that are not colours', () => {
    expect(findColourVars('var(--tw-shadow) var(--rt-paper)')).toEqual([]);
  });
});

describe('parseColour: what a browser reports for a colour it mixed', () => {
  it('reads color(srgb) with and without alpha', () => {
    expect(parseColour('color(srgb 1 0 0)')?.rgba).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    const half = parseColour('color(srgb 0 0.5 1 / 0.25)')?.rgba;
    expect(half).toMatchObject({ r: 0, b: 255 });
    near(half?.g ?? 0, 128, 1);
    expect(half?.a).toBeCloseTo(0.25);
  });

  it('refuses the other colour spaces', () => {
    expect(parseColour('color(display-p3 1 0 0)')).toBeNull();
  });
});

describe('formatCss', () => {
  it('writes a solid colour as hex', () => {
    expect(formatCss({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
    expect(formatCss({ r: 255, g: 0, b: 0 }, 1)).toBe('#ff0000');
  });

  it('writes a see-through colour with its alpha exact, not rounded to 1/255', () => {
    expect(formatCss({ r: 255, g: 0, b: 0 }, 0.12)).toBe('rgba(255, 0, 0, 0.12)');
    expect(parseColour(formatCss({ r: 8, g: 12, b: 21 }, 0.35))?.rgba.a).toBeCloseTo(0.35, 5);
  });
});
