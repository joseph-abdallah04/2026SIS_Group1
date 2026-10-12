import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

import {
  ProposalActionsMenu,
  type ProposalMenuAnchor,
  type ProposalMenuItem,
} from '../pinboard/ProposalActionsMenu';

/**
 * The leader's ⋯ on a question still to come: what can be set on it before it
 * starts. The board's own card menu, so the two read as one family and share
 * its keyboard handling and its way of staying inside the window.
 *
 * In the row's top-right corner, shown on hover and focus (always on a touch
 * screen, which has no hover), beside the text rather than under it, so the
 * row does not move when it appears.
 */
export function AgendaRowMenu({
  label,
  items,
  variant = 'corner',
}: {
  label: string;
  items: ProposalMenuItem[];
  /**
   * `corner`: a quiet ⋯ in a row's corner, shown on hover and focus. `round`:
   * always there, a round button beside the card's primary action.
   */
  variant?: 'corner' | 'round';
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<ProposalMenuAnchor | null>(null);

  const toggle = () => {
    if (anchor) {
      setAnchor(null);
      return;
    }
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) setAnchor({ kind: 'corner', left: box.left, top: box.bottom + 4 });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        className={
          variant === 'round'
            ? `inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted transition-colors hover:border-rt-ink-faint hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary ${
                anchor ? 'border-rt-ink-faint text-rt-ink' : ''
              }`
            : `absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center rounded-full text-rt-ink-muted transition-[opacity,background-color,color] hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-secondary ${
                anchor
                  ? 'bg-rt-ink/[0.06] text-rt-ink opacity-100'
                  : 'opacity-0 group-focus-within/step:opacity-100 group-hover/step:opacity-100 [@media(hover:none)]:opacity-100'
              }`
        }
      >
        <MoreHorizontal aria-hidden="true" size={variant === 'round' ? 15 : 14} strokeWidth={2.2} />
      </button>
      {anchor ? (
        <ProposalActionsMenu
          anchor={anchor}
          sections={[items]}
          label={label}
          onClose={() => setAnchor(null)}
          ignore={buttonRef}
        />
      ) : null}
    </>
  );
}
