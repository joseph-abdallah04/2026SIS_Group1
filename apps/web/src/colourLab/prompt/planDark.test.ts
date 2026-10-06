import { describe, expect, it } from 'vitest';

import { inputsWith } from './fixtures';
import { type PromptInputs } from './inputs';
import { planDark, variableName } from './planDark';

const custom = (hex: string) => ({ kind: 'custom' as const, hex });
const dark = (tweak?: { edits?: PromptInputs['edits'] }) => planDark(inputsWith(tweak?.edits));

describe('variableName', () => {
  it('names a colour by what it is, where it is used and how see-through it is', () => {
    expect(variableName('hex:#fff7e8', 'fill', 1)).toBe('--rt-lit-fff7e8-fill');
    expect(variableName('hex:#080c15', 'shadow', 0.12)).toBe('--rt-lit-080c15-shadow-a120');
    expect(variableName('hex:#e0a33c', 'other', 0.285)).toBe('--rt-lit-e0a33c-other-a285');
  });
});

describe('planDark', () => {
  const plan = dark();

  it('sets on the root every brand and palette colour that is another colour in the dark', () => {
    const ink = plan.colours.find((c) => c.slot === 'token:rt-ink');
    expect(ink?.name).toBe('--color-rt-ink');
    expect(plan.css).toContain('--color-rt-ink: #eceef3;');
    expect(plan.css).toContain('--color-rt-surface: #1c1f26;');
    expect(plan.css).toContain("[data-theme='dark'] {\n  color-scheme: dark;");
  });

  it('gives a colour that is dark text and a dark fill a theme colour for each', () => {
    const fill = plan.roles.tokens.find((t) => t.name === 'rt-ink-fill');
    expect(fill).toMatchObject({ role: 'fill', alphas: [0.6] });
    expect(plan.css).toContain('--color-rt-ink-fill: #07080b;');
    // The wash over a dark page is light, the same as the colour itself, so it needs no colour of its own.
    expect(plan.roles.tokens.some((t) => t.name === 'rt-ink-fill-soft')).toBe(false);
    expect(plan.apply.theme?.entries.find((e) => e.name === '--color-rt-ink-fill')?.value).toBe(
      '#080c15',
    );
  });

  it('turns the app’s own hardcoded colours into variables with a light value and a dark one', () => {
    expect(plan.variables.map((v) => v.name)).toEqual([
      '--rt-lit-f7f4ee-fill',
      '--rt-lit-ffffff-fill',
    ]);
    const white = plan.variables.find((v) => v.name === '--rt-lit-ffffff-fill');
    expect(white).toMatchObject({ light: '#ffffff', dark: '#1c1f26' });
    const edit = plan.apply.edits.find(
      (e) => e.file === 'apps/web/src/index.css' && e.olds[0] === '#ffffff',
    );
    expect(edit?.new).toBe('var(--rt-lit-ffffff-fill)');
  });

  it('says a colour that is the whole of a Tailwind class is a colour', () => {
    const edit = plan.apply.edits.find((e) => e.olds[0] === '#f7f4ee');
    expect(edit?.new).toBe('color:var(--rt-lit-f7f4ee-fill)');
  });

  it('leaves alone paper and what is drawn into a file, and says it did', () => {
    expect(plan.kept.map((g) => [g.file.split('/').pop(), g.verdict])).toEqual([
      ['pdf.ts', 'export'],
      ['pinboardTokens.ts', 'paper'],
    ]);
    expect(plan.apply.edits.some((e) => e.file.endsWith('pinboardTokens.ts'))).toBe(false);
    expect(plan.apply.edits.some((e) => e.file.endsWith('pdf.ts'))).toBe(false);
  });

  it('makes a dark twin of the logo and changes the copy, not the logo', () => {
    expect(plan.logo?.to).toBe('packages/shared/src/assets/roundtable-logo-dark.svg');
    expect(plan.apply.copies).toEqual([
      {
        from: 'packages/shared/src/assets/roundtable-logo.svg',
        to: 'packages/shared/src/assets/roundtable-logo-dark.svg',
      },
    ]);
    const logoEdits = plan.apply.edits.filter((e) => e.file.includes('roundtable-logo'));
    expect(logoEdits).toHaveLength(1);
    expect(logoEdits[0]).toMatchObject({
      file: 'packages/shared/src/assets/roundtable-logo-dark.svg',
      olds: ['black'],
      new: '#eceef3',
    });
  });

  it('gives the content that stays light its light values back, the same ones the dark theme changed', () => {
    const [, darkBlock = '', islands = ''] = plan.css.split('\n}\n');
    const names = (block: string) => [...block.matchAll(/^ {2}(--[\w-]+):/gm)].map((m) => m[1]);
    expect(names(islands)).toEqual(names(darkBlock));
    expect(islands).toContain('color-scheme: light;');
    expect(islands).toContain('color: var(--color-rt-ink);');
    expect(islands).toContain('--color-rt-ink: #080c15;');
    expect(islands).toContain('article:has([data-card-plate], [data-sticky-note])');
  });

  it('writes the CSS as a block that a second run replaces', () => {
    expect(plan.apply.blocks).toEqual([
      { file: 'apps/web/src/index.css', marker: 'dark-theme', text: plan.css },
    ]);
  });

  it('leaves alone a colour with no opacity, as the lab does', () => {
    const base = inputsWith();
    const white = base.catalogue.literals.find((l) => l.raw === '#ffffff')!;
    const clear = { ...white, line: 99, raw: 'rgba(255, 255, 255, 0)', alpha: 0 };
    const withClear = planDark({
      ...base,
      catalogue: { ...base.catalogue, literals: [...base.catalogue.literals, clear] },
    });
    expect(withClear.apply.edits.some((e) => e.line === 99)).toBe(false);
    expect(withClear.variables.map((v) => v.name)).toEqual(plan.variables.map((v) => v.name));
  });

  it('follows the colour chosen by hand for the dark theme', () => {
    const chosen = dark({
      edits: { light: {}, dark: { 'token:rt-surface': { base: custom('#16181d') } } },
    });
    expect(chosen.css).toContain('--color-rt-surface: #16181d;');
    expect(chosen.variables.find((v) => v.name === '--rt-lit-ffffff-fill')?.dark).toBe('#16181d');
  });

  it('counts the light changes the lab also holds, so the reader can be told to apply them first', () => {
    expect(plan.lightEdits).toBe(0);
    const both = dark({
      edits: { light: { 'token:rt-ink': { base: custom('#101828') } }, dark: {} },
    });
    expect(both.lightEdits).toBeGreaterThan(0);
  });
});
