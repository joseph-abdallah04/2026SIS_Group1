import { useRef, useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { BoardItem, SessionRecapQuestion } from '@roundtable/shared';

import { RecapEnlarge } from './RecapEnlarge';
import { authorName, buildsOnText, findCard } from './recapModel';
import { Avatar, useRecapContext } from './recapUi';

/** Who proposed a card, as a face and a name ("You" for your own). */
export function Proposer({ item, prefix }: { item: BoardItem; prefix?: string }) {
  const { viewerId } = useRecapContext();
  const name = authorName(item, viewerId);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-rt-ink-muted">
      <Avatar person={{ userId: item.authorId, displayName: item.authorName }} size="sm" />
      <span className="min-w-0 truncate">
        {prefix ? `${prefix} ` : null}
        <span className="font-semibold text-rt-ink">{name === 'you' ? 'You' : name}</span>
      </span>
    </span>
  );
}

/**
 * "Builds on Maya's idea", for a card that extended someone else's (F23).
 * Where the original is on the same board, it opens that card in the board's
 * enlarged view, the way any card on the page is looked at closely.
 */
export function BuildsOn({ item, question }: { item: BoardItem; question: SessionRecapQuestion }) {
  const { viewerId, actions } = useRecapContext();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const text = buildsOnText(item, viewerId);
  if (!text) return null;
  const original = findCard(question, item.extendsProposalId);
  const look = 'inline-flex min-w-0 items-center gap-1 text-[12px] text-rt-ink-muted';
  if (!original || !actions) {
    return (
      <span className={look}>
        <CornerDownRight aria-hidden size={13} className="shrink-0" />
        <span className="truncate">{text}</span>
      </span>
    );
  }
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="See the idea this builds on"
        className={`${look} cursor-pointer rounded-md underline-offset-2 hover:text-rt-ink hover:underline focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none`}
      >
        <CornerDownRight aria-hidden size={13} className="shrink-0" />
        <span className="truncate">{text}</span>
      </button>
      {open ? (
        <RecapEnlarge
          item={original}
          openedFrom={buttonRef.current}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </>
  );
}
