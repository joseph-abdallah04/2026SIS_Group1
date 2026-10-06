import { describe, expect, it } from 'vitest';

import { type SchemeEdits } from '../model/spec';
import { inputsWith } from './fixtures';
import { buildDarkPrompt } from './renderDark';
import { buildLightPrompt } from './renderLight';

/**
 * The prompts, written out in full for a fixed app and fixed edits, and kept in `__golden__`.
 * A prompt is an instruction to someone who cannot ask what was meant, so a change to what it
 * says should be a change someone reads. If one of these fails and the new text is right, run
 * `npx vitest run src/colourLab/prompt -u` and read the diff to the golden file.
 */
const custom = (hex: string) => ({ kind: 'custom' as const, hex });

const LIGHT: SchemeEdits = {
  'token:rt-ink': { base: custom('#101828') },
  'token:rt-secondary': { roles: { fill: custom('#8a5c12') } },
  'tw:red-600': { base: custom('#c0392b') },
};

describe('the light prompt', () => {
  it('for a token, a role and a palette colour', async () => {
    const result = buildLightPrompt(inputsWith({ light: LIGHT, dark: {} }));
    expect(result.empty).toBe(false);
    expect(result.filename).toBe('roundtable-colours-light-2026-10-06.txt');
    await expect(result.text).toMatchFileSnapshot('./__golden__/light.txt');
  });

  it('for nothing at all', async () => {
    const result = buildLightPrompt(inputsWith());
    expect(result.empty).toBe(true);
    await expect(result.text).toMatchFileSnapshot('./__golden__/light-empty.txt');
  });
});

describe('the dark prompt', () => {
  it('for the lab’s own dark palette, as it comes', async () => {
    const result = buildDarkPrompt(inputsWith());
    expect(result.empty).toBe(false);
    expect(result.filename).toBe('roundtable-colours-dark-2026-10-06.txt');
    await expect(result.text).toMatchFileSnapshot('./__golden__/dark.txt');
  });

  it('and with light changes too, and a dark colour chosen by hand', async () => {
    const result = buildDarkPrompt(
      inputsWith({
        light: LIGHT,
        dark: { 'token:rt-surface': { base: custom('#16181d') } },
      }),
    );
    await expect(result.text).toMatchFileSnapshot('./__golden__/dark-with-light-edits.txt');
  });
});
