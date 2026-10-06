import { beforeEach, describe, expect, it } from 'vitest';

import { type SlotKey } from '../model/slots';
import { scanStyleSheets } from './cssom';
import { type Painter } from './template';

const reading = (...slots: SlotKey[]): Painter => ({ reads: (slot) => slots.includes(slot) });
const never: Painter = { reads: () => false };

function sheet(css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

beforeEach(() => {
  document.head.innerHTML = '';
});

describe('scanStyleSheets', () => {
  it('reads var slots defined on :root', () => {
    sheet(':root { --color-rt-ink: #080c15; --color-white: #fff; --font-sans: Inter; }');
    const { varDefs } = scanStyleSheets(document);
    expect(Object.fromEntries(varDefs)).toEqual({
      '--color-rt-ink': '#080c15',
      '--color-white': '#fff',
    });
  });

  it('finds the colour literals in a rule and can point them at a variable', () => {
    sheet('.a { color: #123456; box-shadow: 0 1px 2px rgba(8, 12, 21, 0.1); }');
    const scan = scanStyleSheets(document);
    const slots = scan.writers.flatMap((w) => w.template.slots).sort();
    expect(slots).toEqual(['hex:#080c15', 'hex:#123456']);

    const rule = (document.styleSheets[0]?.cssRules[0] as CSSStyleRule).style;
    for (const writer of scan.writers) writer.apply(reading('hex:#123456'));
    expect(rule.getPropertyValue('color')).toBe('var(--cl-text-hex-123456, rgb(18, 52, 86))');
    expect(rule.getPropertyValue('box-shadow')).toContain('rgba(8, 12, 21, 0.1)');

    for (const writer of scan.writers) writer.apply(never);
    expect(rule.getPropertyValue('color')).toBe('rgb(18, 52, 86)');
  });

  it('records where each colour is used, as a selector the page can be asked about', () => {
    sheet('.a:hover { color: #123456; } .b::after { background: var(--color-rt-ink); }');
    const { uses } = scanStyleSheets(document);
    expect(uses.map((u) => [u.slot, u.selector, u.role])).toEqual([
      ['hex:#123456', '.a', 'text'],
      ['token:rt-ink', '.b', 'fill'],
    ]);
  });

  it('can point a brand token or palette colour read through var() at a variable for its role', () => {
    sheet(
      '.x { border-color: var(--color-rt-tertiary); color: var(--color-red-600); gap: var(--spacing); }',
    );
    const scan = scanStyleSheets(document);
    expect(scan.uses.map((u) => [u.slot, u.role]).sort()).toEqual([
      ['token:rt-tertiary', 'border'],
      ['tw:red-600', 'text'],
    ]);
    const rule = (document.styleSheets[0]?.cssRules[0] as CSSStyleRule).style;
    for (const writer of scan.writers) writer.apply(reading('token:rt-tertiary'));
    expect(rule.getPropertyValue('border-color')).toContain(
      'var(--cl-border-token-rt-tertiary, var(--color-rt-tertiary))',
    );
    expect(rule.getPropertyValue('color')).toBe('var(--color-red-600)');
  });

  it('keeps the media conditions a rule sits under', () => {
    sheet('@media (min-width: 640px) { .a { background: #fff; } }');
    const { uses } = scanStyleSheets(document);
    expect(uses).toHaveLength(1);
    expect(uses[0]?.media).toEqual(['(min-width: 640px)']);
  });

  it('records the animation a keyframe colour belongs to', () => {
    sheet('@keyframes flash { 50% { color: #b42318; } }');
    const { uses } = scanStyleSheets(document);
    expect(uses).toEqual([
      { slot: 'hex:#b42318', role: 'text', selector: null, media: [], keyframes: 'flash' },
    ]);
  });

  it('skips Tailwind sRGB fallbacks, which the browser never uses', () => {
    sheet('.x { background-color: color-mix(in srgb, #f1c881 50%, transparent); }');
    expect(scanStyleSheets(document).writers).toEqual([]);
  });

  it('counts a slot once per place and role however many declarations use it', () => {
    sheet('.a { color: #123456; border-color: #123456; background: #123456; }');
    const { uses } = scanStyleSheets(document);
    expect(uses.map((u) => u.role).sort()).toEqual(['border', 'fill', 'text']);
  });

  it('gives a custom property of the app the role its name says', () => {
    sheet('.a { --rt-paper: #f7f4ee; --rt-chip-edge: #cfd9dc; --rt-assistant-ink: #fff; }');
    const { uses } = scanStyleSheets(document);
    expect(uses.map((u) => [u.slot, u.role]).sort()).toEqual([
      ['hex:#cfd9dc', 'border'],
      ['hex:#f7f4ee', 'fill'],
      ['hex:#ffffff', 'text'],
    ]);
  });

  it('ignores a sheet it cannot read', () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.example/none.css';
    document.head.appendChild(link);
    expect(() => scanStyleSheets(document)).not.toThrow();
  });
});
