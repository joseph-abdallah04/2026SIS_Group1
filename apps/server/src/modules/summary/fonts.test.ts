import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';

import { interFontFiles } from './fonts.js';

describe('interFontFiles', () => {
  it('finds every weight a canvas uses, from wherever the server runs', () => {
    expect(interFontFiles().map((path) => basename(path))).toEqual([
      'Inter-Regular.ttf',
      'Inter-Medium.ttf',
      'Inter-SemiBold.ttf',
      'Inter-Bold.ttf',
    ]);
  });

  it('hands resvg TrueType it can read, not a web font', () => {
    for (const path of interFontFiles()) {
      // The TrueType signature; woff2 would start "wOF2", which resvg cannot load.
      expect([...readFileSync(path).subarray(0, 4)]).toEqual([0, 1, 0, 0]);
    }
  });
});
