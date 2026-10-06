import { describe, expect, it } from 'vitest';

import { isScannable, mergeScans, scanFile } from './scan';
import { scanCssSource } from './scanCss';
import { scanSvgSource } from './scanSvg';
import { scanTsSource } from './scanTs';
import { blankCssComments, blankTsComments, lineStartsOf, positionOf } from './source';

describe('source helpers', () => {
  it('finds the line and column of an offset', () => {
    const starts = lineStartsOf('ab\ncde\nf');
    expect(positionOf(starts, 0)).toEqual({ line: 1, col: 1 });
    expect(positionOf(starts, 4)).toEqual({ line: 2, col: 2 });
    expect(positionOf(starts, 7)).toEqual({ line: 3, col: 1 });
  });

  it('blanks comments without moving anything', () => {
    const css = 'a { /* #fff */ color: red; }';
    const blanked = blankCssComments(css);
    expect(blanked).toHaveLength(css.length);
    expect(blanked).not.toContain('#fff');

    const ts = 'const a = \'#fff\'; // #000\n/* #111 */ const b = "//not a comment";';
    const out = blankTsComments(ts);
    expect(out).toHaveLength(ts.length);
    expect(out).toContain("'#fff'");
    expect(out).toContain('//not a comment');
    expect(out).not.toContain('#000');
    expect(out).not.toContain('#111');
  });

  it('does not let an apostrophe in JSX text swallow the rest of the file', () => {
    const out = blankTsComments("<p>Don't</p>\nconst c = '#abcdef';");
    expect(out).toContain('#abcdef');
  });
});

const CSS = `
@import 'tailwindcss';

@theme {
  /* Brand: #123456 is only a comment */
  --color-rt-primary: #f1c881;
  --color-rt-ink: #080c15;
  --font-sans: 'Inter', system-ui, sans-serif;
}

body {
  color: var(--color-rt-ink);
}

.rt-waiting-table {
  border-radius: 50%;
  background: radial-gradient(circle at 50% 42%, #fffaf0 0%, #fdf4e5 48%, #f3e2bc 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    0 0 0 3px #f1c881;
}

.rt-landing {
  --rt-paper: #f7f4ee;
  background: url("data:image/svg+xml;utf8,<svg fill='%23ff0000'/>");
}

@keyframes rt-timer-flash {
  50% {
    color: #b42318;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rt-timer-flash {
    color: #b42318;
  }
}
`;

describe('scanCssSource', () => {
  const scan = scanCssSource('apps/web/src/index.css', CSS);

  it('reads the tokens out of @theme and not their values as literals', () => {
    expect(scan.tokens.map((t) => [t.slot, t.name, t.value])).toEqual([
      ['token:rt-primary', '--color-rt-primary', '#f1c881'],
      ['token:rt-ink', '--color-rt-ink', '#080c15'],
    ]);
    expect(scan.literals.some((l) => l.raw === '#080c15')).toBe(false);
  });

  it('finds the literals in declarations, each with its place', () => {
    const raws = scan.literals.map((l) => l.raw);
    expect(raws).toEqual([
      '#fffaf0',
      '#fdf4e5',
      '#f3e2bc',
      'rgba(255, 255, 255, 0.65)',
      '#f1c881',
      '#f7f4ee',
      '#b42318',
      '#b42318',
    ]);
    const gold = scan.literals.find((l) => l.raw === '#f1c881');
    expect(gold).toMatchObject({
      slot: 'hex:#f1c881',
      role: 'border',
      context: '.rt-waiting-table',
      file: 'apps/web/src/index.css',
    });
    expect(gold?.snippet).toBe('0 0 0 3px #f1c881;');
  });

  it('knows the role of the property and the keyframes it sits in', () => {
    const background = scan.literals.find((l) => l.raw === '#fffaf0');
    expect(background?.role).toBe('fill');
    const flash = scan.literals.filter((l) => l.raw === '#b42318');
    expect(flash.map((l) => l.context)).toEqual(['@keyframes rt-timer-flash', '.rt-timer-flash']);
    expect(flash.every((l) => l.role === 'text')).toBe(true);
  });

  it('counts a custom property as a place a colour lives', () => {
    const paper = scan.literals.find((l) => l.raw === '#f7f4ee');
    expect(paper?.context).toBe('.rt-landing');
  });

  it('ignores comments and colours inside url()', () => {
    expect(scan.literals.some((l) => l.raw === '#123456')).toBe(false);
    expect(scan.literals.some((l) => l.slot === 'hex:#ff0000')).toBe(false);
  });

  it('locates a literal by line and column', () => {
    const paper = scan.literals.find((l) => l.raw === '#f7f4ee');
    const lines = CSS.split('\n');
    expect(lines[(paper?.line ?? 1) - 1]?.slice((paper?.col ?? 1) - 1)).toMatch(/^#f7f4ee/);
  });
});

const TS = `
import { x } from './x';

// Light gold #F1C881 is Primary
export const STICKY_THEMES = {
  yellow: { bg: '#FDF4E5', border: '#F1C881' },
};

export const CARD_SHADOW = '0 2px 8px rgba(8, 12, 21, 0.08), 0 1px 2px rgba(8, 12, 21, 0.04)';

const entity = '&#039;';

export function Swatch() {
  return (
    <svg>
      <rect fill="#FFFFFF" stroke="#4D6A74" />
      <p className="bg-rt-primary text-white border-rt-tertiary bg-[#f7f4ee]">
        <span className="text-rt-ink text-rt-ink hover:text-rt-ink">x</span>
        <b className="shadow-[0_6px_24px_rgba(8,12,21,0.14)] text-red-600">y</b>
      </p>
    </svg>
  );
}
`;

describe('scanTsSource', () => {
  const scan = scanTsSource('apps/web/src/features/x/Swatch.tsx', TS);

  it('finds hex and function colours, and skips comments and entities', () => {
    expect(scan.literals.map((l) => l.raw)).toEqual([
      '#FDF4E5',
      '#F1C881',
      'rgba(8, 12, 21, 0.08)',
      'rgba(8, 12, 21, 0.04)',
      '#FFFFFF',
      '#4D6A74',
      '#f7f4ee',
      'rgba(8,12,21,0.14)',
    ]);
  });

  it('names where a constant colour lives', () => {
    const border = scan.literals.find((l) => l.raw === '#F1C881');
    expect(border).toMatchObject({ slot: 'hex:#f1c881', context: 'STICKY_THEMES · border' });
    expect(border?.role).toBe('border');
    const shadow = scan.literals.find((l) => l.raw === 'rgba(8, 12, 21, 0.08)');
    expect(shadow?.context).toBe('CARD_SHADOW');
    expect(shadow?.role).toBe('shadow');
    expect(shadow?.alpha).toBe(0.08);
  });

  it('reads the role from JSX attributes and arbitrary classes', () => {
    expect(scan.literals.find((l) => l.raw === '#FFFFFF')?.role).toBe('fill');
    expect(scan.literals.find((l) => l.raw === '#4D6A74')?.role).toBe('border');
    expect(scan.literals.find((l) => l.raw === '#f7f4ee')).toMatchObject({
      role: 'fill',
      context: 'class bg-[…]',
    });
    expect(scan.literals.find((l) => l.raw === 'rgba(8,12,21,0.14)')?.role).toBe('shadow');
  });

  it('counts the token and palette classes a file uses', () => {
    const counts: Record<string, number> = {};
    for (const c of scan.classes) counts[c.slot] = (counts[c.slot] ?? 0) + c.count;
    expect(counts).toEqual({
      'token:rt-primary': 1,
      'tw:white': 1,
      'token:rt-tertiary': 1,
      'token:rt-ink': 3,
      'tw:red-600': 1,
    });
  });

  it('does not mistake a size or a spacing utility for a colour', () => {
    const none = scanTsSource(
      'a.tsx',
      'const c = "text-sm border-2 bg-linear-to-r ring-1 text-center";',
    );
    expect(none.classes).toEqual([]);
  });
});

describe('scanSvgSource', () => {
  const svg = `<svg>
  <circle fill="white" stroke="#E0A33C" />
  <path fill='black' />
  <rect fill="none" stroke="currentColor" />
</svg>`;
  const scan = scanSvgSource('packages/shared/src/assets/roundtable-logo.svg', svg);

  it('reads colour attributes, named black and white included', () => {
    expect(scan.literals.map((l) => [l.raw, l.slot])).toEqual([
      ['white', 'hex:#ffffff'],
      ['#E0A33C', 'hex:#e0a33c'],
      ['black', 'hex:#000000'],
    ]);
    expect(scan.literals[0]?.context).toBe('fill');
    expect(scan.literals[1]?.role).toBe('image');
  });

  it('points at the value', () => {
    const lines = svg.split('\n');
    const gold = scan.literals[1];
    expect(lines[(gold?.line ?? 1) - 1]?.slice((gold?.col ?? 1) - 1)).toMatch(/^#E0A33C/);
  });
});

describe('scanFile and mergeScans', () => {
  it('chooses a scanner by extension and marks server code export-only', () => {
    expect(scanFile('apps/web/src/a.css', 'a { color: #fff; }')?.literals).toHaveLength(1);
    expect(scanFile('README.md', '#fff')).toBeNull();
    const server = scanFile('apps/server/src/pdf.ts', "const INK = '#080c15';");
    expect(server?.literals[0]?.exportOnly).toBe(true);
    expect(scanFile('apps/web/src/a.ts', "const A = '#080c15';")?.literals[0]?.exportOnly).toBe(
      false,
    );
  });

  it('says which paths are worth reading', () => {
    expect(isScannable('apps/web/src/index.css')).toBe(true);
    expect(isScannable('apps/web/src/Foo.test.tsx')).toBe(false);
    expect(isScannable('apps/web/src/colourLab/model/store.ts')).toBe(false);
    expect(isScannable('apps/web/src/vite-env.d.ts')).toBe(false);
    expect(isScannable('node_modules/x/y.css')).toBe(false);
    expect(isScannable('apps/web/src/a.png')).toBe(false);
  });

  it('merges file scans in path order', () => {
    const scans = new Map([
      ['b.css', scanCssSource('b.css', 'a { color: #222222; }')],
      ['a.css', scanCssSource('a.css', 'a { color: #111111; }')],
    ]);
    const catalogue = mergeScans(scans, { sha: null, branch: null, mergeBase: null }, 7);
    expect(catalogue.literals.map((l) => l.file)).toEqual(['a.css', 'b.css']);
    expect(catalogue.generatedAt).toBe(7);
  });
});

describe('class opacity', () => {
  it('counts a class at each opacity apart', () => {
    const scan = scanTsSource(
      'a.tsx',
      'const c = "bg-rt-ink/10 bg-rt-ink/10 bg-rt-ink bg-rt-ink/[0.4] text-rt-ink/60 hover:bg-rt-secondary/40";',
    );
    const rows = scan.classes.map((c) => [c.slot, c.role, c.alpha, c.count]);
    expect(rows).toEqual([
      ['token:rt-ink', 'fill', 0.1, 2],
      ['token:rt-ink', 'fill', 1, 1],
      ['token:rt-ink', 'fill', 0.4, 1],
      ['token:rt-ink', 'text', 0.6, 1],
      ['token:rt-secondary', 'fill', 0.4, 1],
    ]);
  });
});

describe('references to a colour variable', () => {
  const css = scanCssSource(
    'apps/web/src/index.css',
    [
      '@theme {',
      '  --color-rt-ink: #080c15;',
      '}',
      '.a {',
      '  color: var(--color-rt-ink);',
      '  background: color-mix(in oklab, var(--color-rt-secondary) 40%, transparent);',
      '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 2px var(--color-rt-secondary);',
      '  --rt-paper: var(--color-rt-surface);',
      '  border: 1px solid var(--tw-not-a-colour);',
      '}',
    ].join('\n'),
  );

  it('finds each one with its place, role and opacity', () => {
    expect(css.refs.map((r) => [r.slot, r.line, r.col, r.raw, r.role, r.alpha])).toEqual([
      ['token:rt-ink', 5, 10, 'var(--color-rt-ink)', 'text', 1],
      ['token:rt-secondary', 6, 35, 'var(--color-rt-secondary)', 'fill', 0.4],
      ['token:rt-secondary', 7, 56, 'var(--color-rt-secondary)', 'border', 1],
      ['token:rt-surface', 8, 15, 'var(--color-rt-surface)', 'fill', 1],
    ]);
    expect(css.refs[0]?.snippet).toBe('color: var(--color-rt-ink);');
    expect(css.refs[0]?.context).toBe('.a');
  });

  it('does not read a token definition as a reference', () => {
    expect(css.refs.some((r) => r.line === 2)).toBe(false);
  });

  it('finds them in TypeScript strings too', () => {
    const ts = scanTsSource(
      'apps/web/src/features/x/Bar.tsx',
      "const STRIPES = {\n  backgroundImage:\n    'repeating-linear-gradient(135deg, var(--color-rt-tertiary) 0 1.5px, transparent 1.5px 4px)',\n};\n",
    );
    expect(ts.refs).toHaveLength(1);
    // The value starts its own line, so the key is read from the line above.
    expect(ts.refs[0]).toMatchObject({
      slot: 'token:rt-tertiary',
      line: 3,
      role: 'fill',
      raw: 'var(--color-rt-tertiary)',
    });
  });

  it('is gathered into the catalogue', () => {
    const merged = mergeScans(
      new Map([['apps/web/src/index.css', css]]),
      { sha: null, branch: null, mergeBase: null },
      0,
    );
    expect(merged.refs).toHaveLength(4);
  });
});

describe('where a token is defined, and a colour that is a whole class', () => {
  it('records the column and the line of a token', () => {
    const scan = scanCssSource(
      'apps/web/src/index.css',
      '@theme {\n  --color-rt-ink: #080c15; /* main text */\n}\n',
    );
    expect(scan.tokens[0]).toMatchObject({
      slot: 'token:rt-ink',
      line: 2,
      col: 19,
      snippet: '--color-rt-ink: #080c15; /* main text */',
    });
  });

  it('marks a colour that is the whole value of a Tailwind class', () => {
    const scan = scanTsSource(
      'a.tsx',
      'const c = "bg-[#f7f4ee]/85 shadow-[0_6px_24px_rgba(8,12,21,0.14)] border-[#ff0000]";',
    );
    const flags = scan.literals.map((l) => [l.raw, l.colourClass === true]);
    expect(flags).toEqual([
      ['#f7f4ee', true],
      ['rgba(8,12,21,0.14)', false],
      ['#ff0000', true],
    ]);
  });
});
