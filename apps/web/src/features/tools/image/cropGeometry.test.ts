import { describe, expect, it } from 'vitest';

import {
  fullCrop,
  isFullCrop,
  MIN_CROP,
  moveCrop,
  resizeCrop,
  type CropRect,
} from './cropGeometry';

const PHOTO = { width: 1200, height: 800 };

describe('crop geometry', () => {
  it('starts from the whole picture', () => {
    expect(fullCrop(PHOTO)).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
    expect(isFullCrop(fullCrop(PHOTO), PHOTO)).toBe(true);
  });

  it('moves a frame without letting it leave the picture', () => {
    const crop: CropRect = { x: 100, y: 100, width: 400, height: 300 };
    expect(moveCrop(crop, 50, -20, PHOTO)).toEqual({ ...crop, x: 150, y: 80 });
    // Pushed past the corner, it stops against it.
    expect(moveCrop(crop, 5000, 5000, PHOTO)).toEqual({ ...crop, x: 800, y: 500 });
    expect(moveCrop(crop, -5000, -5000, PHOTO)).toEqual({ ...crop, x: 0, y: 0 });
  });

  describe('resizing', () => {
    const crop: CropRect = { x: 200, y: 200, width: 400, height: 300 };

    it('moves only the edges a corner touches', () => {
      expect(resizeCrop(crop, 'se', 100, 50, PHOTO)).toEqual({
        x: 200,
        y: 200,
        width: 500,
        height: 350,
      });
      expect(resizeCrop(crop, 'nw', -100, -50, PHOTO)).toEqual({
        x: 100,
        y: 150,
        width: 500,
        height: 350,
      });
    });

    it('moves one edge from an edge, ignoring the other direction', () => {
      expect(resizeCrop(crop, 'e', 80, 999, PHOTO)).toEqual({ ...crop, width: 480 });
      expect(resizeCrop(crop, 'n', 999, -60, PHOTO)).toEqual({ ...crop, y: 140, height: 360 });
    });

    // Free: any shape at all is one drag away, a strip included.
    it('is held to no shape', () => {
      const strip = resizeCrop(crop, 's', 0, -250, PHOTO);
      expect(strip).toEqual({ ...crop, height: 50 });
    });

    it('stops at the picture and never shrinks past the smallest crop', () => {
      expect(resizeCrop(crop, 'se', 5000, 5000, PHOTO)).toEqual({
        x: 200,
        y: 200,
        width: 1000,
        height: 600,
      });
      const squashed = resizeCrop(crop, 'se', -5000, -5000, PHOTO);
      expect(squashed.width).toBe(MIN_CROP);
      expect(squashed.height).toBe(MIN_CROP);
    });
  });
});
