/**
 * The reaction contract (F18).
 *
 * Reactions are lightweight feedback, deliberately not votes: they carry no
 * weight in the formal ballot (F27-F31), they can be taken back at any time,
 * and everyone can see who left them. They exist to put some energy on a board
 * that would otherwise be a silent wall of notes.
 *
 * Any emoji can be left on a proposal. A handful are offered as chips on every
 * card because reaching for a picker to say "yes, this" is friction on the
 * cheapest interaction the board has; everything else is one press away behind
 * the picker.
 *
 * Only the glyphs, their names and what counts as an emoji live here. How a
 * chip looks is presentation and stays with the board, the same split the
 * drawing and diagram contracts use.
 */

/**
 * The chips every card shows without asking: agree, love, insight.
 *
 * Three, in this order, everywhere. They cover the three things a room
 * actually says about an idea - I am with you, this is great, this started me
 * thinking - and each is a different signal rather than a shade of the same
 * one. They are a shortcut, not the whole vocabulary, so this list decides
 * what is *quick* rather than what is *allowed*: anything the picker offers is
 * equally valid to store.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '💡'] as const;
export type QuickReaction = (typeof QUICK_REACTIONS)[number];

/**
 * What the quick chips are *for*, as a verb a person would use.
 *
 * An emoji has no accessible name of its own: a screen reader announces the
 * glyph's Unicode name, so a button labelled only with the character reads out
 * as "thumbs up sign" with no hint that pressing it does anything.
 */
export const QUICK_REACTION_LABELS: Record<QuickReaction, string> = {
  '👍': 'Agree',
  '❤️': 'Love this',
  '💡': 'Sparks an idea',
};

/**
 * The longest reaction worth storing, in UTF-16 units.
 *
 * A single emoji is at most a few code points even at its most elaborate - a
 * family of four joined by zero-width joiners runs to about twenty units. This
 * is generous room above that, and small enough that the column cannot become
 * somewhere to put a paragraph.
 */
export const MAX_REACTION_LENGTH = 32;

/**
 * One emoji and nothing else, by the Unicode recommendation for what may stand
 * alone as one (`RGI_Emoji`). It understands the pieces a single glyph is
 * really made of: skin-tone modifiers, variation selectors, zero-width joiner
 * sequences, flags and keycaps.
 *
 * The `v` flag it needs arrived in ES2024, so it is built defensively. Where an
 * engine is too old the fallback below asks the weaker question instead.
 */
const RGI_EMOJI = (() => {
  try {
    return new RegExp('^\\p{RGI_Emoji}$', 'v');
  } catch {
    return null;
  }
})();

/** Fallback: something pictographic, and nothing that belongs to prose. */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const PROSE = /[\p{Letter}\p{White_Space}\p{Control}]/u;

/**
 * Whether a string is a single emoji.
 *
 * This is the whole guard on what may be stored as a reaction. Without it the
 * column is a free-text field with a fixed width, and a card's chip row is
 * somewhere to write.
 */
export function isEmoji(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_REACTION_LENGTH) return false;
  if (RGI_EMOJI) return RGI_EMOJI.test(value);
  return PICTOGRAPHIC.test(value) && !PROSE.test(value);
}

/** Whether this is one of the chips shown on every card. */
export function isQuickReaction(value: string): value is QuickReaction {
  return (QUICK_REACTIONS as readonly string[]).includes(value);
}

/**
 * The accessible name for a reaction button.
 *
 * The quick chips have a verb of their own. Anything from the picker is named
 * after the glyph itself, prefixed so it still reads as something to press
 * rather than as a stray character in the page.
 */
export function reactionLabel(emoji: string): string {
  return isQuickReaction(emoji) ? QUICK_REACTION_LABELS[emoji] : `React with ${emoji}`;
}

/**
 * Everyone who reacted to one proposal with one emoji, oldest first.
 *
 * The people are carried rather than a bare number for two reasons. The count
 * is `userIds.length`, so a count and its membership can never disagree. And
 * whether *you* reacted is a question only the viewer can answer, so a row
 * broadcast to the whole room cannot hold a `mine` flag that would be true for
 * one client and false for every other. A session is a roomful of people, so
 * the list stays short.
 */
export interface ReactionGroup {
  emoji: string;
  userIds: string[];
}

/** How many people left this reaction. No group means nobody has. */
export function reactionCount(groups: readonly ReactionGroup[], emoji: string): number {
  return groups.find((group) => group.emoji === emoji)?.userIds.length ?? 0;
}

/** Whether this person is one of them, which is what presses the chip. */
export function hasReacted(
  groups: readonly ReactionGroup[],
  emoji: string,
  userId: string | null,
): boolean {
  if (!userId) return false;
  return groups.find((group) => group.emoji === emoji)?.userIds.includes(userId) ?? false;
}

/** Total reactions across every emoji, for a summary label. */
export function totalReactions(groups: readonly ReactionGroup[]): number {
  return groups.reduce((sum, group) => sum + group.userIds.length, 0);
}
