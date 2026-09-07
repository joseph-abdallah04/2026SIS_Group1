import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { reactionLabel } from '@roundtable/shared';

import { EMOJI_GROUPS, searchEmojis, type EmojiEntry } from './emojiCatalog';
import { REACTION_ON_FILL } from './pinboardTokens';

/** Panel geometry, fixed so the placement can be decided before it renders. */
const PANEL_WIDTH = 296;
const PANEL_HEIGHT = 344;
/** Breathing room from the trigger, and from the edge of the window. */
const GAP = 8;

interface EmojiPickerProps {
  /** Where the trigger sits in viewport coordinates, from `getBoundingClientRect`. */
  anchor: DOMRect;
  /** Emoji this viewer has already left here, shown as pressed in the grid. */
  selected: readonly string[];
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Work out where the panel goes.
 *
 * Below the trigger when there is room, above it when there is not, and always
 * inside the window on the horizontal axis. A card can sit anywhere on a board
 * that pans, so the trigger is regularly near an edge, and a panel that ran off
 * one would be a picker with no way to reach half of it.
 */
function placePanel(anchor: DOMRect): { top: number; left: number } {
  const below = anchor.bottom + GAP;
  const fitsBelow = below + PANEL_HEIGHT <= window.innerHeight - GAP;
  const top = fitsBelow ? below : Math.max(GAP, anchor.top - GAP - PANEL_HEIGHT);

  const preferred = anchor.left + anchor.width / 2 - PANEL_WIDTH / 2;
  const left = Math.min(Math.max(preferred, GAP), window.innerWidth - PANEL_WIDTH - GAP);

  return { top, left };
}

/**
 * The full emoji picker behind a card's "more" button (F18).
 *
 * Rendered through a portal to `document.body` for the same reason the remove
 * confirmation is: cards live inside the canvas's scale transform, and a
 * transformed ancestor becomes the containing block for everything under it, so
 * a panel left in place would inherit the board's zoom and be positioned
 * against the card instead of the window.
 *
 * Closing on any outside press and on Escape, rather than only on its own
 * close button: the board behind it is a canvas people pan and drag, and a
 * panel that stayed open while they did would be in the way of the thing they
 * opened it to react to.
 */
export function EmojiPicker({ anchor, selected, onPick, onClose }: EmojiPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [groupIndex, setGroupIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [position] = useState(() => placePanel(anchor));

  const group = EMOJI_GROUPS[groupIndex] ?? EMOJI_GROUPS[0];
  const searching = query.trim().length > 0;
  const results: readonly EmojiEntry[] = searching ? searchEmojis(query) : (group?.emojis ?? []);

  useEffect(() => {
    // The search box, not the panel: people who open a picker to find one
    // particular emoji can start typing immediately, and everyone else scrolls
    // as they would have anyway.
    searchRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Stop the board seeing it too: Escape is also how a card's inline
        // editor cancels, and one press should close one thing.
        event.stopPropagation();
        onClose();
      }
    };
    const outside = (target: EventTarget | null) => !panelRef.current?.contains(target as Node);
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) onClose();
    };
    /**
     * A wheel over the board moves the board, which moves the trigger out from
     * under a panel whose position was measured once, so the panel closes. A
     * wheel over the panel itself is somebody scrolling the grid, which is the
     * whole point of a list this long, so it is left alone.
     */
    const onWheel = (event: WheelEvent) => {
      if (outside(event.target)) onClose();
    };
    const onResize = () => onClose();

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
    };
  }, [onClose]);

  // A new list starts at its top. Without this, searching from halfway down
  // Symbols leaves the results scrolled past their first row.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [query, groupIndex]);

  if (!group) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Pick a reaction"
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-rt-tertiary bg-rt-surface shadow-lg"
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH, height: PANEL_HEIGHT }}
    >
      <div className="relative shrink-0 border-b border-rt-tertiary p-1.5">
        <Search
          aria-hidden="true"
          size={13}
          strokeWidth={2}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-rt-ink-faint"
        />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          autoComplete="off"
          className="h-[28px] w-full rounded-md bg-rt-surface-alt pr-2.5 pl-8 text-[12px] text-rt-ink outline-none placeholder:text-rt-ink-faint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary"
        />
      </div>

      <div
        role="tablist"
        aria-label="Emoji categories"
        className="flex shrink-0 items-center gap-0.5 border-b border-rt-tertiary px-1.5 py-1.5"
      >
        {EMOJI_GROUPS.map((candidate, index) => {
          // A category and a search are two ways of narrowing the same grid, so
          // choosing one clears the other rather than fighting it.
          const active = !searching && index === groupIndex;
          return (
            <button
              key={candidate.name}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={candidate.name}
              title={candidate.name}
              onClick={() => {
                setQuery('');
                setGroupIndex(index);
              }}
              // Marked in the same slate the pressed emoji use, so one panel
              // does not carry two different ideas of "selected".
              style={active ? { background: REACTION_ON_FILL } : undefined}
              className={`flex h-[26px] w-[26px] items-center justify-center rounded-md text-[14px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary ${
                active ? '' : 'hover:bg-rt-surface-alt'
              }`}
            >
              <span aria-hidden="true">{candidate.icon}</span>
            </button>
          );
        })}
      </div>

      {/* `overscroll-contain` so reaching the end of this list does not hand
          the rest of the scroll to whatever is behind the panel. */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5"
      >
        {results.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-rt-ink-muted">
            No emoji match “{query.trim()}”.
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {results.map(([emoji]) => {
              const mine = selected.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={mine}
                  aria-label={reactionLabel(emoji)}
                  onClick={() => onPick(emoji)}
                  // Marked in the same slate the chips use, so what is pressed
                  // here and what is pressed on a card read as one state.
                  style={mine ? { background: REACTION_ON_FILL } : undefined}
                  className={`flex h-[32px] w-[32px] items-center justify-center rounded-md text-[18px] leading-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary ${
                    mine ? '' : 'hover:bg-rt-surface-alt'
                  }`}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p
        aria-live="polite"
        className="shrink-0 border-t border-rt-tertiary px-3 py-1.5 text-[10.5px] text-rt-ink-faint"
      >
        {searching ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : group.name}
      </p>
    </div>,
    document.body,
  );
}
