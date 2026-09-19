import { useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import {
  hasReacted,
  reactionCount,
  reactionName,
  reactionPeople,
  QUICK_REACTIONS,
  type ReactionGroup,
  type ReactionPerson,
} from '@roundtable/shared';

import { emojiName, reactionButtonLabel } from './emojiCatalog';
import { EmojiPicker } from './EmojiPicker';
import { useCardTooltip } from './useCardTooltip';
import {
  FOOT_NAME_ROOM_PX,
  REACTION_HOVER_FILL,
  REACTION_ON_BORDER,
  REACTION_ON_FILL,
} from './pinboardTokens';

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
 * Who is in a chip, as one sentence: everyone where there are few, and the
 * first few and a count where there are many, so one popular chip cannot read
 * out a whole room.
 *
 * This is the chip's accessible name. What is shown on hover is a list, which
 * a screen reader has no way to reach — a tooltip is nothing to it — so the
 * same people have to be sayable in a line.
 */
function whoReacted(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length <= NAMES_SHOWN) {
    return names.length === 1
      ? names[0]!
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, NAMES_SHOWN).join(', ')} and ${names.length - NAMES_SHOWN} more`;
}

/** How many names a chip lists before it starts counting the rest. */
const NAMES_SHOWN = 5;

/**
 * Least room a name gets, however narrow the card is. A drawing is the
 * smallest card on the board and its byline is cramped; the list is not held
 * to that, or a room of people would be a column of ellipses.
 */
const MIN_NAME_ROOM_PX = 120;

/**
 * One chip: the emoji, its count once it has one, and whether you are in it.
 */
function ReactionChip({
  emoji,
  count,
  mine,
  people,
  viewerId,
  nameRoom,
  busy,
  disabled,
  dim,
  onClick,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  /** Who left this one, the viewer first. */
  people: readonly ReactionPerson[];
  viewerId: string | null;
  /** Room for a name here, as the card's own byline gives it. */
  nameRoom: number;
  busy: boolean;
  disabled: boolean;
  /** Nothing has been said with this one yet, so it waits until hovered. */
  dim: boolean;
  onClick: () => void;
}) {
  const label = reactionButtonLabel(emoji);
  // The board's own name for the quick three — they are offered as things to
  // say rather than as pictures, and "Agree" is what pressing one means. Every
  // other emoji goes by the name Unicode gives it.
  const name = reactionName(emoji) ?? emojiName(emoji);
  const named = people.map((person) => (person.userId === viewerId ? 'You' : person.displayName));
  const who = whoReacted(named);
  const rest = people.length - NAMES_SHOWN;

  // Who reacted, under the chip: a count says how many agreed, and the
  // question that follows is always who.
  //
  // A name per line rather than a sentence of them, read by scanning down a
  // column. The reaction is named above the list where it has a name — the
  // glyph itself is already under the pointer, so repeating it in the heading
  // says nothing the chip has not just said.
  const names = useCardTooltip<HTMLButtonElement>(
    people.length === 0 ? null : (
      <>
        {name ? (
          // Unicode writes its names in lower case; a heading starts a line.
          <p className="text-[11px] leading-none text-rt-ink-muted first-letter:uppercase">
            {name}
          </p>
        ) : null}
        <ul className={`flex flex-col gap-1 ${name ? 'mt-1.5' : ''}`}>
          {people.slice(0, NAMES_SHOWN).map((person) => (
            // Cut off where the byline cuts it off. A name long enough to run
            // past a card is long enough to run past this, and the two
            // disagreeing about where it ends reads as a different name.
            <li
              key={person.userId}
              className="truncate text-[12px] leading-tight"
              style={{ maxWidth: nameRoom }}
            >
              {person.userId === viewerId ? 'You' : person.displayName}
            </li>
          ))}
          {rest > 0 ? (
            <li className="text-[11px] leading-tight text-rt-ink-muted">and {rest} more</li>
          ) : null}
        </ul>
      </>
    ),
    'panel',
  );

  return (
    <button
      type="button"
      // A toggle, so the button reports its state rather than pretending each
      // press is a fresh action.
      aria-pressed={mine}
      // The names are part of what the chip says, not only what it shows on
      // hover: a tooltip is nothing to a screen reader.
      aria-label={count === 0 ? label : `${label} (${count}) — ${who}`}
      disabled={busy || disabled}
      onClick={onClick}
      {...names.anchor}
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
      // Holding one asks who is in it, and a held glyph is not a word being
      // picked out or a picture being saved: both are what a phone otherwise
      // offers for a long press on something like this.
      className={`pointer-events-auto inline-flex h-[20px] min-w-[20px] items-center justify-center gap-[2px] rounded-full border px-[4px] shadow-sm transition-[background-color,border-color,opacity,transform] select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary disabled:cursor-default ${
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
      {names.tooltip}
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
  const used = reactions.filter((group) => group.people.length > 0);
  const usedEmoji = new Set(used.map((group) => group.emoji));
  const untouched = QUICK_REACTIONS.filter((emoji) => !usedEmoji.has(emoji));
  const mine = reactions
    .filter((group) => hasReacted(reactions, group.emoji, viewerId))
    .map((group) => group.emoji);

  const toggle = (emoji: string) => {
    setPending(emoji);
    void onReact(emoji).finally(() => setPending(null));
  };

  const chipFor = (emoji: string, dim: boolean) => (
    <ReactionChip
      key={emoji}
      emoji={emoji}
      people={reactionPeople(reactions, emoji, viewerId)}
      viewerId={viewerId}
      nameRoom={Math.max(width - FOOT_NAME_ROOM_PX, MIN_NAME_ROOM_PX)}
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
      // The row itself is transparent to the pointer, and each chip takes it
      // back. A row that wraps grows down over whatever card is below, and the
      // gaps between chips are most of that area: without this, a second line
      // would quietly swallow clicks on a neighbour it does not even cover.
      className="pointer-events-none absolute top-full left-3 -mt-2.5 flex flex-wrap items-center gap-1"
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
        className={`pointer-events-auto inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted shadow-sm transition-[background-color,border-color,opacity] hover:border-(--rt-chip-edge) hover:bg-(--rt-chip-hover) hover:text-rt-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary disabled:cursor-default ${
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
