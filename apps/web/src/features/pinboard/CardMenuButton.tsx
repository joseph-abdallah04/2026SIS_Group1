import { MoreHorizontal } from 'lucide-react';

import { CARD_INK, REACTION_HOVER_FILL, REACTION_ON_BORDER } from './pinboardTokens';

/**
 * The ⋯ in a card's top-right corner, opening the same actions a right-click
 * does.
 *
 * One button where the pencil and the bin used to sit side by side: a card now
 * has more actions than its corner has room for icons, and a menu is also the
 * only way in on a touchscreen, which has no right-click. So it shows on hover
 * and focus as the old controls did, and always on a device that cannot hover.
 *
 * Shared by the board and the meeting summary, so a card's actions are reached
 * the same way wherever the card is.
 */
export function CardMenuButton({
  buttonRef,
  open,
  onToggle,
}: {
  buttonRef: React.RefObject<HTMLButtonElement>;
  open: boolean;
  onToggle: () => void;
}) {
  // Pulled out by the same amount on both axes, so it sits centred on the
  // card's top-right corner rather than tucked inside it.
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      title="Proposal actions"
      aria-label="Proposal actions"
      aria-haspopup="menu"
      aria-expanded={open}
      className={`absolute -top-2.5 -right-2.5 inline-flex h-5.5 w-5.5 items-center justify-center rounded-full border shadow-sm transition-[opacity,background-color,border-color,color] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary ${
        open
          ? // The menu opens over this spot, so the button steps out of the way
            // rather than peeking out from under it.
            'pointer-events-none border-rt-tertiary bg-white text-rt-ink-muted opacity-0'
          : 'border-rt-tertiary bg-white text-rt-ink-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) [@media(hover:none)]:opacity-100'
      }`}
      style={
        {
          // The slate the reaction chips hover to, so the card's controls read
          // as one family. A hover colour cannot be an inline style, hence the
          // variables.
          '--rt-control-fill': REACTION_HOVER_FILL,
          '--rt-control-edge': REACTION_ON_BORDER,
          '--rt-control-ink': CARD_INK,
        } as React.CSSProperties
      }
    >
      <MoreHorizontal aria-hidden="true" size={13} strokeWidth={2.2} />
    </button>
  );
}
