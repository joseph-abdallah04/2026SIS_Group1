import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ApplyPlan, EMPTY_PLAN, formatPlan, renderApplyScript } from './script';

const CSS = [
  "@import 'tailwindcss';",
  '',
  '@theme {',
  '  --color-rt-ink: #080c15;',
  '  --color-rt-secondary: #e0a33c;',
  '}',
  '',
  '.rt-card {',
  '  box-shadow: 0 8px 24px rgba(8, 12, 21, 0.12);',
  '}',
  '',
].join('\n');

const TSX = [
  'export const A = () => <b className="bg-rt-secondary text-rt-ink hover:bg-rt-secondary/10">x</b>;',
  "export const INK = '#080C15';",
  '',
].join('\n');

const STRAY = 'export const B = () => <i className="bg-rt-secondary" />;\n';

const LOGO = '<svg><path fill="black" d="M0 0"/></svg>\n';

const plan: ApplyPlan = {
  copies: [{ from: 'packages/shared/logo.svg', to: 'packages/shared/logo-dark.svg' }],
  edits: [
    {
      file: 'packages/shared/logo-dark.svg',
      line: 1,
      col: 18,
      olds: ['black'],
      new: '#eceef3',
      nth: 0,
      anchor: '<svg><path fill="black" d="M0 0"/></svg>',
    },
    {
      file: 'apps/web/src/index.css',
      line: 4,
      col: 19,
      olds: ['#080c15'],
      new: '#101828',
      nth: 0,
      anchor: '--color-rt-ink: #080c15;',
    },
    {
      file: 'apps/web/src/index.css',
      line: 9,
      col: 26,
      olds: ['rgba(8, 12, 21, 0.12)'],
      new: 'rgba(16, 24, 40, 0.12)',
      nth: 0,
      anchor: 'box-shadow: 0 8px 24px rgba(8, 12, 21, 0.12);',
    },
    {
      file: 'apps/web/src/features/a/A.tsx',
      line: 2,
      col: 21,
      olds: ['#080C15'],
      new: '#101828',
      nth: 0,
      anchor: "export const INK = '#080C15';",
    },
    {
      file: 'apps/web/src/features/gone/Gone.tsx',
      line: 1,
      col: 1,
      olds: ['#fff'],
      new: '#000',
      nth: 0,
      anchor: 'x',
    },
  ],
  theme: {
    file: 'apps/web/src/index.css',
    entries: [{ name: '--color-rt-secondary-fill', value: '#8a5c12' }],
  },
  blocks: [
    {
      file: 'apps/web/src/index.css',
      marker: 'dark',
      text: ":root[data-theme='dark'] { --color-rt-ink: #eceef3; }",
    },
  ],
  classes: [
    {
      rule: {
        from: 'rt-secondary',
        to: 'rt-secondary-fill',
        prefixes: 'bg|from|via|to|fill|accent',
        alphas: null,
      },
      files: [{ file: 'apps/web/src/features/a/A.tsx', expected: 2 }],
      seen: ['apps/web/src/features/a/A.tsx', 'apps/web/src/features/d/D.tsx'],
    },
  ],
  created: ['apps/web/src/features/c/New.tsx'],
  scan: ['apps/web/src'],
  watch: [{ old: '#080c15', new: '#101828' }],
};

let dir = '';
const put = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const get = (file: string): string => fs.readFileSync(path.join(dir, file), 'utf8');
const run = (...args: string[]): string => {
  const result = spawnSync(process.execPath, ['colour-lab-apply.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colour-lab-apply-'));
  put('apps/web/src/index.css', CSS);
  put('apps/web/src/features/a/A.tsx', TSX);
  put('apps/web/src/features/b/B.tsx', STRAY);
  put(
    'apps/web/src/features/c/New.tsx',
    'export const C = () => <i className="bg-rt-secondary" />;',
  );
  put(
    'apps/web/src/features/d/D.tsx',
    'export const D = () => <i className="bg-rt-secondary/50" />;',
  );
  put('apps/web/src/features/a/A.test.tsx', 'expect(color).toBe("#080C15");');
  put('apps/web/src/features/b/B.test.tsx', 'expect(el).toHaveClass("bg-rt-secondary/50");');
  put('packages/shared/logo.svg', LOGO);
  put('colour-lab-apply.mjs', renderApplyScript(plan));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the apply script', () => {
  it('carries out the plan and reports what it did', () => {
    const report = run();
    const css = get('apps/web/src/index.css');
    expect(css).toContain('--color-rt-ink: #101828;');
    expect(css).toContain('box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12);');
    expect(css).toContain('  --color-rt-secondary-fill: #8a5c12;');
    expect(css).toContain(
      "/* colour-lab:dark begin */\n:root[data-theme='dark'] { --color-rt-ink: #eceef3; }\n/* colour-lab:dark end */",
    );
    expect(get('apps/web/src/features/a/A.tsx')).toBe(
      [
        'export const A = () => <b className="bg-rt-secondary-fill text-rt-ink hover:bg-rt-secondary-fill/10">x</b>;',
        "export const INK = '#101828';",
        '',
      ].join('\n'),
    );

    expect(report).toContain('APPLIED  apps/web/src/index.css:4:19  #080c15 -> #101828');
    expect(report).toContain('SKIPPED  apps/web/src/features/gone/Gone.tsx:1:1');
    expect(report).toContain('the file is not on this branch');
    expect(report).toContain('THEME    + --color-rt-secondary-fill');
    expect(report).toContain('x2 (expected 2)');
    expect(report).toMatch(/STRAY\s+apps\/web\/src\/features\/b\/B\.tsx\s+1 x rt-secondary/);
    // A file the prompt creates takes the same move; a file the lab saw at another opacity is no stray.
    expect(report).toContain(
      'New.tsx  rt-secondary -> rt-secondary-fill  x1 (a file this prompt creates)',
    );
    expect(report).not.toContain('D.tsx');
    expect(get('apps/web/src/features/c/New.tsx')).toContain('bg-rt-secondary-fill');
    // A test that holds an old value is found, whatever the case it is written in.
    expect(report).toContain(
      'TEST     apps/web/src/features/a/A.test.tsx:1  has #080c15, which is now #101828',
    );
    // A test that names the class is told apart, and a use at an opacity nobody listed is still found.
    expect(report).toMatch(
      /TEST\s+apps\/web\/src\/features\/b\/B\.test\.tsx\s+1 x rt-secondary: a test/,
    );
    expect(report).toContain('SUMMARY  applied 4, already done 0, skipped 1');
  });

  it('makes a copy and edits the copy, leaving the original alone', () => {
    const report = run();
    expect(get('packages/shared/logo.svg')).toBe(LOGO);
    expect(get('packages/shared/logo-dark.svg')).toBe(
      '<svg><path fill="#eceef3" d="M0 0"/></svg>\n',
    );
    expect(report).toContain('COPY     packages/shared/logo.svg -> packages/shared/logo-dark.svg');
  });

  it('writes nothing when it is only checking', () => {
    const report = run('--check');
    expect(report).toContain('check only');
    expect(get('apps/web/src/index.css')).toBe(CSS);
    expect(get('apps/web/src/features/a/A.tsx')).toBe(TSX);
    expect(report).toContain('files that would change 4');
  });

  it('changes nothing the second time', () => {
    run();
    const once = get('apps/web/src/index.css');
    const report = run();
    expect(get('apps/web/src/index.css')).toBe(once);
    expect(report).toContain('already done 4');
    expect(report).toContain('THEME    = --color-rt-secondary-fill');
    expect(report).toContain('already done (x2)');
    expect(report).toContain('BLOCK    dark is already in');
    expect(report).not.toContain('MISMATCH');
  });

  it('says when the count of a class is not the one the lab saw', () => {
    put('apps/web/src/features/a/A.tsx', TSX + 'const more = "bg-rt-secondary";\n');
    expect(run()).toContain('x3 (expected 2)  MISMATCH');
  });
});

describe('formatPlan', () => {
  it('writes one edit to a line, and is valid JSON', () => {
    const text = formatPlan(plan);
    expect(text.split('\n').length).toBeGreaterThan(plan.edits.length);
    expect(JSON.parse(text)).toEqual(plan);
  });

  it('writes an empty plan', () => {
    expect(JSON.parse(formatPlan(EMPTY_PLAN))).toEqual(EMPTY_PLAN);
  });
});
