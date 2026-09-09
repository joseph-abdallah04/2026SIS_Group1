import { useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';

import { useCreativeTools } from '../tools/CreativeToolsContext';
import { MyProposalsPanel } from './MyProposalsPanel';
import { useMyProposals } from './useMyProposals';

interface MyProposalsLauncherProps {
  sessionId: string;
  /** Changes whenever the board does, which is when this list can go stale. */
  revision: string;
  /** False while the board is not taking proposals, which closes reuse too. */
  canPropose: boolean;
}

/**
 * The fourth way to put something on the board: one you already made (F38).
 *
 * It sits with the creative tools rather than in a rail of its own. The three
 * beside it start a proposal from blank; this one starts from your own earlier
 * work, and what it produces is the same thing they produce. Finding an old
 * proposal is also an occasional, deliberate act rather than something anyone
 * watches, so it earns a button and not a column of screen for the whole
 * session.
 *
 * Reuse goes through the same path as Extend (F23): both open a proposal in
 * its own editor prefilled, and both save as a new proposal that records what
 * it came from. Only the source differs, so there is one write path rather
 * than two that could disagree.
 */
export function MyProposalsLauncher({ sessionId, revision, canPropose }: MyProposalsLauncherProps) {
  const { data, error } = useMyProposals(sessionId, revision);
  const { openEditorForExtend } = useCreativeTools();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // One press closes one thing: an editor may be listening for Escape too.
      event.stopPropagation();
      setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  const reuse = (item: BoardItem) => {
    setOpen(false);
    openEditorForExtend(item);
  };

  /**
   * Whether there is anything to bring across, which is not the same as being
   * past the first question. Somebody who joined late, or who proposed nothing
   * earlier, has nothing to reuse on question four either.
   */
  const hasReusable = (data?.groups ?? []).some(
    (group) => !group.isCurrent && group.items.length > 0,
  );
  const disabled = !hasReusable || !canPropose;

  const reason = !hasReusable
    ? 'Nothing to reuse yet. What you propose now can be reused on later questions'
    : !canPropose
      ? 'The board is not taking proposals right now'
      : 'Reuse something you proposed earlier';

  return (
    <div ref={wrapper} className="relative">
      {/* Dimmed rather than removed while there is nothing to reuse. The three
          buttons beside it dim the same way when the board is closed, and a
          control that comes and goes is one nobody learns is there: you would
          meet it for the first time on question two, wondering what changed. */}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        title={reason}
        className="flex h-9 items-center gap-2 rounded-full px-2.5 text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-secondary-wash hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none aria-expanded:bg-rt-secondary-wash aria-expanded:text-rt-ink disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-rt-ink-muted sm:px-3.5"
      >
        <History aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className="hidden sm:inline">Reuse</span>
      </button>

      {/* Opens upward, because the toolbar sits on the floor of the board.
          No portal is needed: unlike a card, this is outside the canvas's
          scale transform, so it is positioned against the page already. */}
      {/* Derived rather than closed by a state write during render: if the
          button goes dead while the panel is up, the panel is simply not shown
          and the remembered state costs nothing. */}
      {open && !disabled ? (
        <div
          role="dialog"
          aria-label="My proposals"
          className="absolute bottom-full left-0 z-40 mb-2"
        >
          <MyProposalsPanel
            groups={data?.groups ?? []}
            currentQuestionId={data?.currentQuestionId ?? null}
            canPropose={canPropose}
            onReuse={reuse}
            error={error}
          />
        </div>
      ) : null}
    </div>
  );
}
