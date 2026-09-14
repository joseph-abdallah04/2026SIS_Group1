import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Motion has to be escapable.
 *
 * `prefers-reduced-motion: reduce` is a stated need, not a preference — for some
 * people movement on screen causes nausea or triggers a migraine. It is also the
 * easiest thing in the world to forget when adding one more animation, so this
 * reads the stylesheet and insists every animated class has a way out.
 */
// Found by path rather than by module URL: under jsdom `import.meta.url` is not
// a file URL, and the runner is started from either the repo root or the
// workspace depending on how the suite was invoked.
const STYLESHEET = ['src/index.css', 'apps/web/src/index.css']
  .map((candidate) => join(process.cwd(), candidate))
  .find((candidate) => existsSync(candidate));

const css = STYLESHEET ? readFileSync(STYLESHEET, 'utf8') : '';

/** The bodies of every `prefers-reduced-motion: reduce` block in the sheet. */
function reducedMotionBlocks(): string {
  const blocks: string[] = [];
  const marker = '@media (prefers-reduced-motion: reduce) {';
  let from = css.indexOf(marker);
  while (from !== -1) {
    let depth = 0;
    let index = from + marker.length - 1;
    do {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    } while (depth > 0 && index < css.length);
    blocks.push(css.slice(from, index));
    from = css.indexOf(marker, index);
  }
  return blocks.join('\n');
}

/** Class names given an `animation` outside a reduced-motion block. */
function animatedClasses(): string[] {
  const escapes = reducedMotionBlocks();
  const outside = css.split('@media (prefers-reduced-motion: reduce) {')[0] ?? '';
  const rest = css
    .split('@media (prefers-reduced-motion: reduce) {')
    .slice(1)
    .map((chunk) => chunk.slice(chunk.indexOf('\n}') + 2))
    .join('\n');

  const names = new Set<string>();
  for (const source of [outside, rest]) {
    // A rule head, then a body that sets an animation.
    for (const match of source.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const [, head = '', body = ''] = match;
      if (!/\banimation\s*:/.test(body)) continue;
      if (/animation\s*:\s*none/.test(body)) continue;
      for (const selector of head.matchAll(/\.([\w-]+)/g)) names.add(selector[1]!);
    }
  }
  void escapes;
  return [...names];
}

describe('motion in the studio and on the board', () => {
  it('lets every animation be turned off', () => {
    const escapes = reducedMotionBlocks();
    const unescaped = animatedClasses().filter((name) => !escapes.includes(`.${name}`));
    expect(unescaped).toEqual([]);
  });

  it('actually has something to turn off, so the check cannot pass vacuously', () => {
    expect(animatedClasses().length).toBeGreaterThan(0);
    expect(animatedClasses()).toEqual(expect.arrayContaining(['rt-studio-rise', 'rt-studio-fade']));
  });

  it('keeps the studio entrances short enough not to be waited for', () => {
    // Toolbars come and go with every selection. Anything slower than a couple
    // of frames of settle reads as the interface lagging behind the pointer.
    for (const [, duration] of css.matchAll(/\.rt-studio-[\w-]+\s*\{[^}]*?(\d+)ms/g)) {
      expect(Number(duration)).toBeLessThanOrEqual(180);
    }
  });
});
