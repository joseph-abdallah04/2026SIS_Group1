import { describe, expect, it } from 'vitest';

import { ISLAND_SELECTOR } from '../model/islands';
import { renderSheet } from './varSheet';

const vars = (entries: [string, string][]) => new Map(entries);

describe('renderSheet', () => {
  it('writes nothing for an untouched light page', () => {
    expect(renderSheet({ scheme: 'light', root: new Map(), islands: null })).toBe('');
  });

  it('puts a light edit on the root and nowhere else', () => {
    const css = renderSheet({
      scheme: 'light',
      root: vars([['--color-rt-ink', '#101828']]),
      islands: vars([['--color-rt-ink', '#ffffff']]),
    });
    expect(css).toContain(':root {');
    expect(css).toContain('--color-rt-ink: #101828;');
    expect(css).toContain('color-scheme: light;');
    expect(css).not.toContain(':where(');
  });

  it('asks for dark controls on the root in the dark theme, even with nothing edited', () => {
    const css = renderSheet({ scheme: 'dark', root: new Map(), islands: null });
    expect(css).toContain('color-scheme: dark;');
    expect(css).not.toContain(':where(');
  });

  it('puts content that stays light back to light, with its text colour spelled out', () => {
    const css = renderSheet({
      scheme: 'dark',
      root: vars([['--color-rt-page', '#14161b']]),
      islands: vars([
        ['--color-rt-page', '#fbf9f4'],
        ['--cl-text-token-rt-ink', 'initial'],
      ]),
    });
    const [rootBlock, islandBlock] = css.split('\n}\n');
    expect(rootBlock).toContain('color-scheme: dark;');
    expect(rootBlock).toContain('--color-rt-page: #14161b;');
    expect(islandBlock).toContain(`:where(${ISLAND_SELECTOR}) {`);
    expect(islandBlock).toContain('color-scheme: light;');
    // Without this, text inside a card would inherit the dark page's light ink.
    expect(islandBlock).toContain('color: var(--color-rt-ink);');
    expect(islandBlock).toContain('--color-rt-page: #fbf9f4;');
    expect(islandBlock).toContain('--cl-text-token-rt-ink: initial;');
  });
});
