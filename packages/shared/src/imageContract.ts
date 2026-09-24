/**
 * The image artifact contract.
 *
 * An imported picture — a photo of a whiteboard, a screenshot, a mock-up — put
 * on the board as a proposal of its own. It is stored inline, as a data URL,
 * for the same reason drawings and diagrams are: the board is one row per
 * proposal and one broadcast per change, with no file storage beside it. That
 * is also why the limits below are strict. Every participant downloads every
 * image on the board when they join, so an image is shrunk and re-encoded on
 * the client before it is ever sent, and the server refuses anything larger.
 *
 * Only JPEG and PNG are stored, and never SVG. An SVG is a document, not a
 * picture: the board would have to treat a peer's upload as markup. The
 * importer rasterises everything it can decode into one of these two instead.
 *
 * Not WebP, although it is smaller: the recap PDF paints every winning card
 * with resvg, which cannot decode it, so a picture that won the vote would come
 * out of the recap as an empty frame. These two, everything reads.
 */

/** The formats a stored image may be in: JPEG for a photo, PNG where it has transparency. */
export const IMAGE_FORMATS = ['image/jpeg', 'image/png'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/**
 * The longest side a stored image may have, in pixels.
 *
 * Twice the width the enlarged view opens at, so a picture opened on a
 * high-density screen is still sharp, and no more: a phone photo straight off
 * the camera is several times this, and all of the difference would be bytes
 * nobody can see.
 */
export const IMAGE_MAX_EDGE = 1600;

/**
 * Ceiling for the stored data URL, in characters.
 *
 * About 300KB of picture once the base64 is taken off. Several times the budget
 * a drawing gets, because a photo cannot be simplified the way a stroke can —
 * but bounded all the same, since it travels in every snapshot of the board.
 *
 * Raise it with care: a proposal reaches the server as one Socket.IO message,
 * and the server's `maxHttpBufferSize` is still the default 1MB. One picture at
 * this limit fits with room to spare; one much larger would be dropped by the
 * transport before the server could say why.
 */
export const IMAGE_ARTIFACT_LIMIT = 400_000;

/** A data URL in one of the accepted formats, and nothing else. */
export const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** A picture's bytes, however they are held, read one at a time. */
abstract class Bytes {
  /** The byte at `index`, or -1 past the end. */
  abstract at(index: number): number;

  /** A big-endian number `size` bytes long starting at `index`, or -1 past the end. */
  number(index: number, size: 2 | 4): number {
    let value = 0;
    for (let offset = 0; offset < size; offset += 1) {
      const byte = this.at(index + offset);
      if (byte < 0) return -1;
      value = value * 256 + byte;
    }
    return value;
  }

  startsWith(signature: readonly number[], from = 0): boolean {
    return signature.every((byte, index) => this.at(from + index) === byte);
  }
}

/**
 * The bytes of a base64 string, decoded where they are asked for, without a
 * platform decoder.
 *
 * Lazily rather than all at once: finding a JPEG's size means stepping over
 * the segments in front of it, which only needs the few bytes of each header,
 * not the few hundred kilobytes of picture between them.
 */
class Base64Bytes extends Bytes {
  private readonly length: number;

  constructor(private readonly base64: string) {
    super();
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    this.length = Math.floor((base64.length * 3) / 4) - padding;
  }

  at(index: number): number {
    if (index < 0 || index >= this.length) return -1;
    const group = Math.floor(index / 3) * 4;
    let bits = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      const value = BASE64_ALPHABET.indexOf(this.base64[group + offset] ?? '=');
      bits = (bits << 6) | Math.max(0, value);
    }
    return (bits >> (16 - (index % 3) * 8)) & 0xff;
  }
}

/** Bytes read straight from a file. */
class ArrayBytes extends Bytes {
  constructor(private readonly bytes: Uint8Array) {
    super();
  }

  at(index: number): number {
    return index >= 0 && index < this.bytes.length ? this.bytes[index]! : -1;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
/** `IHDR`, the chunk a PNG must open with, which carries its size. */
const PNG_HEADER_CHUNK = [0x49, 0x48, 0x44, 0x52];
/** A JPEG's start-of-frame markers, every kind: baseline, progressive, lossless, arithmetic. */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
/** Markers that stand alone, with no length after them. */
const JPEG_BARE_MARKERS = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8]);
/** More segments than any real file has before its frame; past this it is not a picture. */
const JPEG_MAX_SEGMENTS = 256;

export interface PixelSize {
  width: number;
  height: number;
}

/** A PNG's size, from the header chunk every PNG opens with. */
function pngSize(bytes: Bytes): PixelSize | null {
  if (!bytes.startsWith(PNG_HEADER_CHUNK, 12)) return null;
  const width = bytes.number(16, 4);
  const height = bytes.number(20, 4);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * A JPEG's size, from its start-of-frame segment.
 *
 * Found by stepping from one segment header to the next, since the frame comes
 * after whatever metadata and tables the file carries first. A file that
 * reaches its picture data, or its end, without saying how big it is has no
 * size to trust.
 */
function jpegSize(bytes: Bytes): PixelSize | null {
  let at = 2;
  for (let segment = 0; segment < JPEG_MAX_SEGMENTS; segment += 1) {
    if (bytes.at(at) !== 0xff) return null;
    // Any number of 0xFF may pad before a marker.
    while (bytes.at(at + 1) === 0xff) at += 1;
    const marker = bytes.at(at + 1);
    if (marker < 0) return null;
    if (JPEG_FRAME_MARKERS.has(marker)) {
      const height = bytes.number(at + 5, 2);
      const width = bytes.number(at + 7, 2);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (JPEG_BARE_MARKERS.has(marker)) {
      at += 2;
      continue;
    }
    // Start of scan, or end of image: the picture began without a frame.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = bytes.number(at + 2, 2);
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

/**
 * Whether the bytes are really the format the data URL claims.
 *
 * The header of a data URL is only a label. Checked against the file's own
 * signature, a payload cannot call itself a PNG while being something else —
 * the renderer is an `<img>`, which would refuse a mislabelled file anyway, but
 * nothing that is not a picture should be stored in the first place.
 */
export function imageSignatureMatches(format: ImageFormat, base64: string): boolean {
  const bytes = new Base64Bytes(base64);
  switch (format) {
    case 'image/png':
      return bytes.startsWith(PNG_SIGNATURE);
    case 'image/jpeg':
      return bytes.startsWith(JPEG_SIGNATURE);
  }
}

/**
 * The size a picture really is, read from its own header, or null if it does
 * not say.
 *
 * What a viewer's browser, and the recap's rasteriser, will decode it to, not
 * what the proposal around it claims. A few hundred kilobytes of PNG can
 * declare itself tens of thousands of pixels on a side, and every one of those
 * pixels would be held in memory by everyone who opened the board.
 */
export function imagePixelSize(src: string): PixelSize | null {
  const match = IMAGE_DATA_URL.exec(src);
  if (!match) return null;
  const bytes = new Base64Bytes(match[2]!);
  switch (match[1] as ImageFormat) {
    case 'image/png':
      return bytes.startsWith(PNG_SIGNATURE) ? pngSize(bytes) : null;
    case 'image/jpeg':
      return bytes.startsWith(JPEG_SIGNATURE) ? jpegSize(bytes) : null;
  }
}

/**
 * The size a PNG or JPEG file says it is, from its first bytes, or null for
 * any other format or a header that does not say within them.
 *
 * For the importer, so a picture can be refused before it is decoded: decoding
 * holds every pixel in memory at once, which is the very thing being avoided.
 */
export function imageFileSize(head: Uint8Array): PixelSize | null {
  const bytes = new ArrayBytes(head);
  if (bytes.startsWith(PNG_SIGNATURE)) return pngSize(bytes);
  if (bytes.startsWith(JPEG_SIGNATURE)) return jpegSize(bytes);
  return null;
}

/**
 * Whether a string is an image this board will draw.
 *
 * Asked by the renderer and the recap as well as the write path: a card only
 * ever points an `<img>` at a data URL it has checked, never at an address. An
 * address would make every viewer's browser fetch from wherever a proposal
 * pointed. And only at a picture whose own header keeps it within
 * `IMAGE_MAX_EDGE`, since that is what gets decoded, whatever the proposal says.
 */
export function isStorableImage(src: string): boolean {
  if (src.length > IMAGE_ARTIFACT_LIMIT) return false;
  const match = IMAGE_DATA_URL.exec(src);
  if (!match) return false;
  if (!imageSignatureMatches(match[1] as ImageFormat, match[2]!)) return false;
  const size = imagePixelSize(src);
  return size !== null && Math.max(size.width, size.height) <= IMAGE_MAX_EDGE;
}
