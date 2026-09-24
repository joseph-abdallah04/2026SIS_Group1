import { isStorableImage } from '@roundtable/shared';

/** Answers already given, keyed by the stored picture itself. */
const answered = new Map<string, boolean>();
/** Enough for every picture on a busy board, and then some. */
const REMEMBERED = 200;

/**
 * Whether a card may draw this picture — `isStorableImage`, remembered.
 *
 * The check reads the whole data URL, which can be a few hundred kilobytes, and
 * a card asks it on every render: whether it has artwork, and again as it draws
 * it. The same string object comes back from the board each time, and the
 * engine keeps a string's hash once it has worked it out, so after the first
 * look this is a map lookup.
 */
export function canShowImage(src: string): boolean {
  const known = answered.get(src);
  if (known !== undefined) return known;
  const result = isStorableImage(src);
  // A board changes question and its pictures go with it; start again rather
  // than keeping every picture this tab has ever seen.
  if (answered.size >= REMEMBERED) answered.clear();
  answered.set(src, result);
  return result;
}
