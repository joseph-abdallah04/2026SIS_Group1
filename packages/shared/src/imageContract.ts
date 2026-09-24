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
 */
export const IMAGE_ARTIFACT_LIMIT = 400_000;

/** A data URL in one of the accepted formats, and nothing else. */
export const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** The first few bytes of a base64 string, decoded without a platform decoder. */
function leadingBytes(base64: string, count: number): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) break;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
      if (bytes.length === count) break;
    }
  }
  return bytes;
}

function startsWith(bytes: readonly number[], signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
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
  const bytes = leadingBytes(base64, 12);
  switch (format) {
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
  }
}

/**
 * Whether a string is an image this board will draw.
 *
 * Asked by the renderer as well as the write path: a card only ever points an
 * `<img>` at a data URL it has checked, never at an address. An address would
 * make every viewer's browser fetch from wherever a proposal pointed.
 */
export function isStorableImage(src: string): boolean {
  if (src.length > IMAGE_ARTIFACT_LIMIT) return false;
  const match = IMAGE_DATA_URL.exec(src);
  if (!match) return false;
  return imageSignatureMatches(match[1] as ImageFormat, match[2]!);
}
