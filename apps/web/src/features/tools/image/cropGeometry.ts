/**
 * The crop, in the picture's own pixels.
 *
 * Kept in source pixels rather than screen ones so that nothing about it
 * changes with the size the importer happens to draw the picture at: the
 * window can be resized mid-crop and the framing stays exactly where it was.
 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Which part of the frame is being dragged. */
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** The smallest crop, in source pixels: below this there is nothing to see. */
export const MIN_CROP = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function rounded(crop: CropRect): CropRect {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    width: Math.round(crop.width),
    height: Math.round(crop.height),
  };
}

/** The whole picture. */
export function fullCrop(size: Size): CropRect {
  return { x: 0, y: 0, width: size.width, height: size.height };
}

/** The frame dragged along by a pointer, kept wholly on the picture. */
export function moveCrop(crop: CropRect, dx: number, dy: number, size: Size): CropRect {
  return rounded({
    ...crop,
    x: clamp(crop.x + dx, 0, size.width - crop.width),
    y: clamp(crop.y + dy, 0, size.height - crop.height),
  });
}

/**
 * The frame after one of its edges or corners has been dragged.
 *
 * Free, never held to a shape: a corner moves the two edges it touches and an
 * edge moves itself, so any framing at all is one drag away.
 *
 * Always worked out from where the drag began rather than from the last move,
 * so a pointer that wanders off the picture and comes back lands the frame
 * where the pointer is, not where a run of clamped steps left it.
 */
export function resizeCrop(
  start: CropRect,
  handle: CropHandle,
  dx: number,
  dy: number,
  size: Size,
): CropRect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP, size.width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, size.height);
  return rounded({ x: left, y: top, width: right - left, height: bottom - top });
}

/** Whether a frame covers the whole picture, so there is nothing to cut. */
export function isFullCrop(crop: CropRect, size: Size): boolean {
  return crop.x === 0 && crop.y === 0 && crop.width === size.width && crop.height === size.height;
}
