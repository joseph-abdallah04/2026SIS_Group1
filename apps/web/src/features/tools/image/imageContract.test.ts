import {
  IMAGE_ARTIFACT_LIMIT,
  IMAGE_MAX_EDGE,
  imagePixelSize,
  isStorableImage,
} from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { jpegClaiming, pngClaiming, TINY_JPEG, TINY_PNG, TINY_WEBP } from './testImages';

describe('isStorableImage', () => {
  it.each([
    ['a PNG', TINY_PNG],
    ['a JPEG', TINY_JPEG],
    ['a PNG at the largest size the board keeps', pngClaiming(IMAGE_MAX_EDGE, 900)],
  ])('accepts %s', (_, src) => {
    expect(isStorableImage(src)).toBe(true);
  });

  it.each([
    ['an address rather than a picture', 'https://example.com/cat.png'],
    ['an SVG, which is markup', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['a GIF, which the importer never writes', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    // Smaller, but the recap's rasteriser cannot draw it.
    ['a WebP', TINY_WEBP],
    // The label says PNG; the bytes say JPEG.
    ['a file that is not what it says', 'data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'],
    ['text after the picture', `${TINY_PNG}"><script>`],
    ['nothing at all', ''],
    // What gets decoded is what the header says, whatever the proposal claims.
    ['a PNG whose header asks for a poster', pngClaiming(20_000, 20_000)],
    ['a PNG one pixel over the limit', pngClaiming(IMAGE_MAX_EDGE + 1, 1)],
    ['a JPEG whose frame asks for a poster', jpegClaiming(20_000, 20_000)],
    ['a JPEG with no frame to say its size', 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'],
  ])('refuses %s', (_, src) => {
    expect(isStorableImage(src)).toBe(false);
  });

  it('refuses a picture over the board’s limit', () => {
    const huge = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(IMAGE_ARTIFACT_LIMIT)}`;
    expect(isStorableImage(huge)).toBe(false);
  });
});

describe('imagePixelSize', () => {
  it('reads a picture’s size from its own header', () => {
    expect(imagePixelSize(TINY_PNG)).toEqual({ width: 1, height: 1 });
    expect(imagePixelSize(TINY_JPEG)).toEqual({ width: 8, height: 8 });
    expect(imagePixelSize(pngClaiming(1200, 675))).toEqual({ width: 1200, height: 675 });
    expect(imagePixelSize(jpegClaiming(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('says nothing for what is not a readable picture', () => {
    expect(imagePixelSize('https://example.com/cat.png')).toBeNull();
    expect(imagePixelSize(TINY_WEBP)).toBeNull();
    expect(imagePixelSize(jpegClaiming(0, 480))).toBeNull();
  });
});
