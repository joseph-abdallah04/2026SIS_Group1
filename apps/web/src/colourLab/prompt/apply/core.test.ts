import { describe, expect, it } from 'vitest';

import {
  addToTheme,
  applyEdits,
  classPattern,
  countClasses,
  locate,
  renameClasses,
  setBlock,
  type ClassRule,
  type TextEdit,
} from './core';

const edit = (
  over: Partial<TextEdit> & Pick<TextEdit, 'line' | 'col' | 'olds' | 'new'>,
): TextEdit => ({
  file: 'a.css',
  nth: 0,
  anchor: '',
  ...over,
});

describe('locate', () => {
  const lines = ['.a {', '  color: #080c15;', '  box-shadow: 0 1px #080c15, 0 2px #080c15;', '}'];

  it('finds the text where the lab saw it', () => {
    const found = locate(
      lines,
      edit({ line: 2, col: 10, olds: ['#080c15'], new: '#101828', anchor: 'color: #080c15;' }),
    );
    expect(found).toEqual({ line: 1, start: 9, old: '#080c15' });
  });

  it('finds the line again when the file has moved under it', () => {
    const moved = ['/* new header */', '', ...lines];
    const found = locate(
      moved,
      edit({ line: 2, col: 10, olds: ['#080c15'], new: '#101828', anchor: 'color: #080c15;' }),
    );
    expect(found).toEqual({ line: 3, start: 9, old: '#080c15' });
  });

  it('picks the right one of several on a line, by which it is', () => {
    const anchor = 'box-shadow: 0 1px #080c15, 0 2px #080c15;';
    const second = locate(
      moved(),
      edit({ line: 3, col: 99, olds: ['#080c15'], nth: 1, new: 'x', anchor }),
    );
    expect(second).toMatchObject({ line: 3, start: 35 });
    function moved() {
      return ['', ...lines];
    }
  });

  it('accepts any of the texts it was told might be there', () => {
    const found = locate(
      ['  color: #112233;'],
      edit({ line: 1, col: 10, olds: ['#080c15', '#112233'], new: '#abcdef' }),
    );
    expect(found).toMatchObject({ old: '#112233' });
  });

  it('does not take the front of a longer colour for a short one', () => {
    expect(
      locate(['color: #ffffff;'], edit({ line: 1, col: 8, olds: ['#fff'], new: '#000' })),
    ).toBeNull();
  });

  it('knows an edit that is already made, even when the new text begins with the old', () => {
    const done = locate(
      ['color: #ffffff;'],
      edit({ line: 1, col: 8, olds: ['#fff'], new: '#ffffff' }),
    );
    expect(done).toBe('already');
  });

  it('gives up on a line that is not there', () => {
    expect(
      locate(
        lines,
        edit({ line: 2, col: 10, olds: ['#999999'], new: '#000000', anchor: 'color: #999999;' }),
      ),
    ).toBeNull();
  });
});

describe('applyEdits', () => {
  const text = [
    '.a {',
    '  color: #080c15;',
    '  box-shadow: 0 1px rgba(8, 12, 21, 0.12), 0 2px rgba(8, 12, 21, 0.12);',
    '}',
    '',
  ].join('\n');

  it('changes each place, right to left, so one edit does not move the next', () => {
    const result = applyEdits(text, [
      edit({
        line: 3,
        col: 28,
        olds: ['rgba(8, 12, 21, 0.12)'],
        new: 'rgba(16, 24, 40, 0.12)',
        nth: 0,
        anchor: 'box-shadow: 0 1px rgba(8, 12, 21, 0.12), 0 2px rgba(8, 12, 21, 0.12);',
      }),
      edit({
        line: 3,
        col: 56,
        olds: ['rgba(8, 12, 21, 0.12)'],
        new: 'rgba(1, 1, 1, 0.12)',
        nth: 1,
        anchor: 'box-shadow: 0 1px rgba(8, 12, 21, 0.12), 0 2px rgba(8, 12, 21, 0.12);',
      }),
      edit({ line: 2, col: 10, olds: ['#080c15'], new: '#101828', anchor: 'color: #080c15;' }),
    ]);
    expect(result.applied).toHaveLength(3);
    expect(result.text).toBe(
      [
        '.a {',
        '  color: #101828;',
        '  box-shadow: 0 1px rgba(16, 24, 40, 0.12), 0 2px rgba(1, 1, 1, 0.12);',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('reports what it cannot place, and leaves the rest to be done', () => {
    const result = applyEdits(text, [
      edit({ line: 2, col: 10, olds: ['#080c15'], new: '#101828', anchor: 'color: #080c15;' }),
      edit({ line: 9, col: 1, olds: ['#abcdef'], new: '#000000', anchor: 'nothing like this' }),
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/not in the file/);
  });

  it('does nothing the second time', () => {
    const e = edit({
      line: 2,
      col: 10,
      olds: ['#080c15'],
      new: '#101828',
      anchor: 'color: #080c15;',
    });
    const once = applyEdits(text, [e]);
    const twice = applyEdits(once.text, [e]);
    expect(twice.text).toBe(once.text);
    expect(twice.already).toHaveLength(1);
    expect(twice.applied).toHaveLength(0);
  });

  it('keeps the line endings of a CRLF file', () => {
    const crlf = '.a {\r\n  color: #080c15;\r\n}\r\n';
    const result = applyEdits(crlf, [
      edit({ line: 2, col: 10, olds: ['#080c15'], new: '#101828', anchor: 'color: #080c15;' }),
    ]);
    expect(result.text).toBe('.a {\r\n  color: #101828;\r\n}\r\n');
  });

  it('will not make two edits over the same text', () => {
    const e = edit({
      line: 2,
      col: 10,
      olds: ['#080c15'],
      new: '#101828',
      anchor: 'color: #080c15;',
    });
    const result = applyEdits(text, [e, { ...e, new: '#ffffff' }]);
    expect(result.applied).toHaveLength(1);
    expect(result.skipped[0]?.reason).toMatch(/overlaps/);
  });
});

describe('addToTheme', () => {
  const css = [
    "@import 'tailwindcss';",
    '',
    '@theme {',
    '  --color-rt-ink: #080c15; /* main text */',
    '  --color-rt-surface: #ffffff;',
    "  --font-sans: 'Inter', system-ui;",
    '}',
    '',
    'body { color: var(--color-rt-ink); }',
    '',
  ].join('\n');

  it('adds the colours after the last colour in the block', () => {
    const result = addToTheme(css, [
      { name: '--color-rt-ink-fill', value: '#07080b', note: 'ink as a solid fill' },
      { name: '--color-red-600-text', value: '#ff7a7f' },
    ]);
    expect(result.added).toEqual(['--color-rt-ink-fill', '--color-red-600-text']);
    expect(result.text).toBe(
      [
        "@import 'tailwindcss';",
        '',
        '@theme {',
        '  --color-rt-ink: #080c15; /* main text */',
        '  --color-rt-surface: #ffffff;',
        '  --color-rt-ink-fill: #07080b; /* ink as a solid fill */',
        '  --color-red-600-text: #ff7a7f;',
        "  --font-sans: 'Inter', system-ui;",
        '}',
        '',
        'body { color: var(--color-rt-ink); }',
        '',
      ].join('\n'),
    );
  });

  it('leaves a name that is already there, and says if its value is different', () => {
    const result = addToTheme(css, [
      { name: '--color-rt-surface', value: '#FFFFFF' },
      { name: '--color-rt-ink', value: '#101828' },
    ]);
    expect(result.text).toBe(css);
    expect(result.present).toEqual(['--color-rt-surface']);
    expect(result.conflicts).toEqual([
      { name: '--color-rt-ink', have: '#080c15', want: '#101828' },
    ]);
  });

  it('adds lines to a file that uses CRLF with CRLF, so no file ends up with two kinds', () => {
    const crlf = css.replace(/\n/g, '\r\n');
    const result = addToTheme(crlf, [{ name: '--color-rt-ink-fill', value: '#07080b' }]);
    expect(result.text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(result.text).toContain(
      '--color-rt-surface: #ffffff;\r\n  --color-rt-ink-fill: #07080b;\r\n',
    );
  });

  it('says so when there is no theme block', () => {
    expect(addToTheme('body {}', [{ name: '--color-x', value: '#fff' }]).error).toMatch(/@theme/);
  });

  it('is not fooled by a brace in a comment', () => {
    const tricky = '@theme {\n  /* } */\n  --color-rt-ink: #080c15;\n}\n';
    expect(addToTheme(tricky, [{ name: '--color-rt-ink-fill', value: '#000000' }]).added).toEqual([
      '--color-rt-ink-fill',
    ]);
  });
});

describe('setBlock', () => {
  it('appends the block, and then replaces it rather than adding a second', () => {
    const once = setBlock('a { color: red; }\n', 'dark', ':root { --x: 1; }');
    expect(once).toBe(
      'a { color: red; }\n\n/* colour-lab:dark begin */\n:root { --x: 1; }\n/* colour-lab:dark end */\n',
    );
    const twice = setBlock(once, 'dark', ':root { --x: 2; }\n');
    expect(twice).toBe(
      'a { color: red; }\n\n/* colour-lab:dark begin */\n:root { --x: 2; }\n/* colour-lab:dark end */\n',
    );
    expect(twice.match(/colour-lab:dark begin/g)).toHaveLength(1);
  });

  it('writes a block with the file’s own line ending, the first time and when it is replaced', () => {
    const once = setBlock('a { color: red; }\r\n', 'dark', ':root {\n  --x: 1;\n}');
    expect(once.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const twice = setBlock(once, 'dark', ':root {\n  --x: 2;\n}');
    expect(twice.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(twice).toContain('--x: 2;');
    expect(twice).not.toContain('--x: 1;');
  });

  it('keeps blocks with different names apart', () => {
    const a = setBlock('', 'one', 'x');
    const b = setBlock(a, 'two', 'y');
    expect(b).toContain('colour-lab:one begin');
    expect(b).toContain('colour-lab:two begin');
  });
});

describe('renaming classes', () => {
  const fill: ClassRule = {
    from: 'rt-ink',
    to: 'rt-ink-fill',
    prefixes: 'bg|from|via|to|fill|accent',
    alphas: null,
  };

  it('renames the utilities of a role and no others', () => {
    const source =
      '"bg-rt-ink text-rt-ink hover:bg-rt-ink/10 border-rt-ink from-rt-ink bg-rt-ink-muted"';
    const result = renameClasses(source, fill);
    expect(result.text).toBe(
      '"bg-rt-ink-fill text-rt-ink hover:bg-rt-ink-fill/10 border-rt-ink from-rt-ink-fill bg-rt-ink-muted"',
    );
    expect(result.count).toBe(3);
  });

  it('can be limited to some opacities, where one is 1 for none', () => {
    const wash: ClassRule = { ...fill, to: 'rt-ink-fill-soft', alphas: [0.1, 0.2] };
    const solid: ClassRule = { ...fill, alphas: [1, 0.6] };
    const source = 'bg-rt-ink/10 bg-rt-ink/20 bg-rt-ink/[0.2] bg-rt-ink bg-rt-ink/60 bg-rt-ink/30';
    expect(renameClasses(source, wash).text).toBe(
      'bg-rt-ink-fill-soft/10 bg-rt-ink-fill-soft/20 bg-rt-ink-fill-soft/[0.2] bg-rt-ink bg-rt-ink/60 bg-rt-ink/30',
    );
    expect(renameClasses(source, solid).text).toBe(
      'bg-rt-ink/10 bg-rt-ink/20 bg-rt-ink/[0.2] bg-rt-ink-fill bg-rt-ink-fill/60 bg-rt-ink/30',
    );
  });

  it('does not take a longer name or a longer class for the one it is looking for', () => {
    expect(renameClasses('bg-rt-ink-faint xbg-rt-ink bg-rt-inky', fill).count).toBe(0);
  });

  it('reads border, ring and divide as border utilities', () => {
    const border: ClassRule = {
      from: 'red-600',
      to: 'red-600-border',
      prefixes: 'border(?:-[xytblrse])?|ring-offset|ring|outline|stroke|divide',
      alphas: null,
    };
    const result = renameClasses(
      'border-red-600 border-t-red-600 ring-red-600/40 ring-offset-red-600 bg-red-600',
      border,
    );
    expect(result.text).toBe(
      'border-red-600-border border-t-red-600-border ring-red-600-border/40 ring-offset-red-600-border bg-red-600',
    );
  });

  it('counts what it would cover, for finding the ones nobody listed', () => {
    expect(countClasses('bg-rt-ink bg-rt-ink/10 text-rt-ink', fill)).toBe(2);
  });

  it('builds a pattern that escapes the name', () => {
    expect(classPattern({ from: 'a.b', prefixes: 'bg' }).test('bg-axb')).toBe(false);
  });
});
