import { IMAGE_ARTIFACT_LIMIT, isStorableImage } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { TINY_PNG, TINY_WEBP } from './testImages';

/** The start of a JPEG: its signature is all the check reads. */
const JPEG_HEAD = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';

describe('isStorableImage', () => {
  it.each([
    ['a PNG', TINY_PNG],
    ['a JPEG', JPEG_HEAD],
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
  ])('refuses %s', (_, src) => {
    expect(isStorableImage(src)).toBe(false);
  });

  it('refuses a picture over the board’s limit', () => {
    const huge = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(IMAGE_ARTIFACT_LIMIT)}`;
    expect(isStorableImage(huge)).toBe(false);
  });
});
