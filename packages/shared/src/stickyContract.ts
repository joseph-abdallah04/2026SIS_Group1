/**
 * The sticky artifact contract's formatting.
 *
 * A sticky's words are stored as plain text, and its formatting as ranges over
 * that text rather than as markup. Everything that only needs the words — the
 * summary export, previews, anything added later that reads a note — keeps
 * reading `text` and never has to understand formatting. And nothing a peer
 * sends is ever markup, so there is nothing to sanitise before a note is shown.
 *
 * Lists are kept the same way: a list style for each line of the text, beside
 * it, rather than bullets or numbers typed into the words, and how deeply each
 * line is nested beside that. Links are ranges too, each with the address it
 * opens.
 *
 * A sticky written before formatting existed has none of these, and is exactly
 * the note it always was.
 */

/** What a range of a sticky's text can be set in. One font, four styles. */
export const STICKY_MARK_STYLES = ['bold', 'italic', 'underline', 'strike'] as const;
export type StickyMarkStyle = (typeof STICKY_MARK_STYLES)[number];

/**
 * One style over one run of a sticky's text: the characters from `from` up to,
 * not including, `to`, counted the way JavaScript strings count them.
 */
export interface StickyMark {
  from: number;
  to: number;
  style: StickyMarkStyle;
}

/**
 * More ranges than any note can need once they are merged. A note at the
 * editor's length with every other character in all four styles comes to about
 * a thousand; the cap is there so a crafted payload cannot be arbitrarily large.
 */
export const STICKY_MARK_LIMIT = 1200;

/** What a line of a sticky can be: an item in a bulleted or a numbered list. */
export const STICKY_LINE_STYLES = ['bullet', 'number'] as const;
export type StickyLineStyle = (typeof STICKY_LINE_STYLES)[number];

/**
 * A line for every character the schema lets a note hold, and one more: a note
 * of nothing but line breaks has one line more than it has characters.
 */
export const STICKY_LINE_LIMIT = 2001;

/**
 * How deep a list can nest: an item, an item under it, and one under that. A
 * sticky is a small square, and every level takes a slice off the width its
 * words wrap in.
 */
export const STICKY_LIST_MAX_LEVEL = 2;

/**
 * A link over one run of a sticky's text, counted the way `StickyMark` is. It
 * opens `href`, which is always a web address: see `stickyLinkHref`.
 */
export interface StickyLink {
  from: number;
  to: number;
  href: string;
}

/** Far more links than a note of the editor's length has room for words to carry. */
export const STICKY_LINK_LIMIT = 200;

/** The longest address a link can open. */
export const STICKY_HREF_MAX_LENGTH = 2048;

/**
 * The address a link opens, from what somebody typed or pasted, or null if it
 * is not a web address.
 *
 * Only http and https. A link on a sticky is pressed by everybody on the board,
 * so it must never be able to run anything or reach into the page: no
 * `javascript:`, no `data:`, nothing but a website. An address typed without
 * one, such as `example.com`, is taken to be https. One carrying a user name or
 * password is refused, since that is how a link is made to read as one site
 * while opening another.
 *
 * The same check guards the way in and the way out: a sticky is only accepted
 * with links this returns unchanged, and the board only draws those.
 */
export function stickyLinkHref(input: string): string | null {
  const value = input.trim();
  if (!value || value.length > STICKY_HREF_MAX_LENGTH || /\s/.test(value)) return null;
  // A scheme, unless what follows the colon is a port, as in `localhost:3000`.
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  // A single word is far more likely a typo than a website.
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  return url.href.length > STICKY_HREF_MAX_LENGTH ? null : url.href;
}
