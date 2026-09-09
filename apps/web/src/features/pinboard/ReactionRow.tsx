import { useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import {
  hasReacted,
  reactionCount,
  reactionLabel,
  QUICK_REACTIONS,
  type ReactionGroup,
} from '@roundtable/shared';

import { EmojiPicker } from './EmojiPicker';
import { REACTION_HOVER_FILL, REACTION_ON_BORDER, REACTION_ON_FILL } from './pinboardTokens';

interface ReactionRowProps {
  /** Every emoji anyone used here, in the order they first appeared. */
  reactions: readonly ReactionGroup[];
  /** Who the server says this client is, or null before the board is joined. */
  viewerId: string | null;
  /** Toggle one reaction. Rejections surface on the canvas, not on the chip. */
  onReact: (emoji: string) => Promise<void>;
  /** The card's width, so the row wraps within it rather than past its edge. */
  width: number;
}

/**
 * One chip: the emoji, its count once it has one, and whether you are in it.
 */
function ReactionChip({
  emoji,
  count,
  mine,
  busy,
  disabled,
  dim,
  onClick,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  busy: boolean;
  disabled: boolean;
  /** Nothing has been said with this one yet, so it waits until hovered. */
  dim: boolean;
  onClick: () => void;
}) {
  const label = reactionLabel(emoji);

  return (
    <button
      type="button"
      // A toggle, so the button reports its state rather than pretending each
      // press is a fresh action.
      aria-pressed={mine}
      aria-label={count === 0 ? label : `${label} (${count})`}
      title={mine ? `${label} — click to take it back` : label}
      disabled={busy || disabled}
      onClick={onClick}
      // Its own edge and shadow, like the controls on the opposite corner: the
      // chip straddles the card's border, so half of it is over the board and
      // it cannot borrow a background from either side.
      //
      // A reacted chip is shaded in the board's own slate rather than the amber
      // accent. Amber is the palette's only accent and is already carrying
      // every button, focus ring and sticky in the app, so spending it here
      // made a row of chips shout for attention they do not need.
      //
      // Sized to the glyph and nothing more. The minimum width matches the
      // height, so a chip nobody has used yet is a circle around its emoji
      // rather than a capsule with empty room in it, and only a count widens
      // one.
      style={
        mine
          ? { background: REACTION_ON_FILL, borderColor: REACTION_ON_BORDER }
          : ({
              '--rt-chip-hover': REACTION_HOVER_FILL,
              '--rt-chip-edge': REACTION_ON_BORDER,
            } as React.CSSProperties)
      }
      className={`inline-flex h-[20px] min-w-[20px] items-center justify-center gap-[2px] rounded-full border px-[4px] shadow-sm transition-[background-color,border-color,opacity,transform] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary disabled:cursor-default ${
        mine
          ? 'text-rt-ink'
          : 'border-rt-tertiary bg-white hover:border-(--rt-chip-edge) hover:bg-(--rt-chip-hover)'
      } ${
        dim ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' : 'opacity-100'
      } ${busy ? 'scale-95' : ''}`}
    >
      <span aria-hidden="true" className="text-[12px] leading-none">
        {emoji}
      </span>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className={`text-[10px] leading-none font-semibold tabular-nums ${
            mine ? 'text-rt-ink' : 'text-rt-ink-muted'
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The reaction chips on a card's bottom-left corner (F18).
 *
 * Straddling the card's bottom edge, the mirror of the edit and remove
 * controls on its top-right: what other people said about a proposal balances
 * what its owner can do to it, and neither takes room from the proposal
 * itself.
 *
 * What people actually reacted with comes first, flush with the card's left
 * edge, in the order the server gives them: the order each emoji first
 * appeared here. Whether it was one of the quick three or came from the picker
 * makes no difference to where it sits, so the reactions a card has always
 * read as one group starting at the same place, with nothing holding a gap
 * open in front of them.
 *
 * The quick chips nobody has used yet follow, then the picker button. Both are
 * invisible until the card is hovered or focused, exactly as the controls on
 * the opposite corner are, so they cost nothing on a board of thirty cards.
 * Being to the right of the used chips, the space they hold cannot push a
 * count off its place.
 *
 * The row wraps within the card's width. With one reaction per person a busy
 * card can carry a chip per participant, and a single line would run off the
 * side and over its neighbours. Wrapping downward rather than upward is why
 * the row is anchored by its top: extra lines hang below the card instead of
 * climbing over the byline.
 *
 * Nothing is counted locally. The chip goes busy, the server decides whether
 * the press added or removed a reaction, and the count arrives on the
 * broadcast every other participant is reading too, so this card cannot end up
 * showing a number the rest of the room does not have.
 */
export function ReactionRow({ reactions, viewerId, onReact, width }: ReactionRowProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const pickerButton = useRef<HTMLButtonElement>(null);

  // Used first, in the server's order, then whichever quick chips are still
  // untouched. A quick emoji that somebody reacted with is already in the
  // first list, so it must not be offered again in the second.
  const used = reactions.filter((group) => group.userIds.length > 0);
  const usedEmoji = new Set(used.map((group) => group.emoji));
  const untouched = QUICK_REACTIONS.filter((emoji) => !usedEmoji.has(emoji));
  const mine = reactions
    .filter((group) => (viewerId ? group.userIds.includes(viewerId) : false))
    .map((group) => group.emoji);

  const toggle = (emoji: string) => {
    setPending(emoji);
    void onReact(emoji).finally(() => setPending(null));
  };

  const chipFor = (emoji: string, dim: boolean) => (
    <ReactionChip
      key={emoji}
      emoji={emoji}
      count={reactionCount(reactions, emoji)}
      mine={hasReacted(reactions, emoji, viewerId)}
      busy={pending === emoji}
      // Before the join snapshot lands there is nobody to react as, and the
      // server would refuse the write anyway.
      disabled={viewerId === null}
      dim={dim}
      onClick={() => toggle(emoji)}
    />
  );

  return (
    // Still straddling the bottom edge, but lined up with the byline's own left
    // margin rather than hung off the corner: the chips read as belonging to
    // the card, and the corner itself stays clear.
    //
    // Anchored by the top and pulled up by half a chip, so the first line
    // straddles the border and any further line grows downward.
    <div
      className="absolute top-full left-3 -mt-2.5 flex flex-wrap items-center gap-1"
      // The card's width less the left inset and a matching gap on the right,
      // so a wrapped row sits inside the card's footprint.
      style={{ maxWidth: width - 24 }}
    >
      {used.map((group) => chipFor(group.emoji, false))}
      {untouched.map((emoji) => chipFor(emoji, true))}

      <button
        ref={pickerButton}
        type="button"
        aria-label="More reactions"
        aria-haspopup="dialog"
        aria-expanded={pickerAnchor !== null}
        title="More reactions"
        disabled={viewerId === null}
        onClick={() =>
          setPickerAnchor((open) =>
            open ? null : (pickerButton.current?.getBoundingClientRect() ?? null),
          )
        }
        style={
          {
            '--rt-chip-hover': REACTION_HOVER_FILL,
            '--rt-chip-edge': REACTION_ON_BORDER,
          } as React.CSSProperties
        }
        className={`inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted shadow-sm transition-[background-color,border-color,opacity] hover:border-(--rt-chip-edge) hover:bg-(--rt-chip-hover) hover:text-rt-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary disabled:cursor-default ${
          pickerAnchor
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
      >
        <SmilePlus aria-hidden="true" size={11} strokeWidth={2} />
      </button>

      {pickerAnchor ? (
        <EmojiPicker
          anchor={pickerAnchor}
          selected={mine}
          onPick={(emoji) => {
            setPickerAnchor(null);
            toggle(emoji);
          }}
          onClose={() => setPickerAnchor(null)}
        />
      ) : null}
    </div>
  );
}
