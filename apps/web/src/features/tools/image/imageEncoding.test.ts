import { IMAGE_ARTIFACT_LIMIT, IMAGE_MAX_EDGE } from '@roundtable/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decodeImageFile,
  ImageImportError,
  MAX_SOURCE_EDGE,
  shrinkToFit,
  type EncodeAt,
} from './imageEncoding';
import { jpegClaiming, pngClaiming, TINY_PNG } from './testImages';

/** A file holding the bytes of a data URL, as a picker or a drop would hand it over. */
function fileOf(dataUrl: string, type: string): File {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new File([bytes], 'picture', { type });
}

/** Stands in for the browser's decoder, which jsdom does not have. */
function decoderGiving(width: number, height: number) {
  const close = vi.fn();
  const decode = vi.fn(async () => ({ width, height, close }) as unknown as ImageBitmap);
  vi.stubGlobal('createImageBitmap', decode);
  return { decode, close };
}

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

describe('decodeImageFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a picture of an ordinary size', async () => {
    const { decode } = decoderGiving(1, 1);
    const decoded = await decodeImageFile(fileOf(TINY_PNG, 'image/png'));
    expect(decode).toHaveBeenCalledOnce();
    expect(decoded).toMatchObject({ width: 1, height: 1 });
  });

  // Decoding holds every pixel at once. A few kilobytes of file can ask for a
  // poster, so its header is read first and it is never decoded at all.
  it.each([
    ['a PNG', pngClaiming(20_000, 20_000), 'image/png'],
    ['a JPEG', jpegClaiming(20_000, 20_000), 'image/jpeg'],
    [
      'a panorama past the widest a phone makes',
      pngClaiming(MAX_SOURCE_EDGE + 1, 100),
      'image/png',
    ],
  ])(
    'refuses %s whose header asks for too many pixels, before decoding it',
    async (_, src, type) => {
      const { decode } = decoderGiving(1, 1);
      await expect(decodeImageFile(fileOf(src, type))).rejects.toBeInstanceOf(ImageImportError);
      expect(decode).not.toHaveBeenCalled();
    },
  );

  // A format whose size is not read up front is checked once decoded, and the
  // decoded copy is let go of rather than kept until the dialog closes.
  it('refuses a picture too large once decoded, and lets it go', async () => {
    const { close } = decoderGiving(10_000, 10_000);
    const webp = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], 'big.webp', {
      type: 'image/webp',
    });
    await expect(decodeImageFile(webp)).rejects.toBeInstanceOf(ImageImportError);
    expect(close).toHaveBeenCalledOnce();
  });
});
