import { useCallback, useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';

import { closingFades } from '../../lib/motion';
import { TOOL_BUTTON_PAD, TOOL_LABEL } from '../toolbar/CreativeToolbar';
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
 * Reuse shares its write path with Extend (F23): both open a proposal in its
 * own editor prefilled, and both save as a new proposal that records what it
 * came from. It opens through its own entry point, though, so the editor knows
 * it is reusing rather than extending, and the board marks only extensions:
 * a reuse names a proposal from an earlier question, never this one.
 */
export function MyProposalsLauncher({ sessionId, revision, canPropose }: MyProposalsLauncherProps) {
  const { data, error } = useMyProposals(sessionId, revision);
  const { openEditorForReuse, proposeArtifact } = useCreativeTools();
  // Only a picture's reuse can fail here: everything else fails in its editor.
  const [reuseError, setReuseError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Fading out: still shown, for as long as the fade takes.
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  /** Puts the panel away, fading it out first where motion is welcome. */
  const close = useCallback(() => {
    if (!closingFades()) {
      setOpen(false);
      return;
    }
    setLeaving(true);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    // As long as `.rt-sticky-popup-fade` runs.
    leaveTimer.current = setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, 150);
  }, []);

  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // One press closes one thing: an editor may be listening for Escape too.
      event.stopPropagation();
      close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [close, open]);

  const reuse = (item: BoardItem) => {
    // A picture has no editor to open a copy in, and nothing about it would be
    // changed there if it did. Bringing it across is the whole act, so it is
    // proposed as it is, still recording what it came from.
    if (item.artifactJson.type === 'image') {
      setReuseError(null);
      void proposeArtifact(item.artifactJson, { extendsProposalId: item.id }).then((result) => {
        if (result.ok) close();
        else setReuseError(result.error);
      });
      return;
    }
    setOpen(false);
    openEditorForReuse(item);
  };

  /**
   * Whether there is anything to bring across, which is not the same as being
   * past the first question. Somebody who joined late, or who proposed nothing
   * earlier, has nothing to reuse on question four either.
   */
  const hasReusable = (data?.groups ?? []).some(
    (group) => !group.isCurrent && group.items.length > 0,
  );
  /**
   * A list that never arrived is not an empty list. Leaving the button dead
   * after a failed first read would say "nothing to reuse" when the truth is
   * that nobody knows yet, and the panel it refuses to open is the only place
   * the reason is written. So a failure keeps the button live.
   */
  const loadFailed = error !== null && data === null;
  const disabled = !canPropose || (!hasReusable && !loadFailed);

  const reason = !canPropose
    ? 'The board is not taking proposals right now'
    : loadFailed
      ? 'Your earlier proposals could not be loaded'
      : !hasReusable
        ? 'Nothing to reuse yet. What you propose now can be reused on later questions'
        : 'Reuse something you proposed earlier';

  return (
    // Not positioned itself, so the panel below is placed against the
    // toolbar around it and can centre on that.
    <div ref={wrapper}>
      {/* Dimmed rather than removed while there is nothing to reuse. The three
          buttons beside it dim the same way when the board is closed, and a
          control that comes and goes is one nobody learns is there: you would
          meet it for the first time on question two, wondering what changed. */}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          if (open && !leaving) close();
          else {
            // Pressed again while it fades: it comes straight back.
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            setLeaving(false);
            setOpen(true);
          }
        }}
        title={reason}
        aria-label="Reuse"
        className={`flex h-9 items-center gap-2 rounded-full text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-secondary-wash hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none aria-expanded:bg-rt-secondary-wash aria-expanded:text-rt-ink disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-rt-ink-muted ${TOOL_BUTTON_PAD}`}
      >
        <History aria-hidden="true" size={17} strokeWidth={1.8} />
        <span className={TOOL_LABEL}>Reuse</span>
      </button>

      {/* Opens upward, because the toolbar floats at the foot of the board,
          centred on the toolbar rather than on this button, so it sits over
          the tools it belongs with. No portal is needed: unlike a card, this
          is outside the canvas's scale transform, so it is positioned against
          the page already. Once a narrow board anchors the toolbar to its
          right edge, the panel anchors there too, so it opens leftward over
          the board instead of off it. */}
      {/* Derived rather than closed by a state write during render: if the
          button goes dead while the panel is up, the panel is simply not shown
          and the remembered state costs nothing. */}
      {open && !disabled ? (
        <div
          role="dialog"
          aria-label="My proposals"
          className="absolute bottom-full left-1/2 z-40 mb-3 -translate-x-1/2 @max-[52rem]/board:right-0 @max-[52rem]/board:left-auto @max-[52rem]/board:translate-x-0"
        >
          <MyProposalsPanel
            groups={data?.groups ?? []}
            currentQuestionId={data?.currentQuestionId ?? null}
            canPropose={canPropose}
            onReuse={reuse}
            error={reuseError ?? error}
            onClose={close}
            leaving={leaving}
          />
        </div>
      ) : null}
    </div>
  );
}
