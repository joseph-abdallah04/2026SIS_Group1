import { describe, expect, it } from 'vitest';

import { type SchemeEdits } from '../model/spec';
import { inputsWith } from './fixtures';
import { planLight } from './planLight';

const light = (edits: SchemeEdits) => planLight(inputsWith({ light: edits, dark: {} }));
const custom = (hex: string) => ({ kind: 'custom' as const, hex });

describe('planLight', () => {
  it('has nothing to say when nothing was changed', () => {
    const plan = light({});
    expect(plan.apply.edits).toEqual([]);
    expect(plan.apply.theme).toBeNull();
    expect(plan.apply.classes).toEqual([]);
    expect(plan.stats).toEqual({
      tokens: 0,
      palette: 0,
      roleTokens: 0,
      literals: 0,
      refs: 0,
      classUses: 0,
    });
    expect(plan.warnings).toEqual([]);
  });

  describe('a brand token', () => {
    const plan = light({ 'token:rt-ink': { base: custom('#101828') } });

    it('is changed on the line that defines it', () => {
      expect(plan.tokens).toEqual([
        {
          slot: 'token:rt-ink',
          name: '--color-rt-ink',
          from: '#080c15',
          to: '#101828',
          file: 'apps/web/src/index.css',
          line: 13,
        },
      ]);
      const edit = plan.apply.edits.find(
        (e) => e.file === 'apps/web/src/index.css' && e.line === 13,
      );
      expect(edit).toMatchObject({
        olds: ['#080c15'],
        new: '#101828',
        col: 19,
        anchor: '--color-rt-ink: #080c15;',
      });
    });

    it('takes its hardcoded copies with it, each in the way it was written', () => {
      const by = (file: string, line: number) =>
        plan.apply.edits.find((e) => e.file === file && e.line === line);
      // rgba with spaces keeps them, and the alpha is untouched
      expect(by('apps/web/src/index.css', 20)).toMatchObject({
        olds: ['rgba(8, 12, 21, 0.12)'],
        new: 'rgba(16, 24, 40, 0.12)',
      });
      // inside a Tailwind class there are no spaces, and there must not be
      expect(by('apps/web/src/features/marketing/cta.ts', 4)).toMatchObject({
        olds: ['rgba(8,12,21,0.14)'],
        new: 'rgba(16,24,40,0.14)',
      });
      // a constant written in capitals stays in capitals
      expect(by('apps/web/src/features/pinboard/pinboardTokens.ts', 12)).toMatchObject({
        olds: ['#080C15'],
        new: '#101828',
      });
      // a copy that is only drawn into an exported file is included, and is said to be
      expect(by('apps/server/src/modules/summary/pdf.ts', 12)).toMatchObject({
        olds: ['#080c15'],
        new: '#101828',
      });
      expect(plan.literals.find((l) => l.literal.file.endsWith('pdf.ts'))?.kind.verdict).toBe(
        'export',
      );
    });

    it('leaves alone what is a different colour', () => {
      expect(plan.apply.edits.some((e) => e.olds[0] === '#FDF4E5')).toBe(false);
      expect(plan.apply.edits.some((e) => e.olds[0] === '#e0a33c')).toBe(false);
    });

    it('needs no new theme colours and no class changes', () => {
      expect(plan.apply.theme).toBeNull();
      expect(plan.apply.classes).toEqual([]);
    });
  });

  describe('a colour that is set apart as a fill', () => {
    const plan = light({ 'token:rt-secondary': { roles: { fill: custom('#8a5c12') } } });

    it('gets a theme colour of its own', () => {
      expect(plan.roles.tokens).toHaveLength(1);
      expect(plan.roles.tokens[0]).toMatchObject({
        slot: 'token:rt-secondary',
        role: 'fill',
        name: 'rt-secondary-fill',
        alphas: [0.1, 1],
      });
      expect(plan.apply.theme).toEqual({
        file: 'apps/web/src/index.css',
        entries: [
          { name: '--color-rt-secondary-fill', value: '#8a5c12', note: 'rt-secondary as fill' },
        ],
      });
    });

    it('moves the fill classes, with how many the lab counted in each file', () => {
      expect(plan.apply.classes).toHaveLength(1);
      const { rule, files } = plan.apply.classes[0] ?? { rule: null, files: [] };
      expect(rule).toMatchObject({
        from: 'rt-secondary',
        to: 'rt-secondary-fill',
        alphas: [0.1, 1],
      });
      expect(rule?.prefixes).toBe('bg|from|via|to|fill|accent|placeholder');
      expect(files).toEqual([
        { file: 'apps/web/src/features/a/A.tsx', expected: 5 },
        { file: 'apps/web/src/features/b/B.tsx', expected: 4 },
      ]);
    });

    it('moves the var() references that are fills, and only those', () => {
      const refs = plan.apply.edits.filter((e) => e.olds[0]?.startsWith('var('));
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        line: 40,
        olds: ['var(--color-rt-secondary)'],
        new: 'var(--color-rt-secondary-fill)',
      });
    });

    it('does not change the colour anywhere it is not a fill', () => {
      expect(plan.apply.edits.some((e) => e.olds[0] === '#e0a33c')).toBe(false);
      expect(plan.tokens).toEqual([]);
    });
  });

  describe('a Tailwind palette colour', () => {
    it('is added to the theme, since the repository does not define it', () => {
      const plan = light({ 'tw:red-600': { base: custom('#c0392b') } });
      expect(plan.palette).toHaveLength(1);
      expect(plan.palette[0]).toMatchObject({ name: '--color-red-600', to: '#c0392b' });
      expect(plan.apply.theme?.entries).toEqual([
        { name: '--color-red-600', value: '#c0392b', note: expect.stringContaining('Tailwind') },
      ]);
    });
  });

  describe('a copy that is told to stay as it was', () => {
    it('is not changed when its token is', () => {
      const plan = light({
        'token:rt-ink': { base: custom('#101828') },
        'hex:#080c15': { base: { kind: 'original' } },
      });
      expect(plan.apply.edits.map((e) => e.file)).toEqual(['apps/web/src/index.css']);
      expect(plan.literals).toEqual([]);
    });
  });

  it('leaves alone a colour with no opacity, which shows nothing and which the lab leaves alone', () => {
    const base = inputsWith({ light: { 'token:rt-ink': { base: custom('#101828') } }, dark: {} });
    const clear = { ...base.catalogue.literals[0]!, line: 99, raw: 'rgba(8, 12, 21, 0)', alpha: 0 };
    const inputs = {
      ...base,
      catalogue: { ...base.catalogue, literals: [...base.catalogue.literals, clear] },
    };
    const plan = planLight(inputs);
    expect(plan.apply.edits.some((e) => e.line === 99)).toBe(false);
    // The same colour with some opacity is still changed.
    expect(plan.apply.edits.some((e) => e.olds[0] === 'rgba(8, 12, 21, 0.12)')).toBe(true);
  });

  it('puts a changed colour back as nothing to do', () => {
    const plan = light({ 'token:rt-ink': { base: custom('#080c15') } });
    expect(plan.apply.edits).toEqual([]);
  });

  it('reports a token whose value it cannot read', () => {
    const inputs = inputsWith({ light: { 'token:rt-ink': { base: custom('#101828') } }, dark: {} });
    const broken = {
      ...inputs,
      catalogue: {
        ...inputs.catalogue,
        tokens: inputs.catalogue.tokens.map((t) =>
          t.slot === 'token:rt-ink' ? { ...t, value: 'var(--other)' } : t,
        ),
      },
    };
    expect(planLight(broken).warnings[0]).toMatch(/--color-rt-ink/);
  });
});
