import {
  IMAGE_ARTIFACT_LIMIT,
  IMAGE_MAX_EDGE,
  isStorableImage,
  type ImageArtifact,
} from '@roundtable/shared';

import type { CropRect } from './cropGeometry';

/**
 * Something the importer could not do with a file, in words fit to show the
 * person who chose it. Anything else that goes wrong is a bug, not a message.
 */
export class ImageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageImportError';
  }
}

/**
 * Past this a file is refused before it is read at all. Decoding a picture
 * holds every one of its pixels in memory at once, and the board would only
 * keep a small copy of it anyway.
 */
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

/** What `accept` offers in the file picker. Anything the browser can decode still gets through a drop. */
export const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';

/** A picture, decoded and the right way up, ready to crop. */
export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Reads a file into a picture, or says why it cannot.
 *
 * Turned the right way up on the way in: a photo from a phone is stored on its
 * side with a note saying so, and cropping the sideways pixels would crop the
 * wrong part of the picture.
 */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (!isImageFile(file)) throw new ImageImportError('That file is not an image.');
  // A document that draws a picture rather than a picture: it would have to be
  // treated as markup, and the board never stores a peer's markup.
  if (file.type === 'image/svg+xml') {
    throw new ImageImportError('SVG files cannot be imported. Export it as a PNG first.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ImageImportError('That image is over 30MB. Try a smaller copy of it.');
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    // HEIC off an iPhone is the usual reason: most browsers cannot read it.
    throw new ImageImportError('This image could not be read here. Try a PNG or JPEG.');
  }
}

/** Qualities tried at each size before the picture itself is made smaller. */
const QUALITIES = [0.86, 0.78, 0.7, 0.62] as const;
/** How much smaller each attempt after that is. */
const STEP_DOWN = 0.75;
/** Below this there is no point storing it: it would be a smudge on its card. */
const MIN_EDGE = 320;

/** Encodes the crop at one size and quality, as a data URL. */
export type EncodeAt = (width: number, height: number, quality: number) => Promise<string>;

/**
 * The largest, best-looking copy of the crop that fits the board's limit.
 *
 * Starts at the size the board keeps at most, then trades quality before size:
 * a slightly softer photo reads the same on a card, where one half the width is
 * visibly smaller. Only once the lowest quality still does not fit is the
 * picture made smaller, and the qualities are tried again at the new size.
 */
export async function shrinkToFit(
  crop: { width: number; height: number },
  encodeAt: EncodeAt,
): Promise<{ src: string; width: number; height: number }> {
  let scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(crop.width, crop.height));
  for (;;) {
    const width = Math.max(1, Math.round(crop.width * scale));
    const height = Math.max(1, Math.round(crop.height * scale));
    for (const quality of QUALITIES) {
      const src = await encodeAt(width, height, quality);
      if (src.length <= IMAGE_ARTIFACT_LIMIT) return { src, width, height };
    }
    if (Math.max(width, height) <= MIN_EDGE) {
      throw new ImageImportError('This image has too much detail to store, even small.');
    }
    scale *= STEP_DOWN;
  }
}

/** Whether anything on the canvas is less than fully opaque. */
function hasTransparency(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const { data } = context.getImageData(0, 0, width, height);
  for (let alpha = 3; alpha < data.length; alpha += 4) {
    if (data[alpha]! < 255) return true;
  }
  return false;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The crop, shrunk and re-encoded into what the board stores.
 *
 * Always re-encoded, even a PNG that would fit as it is: it is the only way to
 * be sure what is stored is a plain picture, with nothing riding along in its
 * metadata — a phone photo's location, for one.
 */
export async function encodeImage(decoded: DecodedImage, crop: CropRect): Promise<ImageArtifact> {
  const canvas = document.createElement('canvas');
  // Settled once, at the first size tried: whether the crop has any see-through
  // pixels to keep. A logo or a screenshot of a window often does; a photo
  // never does.
  let transparent: boolean | null = null;
  // A PNG is lossless, so every quality at one size gives the same file. Kept
  // per size rather than re-encoded four times over.
  const pngAt = new Map<string, string | null>();

  const encodeAt: EncodeAt = async (width, height, quality) => {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageImportError('This browser cannot prepare images.');
    context.imageSmoothingQuality = 'high';
    const draw = () =>
      context.drawImage(
        decoded.bitmap,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        width,
        height,
      );
    draw();
    transparent ??= hasTransparency(context, width, height);

    // Transparency is kept where it can be: a PNG, if it fits at this size.
    // A picture too detailed to fit as one trades its transparency before its
    // size — it goes on white as a JPEG, which is a fraction of the bytes.
    if (transparent) {
      const key = `${width}x${height}`;
      if (!pngAt.has(key)) {
        const png = await canvasBlob(canvas, 'image/png', 1);
        const url = png ? await blobDataUrl(png) : null;
        pngAt.set(key, url && url.length <= IMAGE_ARTIFACT_LIMIT ? url : null);
      }
      const kept = pngAt.get(key);
      if (kept) return kept;
    }

    // JPEG has no transparency, and a clear pixel written to one comes out
    // black, so it is laid on white first.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    draw();
    const jpeg = await canvasBlob(canvas, 'image/jpeg', quality);
    if (!jpeg) throw new ImageImportError('This image could not be prepared.');
    return blobDataUrl(jpeg);
  };

  const { src, width, height } = await shrinkToFit(crop, encodeAt);
  if (!isStorableImage(src)) throw new ImageImportError('This image could not be prepared.');
  return { type: 'image', src, width, height };
}
