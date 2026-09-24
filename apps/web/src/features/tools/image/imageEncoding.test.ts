import { IMAGE_ARTIFACT_LIMIT, IMAGE_MAX_EDGE } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { ImageImportError, shrinkToFit, type EncodeAt } from './imageEncoding';

/** An encoder that produces a data URL of a chosen length for each call. */
function encoderReturning(lengths: number[]): EncodeAt & { calls: [number, number, number][] } {
  const calls: [number, number, number][] = [];
  const encode = vi.fn(async (width: number, height: number, quality: number) => {
    calls.push([width, height, quality]);
    return 'x'.repeat(lengths[calls.length - 1] ?? 1);
  }) as unknown as EncodeAt & { calls: [number, number, number][] };
  encode.calls = calls;
  return encode;
}

describe('shrinkToFit', () => {
  it('keeps a small picture its own size, at the best quality that fits', async () => {
    const encode = encoderReturning([1000]);
    const result = await shrinkToFit({ width: 800, height: 600 }, encode);
    expect(result).toMatchObject({ width: 800, height: 600 });
    expect(encode.calls).toEqual([[800, 600, 0.86]]);
  });

  it('never stores a picture larger than the board keeps', async () => {
    const encode = encoderReturning([1000]);
    const result = await shrinkToFit({ width: 4000, height: 3000 }, encode);
    expect(result).toMatchObject({ width: IMAGE_MAX_EDGE, height: 1200 });
  });

  // A slightly softer photo reads the same on a card; a smaller one does not.
  it('gives up quality before it gives up size', async () => {
    const tooBig = IMAGE_ARTIFACT_LIMIT + 1;
    const encode = encoderReturning([tooBig, tooBig, 1000]);
    const result = await shrinkToFit({ width: 1000, height: 1000 }, encode);
    expect(encode.calls.map(([width, , quality]) => [width, quality])).toEqual([
      [1000, 0.86],
      [1000, 0.78],
      [1000, 0.7],
    ]);
    expect(result.width).toBe(1000);
  });

  it('makes the picture smaller once no quality fits', async () => {
    const tooBig = IMAGE_ARTIFACT_LIMIT + 1;
    const encode = encoderReturning([tooBig, tooBig, tooBig, tooBig, 1000]);
    const result = await shrinkToFit({ width: 1000, height: 1000 }, encode);
    expect(result).toMatchObject({ width: 750, height: 750 });
  });

  it('refuses a picture that will not fit even small', async () => {
    const encode = vi.fn(async () => 'x'.repeat(IMAGE_ARTIFACT_LIMIT + 1));
    await expect(shrinkToFit({ width: 1000, height: 1000 }, encode)).rejects.toBeInstanceOf(
      ImageImportError,
    );
  });
});
