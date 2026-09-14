import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';

interface StudioOverlayProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
}

/**
 * What is on the canvas, as the editor inside the studio describes it.
 *
 * Only the studio's minimised bar reads it, and only the editor knows it, so it
 * is passed up rather than worked out twice from outside.
 */
export interface StudioStatus {
  /** Counts worth naming, already worded: "2 elements", "1 arrow". */
  parts: readonly string[];
  /** Changed since it was opened, and not yet proposed. */
  unsaved: boolean;
}

const ReportStudioStatus = createContext<(status: StudioStatus) => void>(() => undefined);

/**
 * Tells the studio what the editor's canvas holds, so the bar it minimises to
 * can say so. A no-op outside the studio, as in an editor rendered on its own.
 */
export function useReportStudioStatus(parts: readonly string[], unsaved: boolean) {
  const report = useContext(ReportStudioStatus);
  // One value to compare between renders, so a new array of the same words
  // does not report again.
  const wording = JSON.stringify(parts);
  useEffect(() => {
    report({ parts: JSON.parse(wording) as string[], unsaved });
  }, [report, wording, unsaved]);
}

/** Typing into something, where Escape belongs to the text. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * How long the studio takes to slide down out of the way, and to slide back up.
 * Mirrored in `.rt-studio-minimise` and `.rt-studio-restore`, and held under
 * the studio's own limit on motion: this is a step aside, not a scene change
 * to wait for.
 */
const MINIMISE_MS = 180;
const RESTORE_MS = 180;
/** How long it fades out when left by the back arrow; `.rt-studio-leave`. */
const LEAVE_MS = 150;

/**
 * Whether stepping aside animates. Not for anyone who has asked for less
 * motion, and not where there is no way to ask, which is only an environment
 * with no rendering at all: there, waiting on an animation waits on nothing.
 */
function motionAllowed(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Where the studio is.
 *
 * `opening`, `minimising` and `restoring` are the moments in between: fading
 * in when a tool opens it, sliding down out of the way to its bar, and sliding
 * back up again. The dialog is still open while it slides down, so
 * the slide can be seen, and the bar is still there while the studio comes back
 * up, so it can be seen going.
 */
type StudioPhase = 'opening' | 'open' | 'minimising' | 'peeking' | 'restoring' | 'leaving';

/**
 * The creative studio: a large popup over the board, which can step aside to
 * let somebody look at the board and come back exactly where they left it.
 *
 * A popup rather than the whole window, so the board stays in view around it
 * and it reads as something being made for that board, not a separate place.
 * On a narrow screen there is no room around it to show, so it takes the
 * screen as before.
 *
 * Peeking hides the studio without unmounting it. The canvas keeps its undo
 * history, its zoom and whatever is selected, none of which the saved draft
 * holds, so coming back is a return rather than a reopening. While it is hidden
 * the board is live — it can be panned, read and reacted to — and a bar along
 * the bottom of the board says what is waiting and brings it back.
 */
export function StudioOverlay({ children, onClose, title }: StudioOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const peekButtonRef = useRef<HTMLButtonElement>(null);
  const focusBeforePeek = useRef<HTMLElement | null>(null);
  const transition = useRef<number | null>(null);
  const [phase, setPhase] = useState<StudioPhase>(() => (motionAllowed() ? 'opening' : 'open'));
  const [status, setStatus] = useState<StudioStatus | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  // A transition still running when the studio goes must not land afterwards.
  useEffect(
    () => () => {
      if (transition.current !== null) window.clearTimeout(transition.current);
    },
    [],
  );

  const after = useCallback((ms: number, then: () => void) => {
    if (transition.current !== null) window.clearTimeout(transition.current);
    transition.current = window.setTimeout(() => {
      transition.current = null;
      then();
    }, ms);
  }, []);

  // Fades in when a tool opens it, as the sticky popup does: nothing was below
  // to slide up from yet. The slide is kept for coming back from a peek, when it
  // really is down there.
  useEffect(() => {
    if (phase === 'opening') after(RESTORE_MS, () => setPhase('open'));
    // Only on arrival; every later phase schedules its own end.
  }, []);

  /**
   * Keep Escape from ever being a close request.
   *
   * Refusing the request in `onCancel` is not enough on its own: a browser will
   * only let a dialog decline so many times before closing anyway, so the third
   * press in a row got through. Preventing the key means the request is never
   * made.
   *
   * Last, in the bubble phase, so every handler inside the studio has already
   * had the key and seen it unprevented. Several of them decline an Escape that
   * something else has already dealt with — the editor will not put down what it
   * is carrying if a popover just closed on the same press — so marking it
   * early would quietly switch those off.
   *
   * Only while the studio is showing: peeking, there is no dialog to protect,
   * and the board's own Escape handlers are owed an unprevented key.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dialogRef.current?.open) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const peek = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    // Remembered so coming back puts focus where it was, not at the top.
    const active = document.activeElement;
    focusBeforePeek.current =
      active instanceof HTMLElement && dialog.contains(active) ? active : null;

    // Closed rather than hidden: a modal dialog makes everything behind it
    // inert, and the board has to answer to the pointer while it is peeked at.
    // Its contents stay mounted, so nothing in the editor is lost.
    const minimise = () => {
      dialog.close();
      setPhase('peeking');
    };
    if (!motionAllowed()) {
      minimise();
      return;
    }
    setPhase('minimising');
    after(MINIMISE_MS, minimise);
  }, [after]);

  const returnToStudio = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    const previous = focusBeforePeek.current;
    (previous?.isConnected ? previous : peekButtonRef.current)?.focus();

    if (!motionAllowed()) {
      setPhase('open');
      return;
    }
    setPhase('restoring');
    after(RESTORE_MS, () => setPhase('open'));
  }, [after]);

  /**
   * Leaving by the back arrow fades the studio out first, as the sticky popup
   * does, then closes it.
   *
   * The studio is gone the moment the tool closes, so the close waits for the
   * fade. If the tool then declines to close, the studio is simply shown again
   * rather than left faded out and unreachable.
   */
  const leave = useCallback(() => {
    if (!motionAllowed()) {
      onClose();
      return;
    }
    setPhase('leaving');
    after(LEAVE_MS, () => {
      onClose();
      setPhase('open');
    });
  }, [after, onClose]);

  /**
   * Escape brings the studio back from wherever it is pressed on the board.
   *
   * Not while typing, where the key belongs to the field — a sticky being
   * edited in place cancels on Escape, and one press should not also reopen
   * the studio over it. Not inside another dialog either, which closes itself
   * on the same key.
   */
  useEffect(() => {
    if (phase !== 'peeking') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTyping(event.target)) return;
      if (event.target instanceof Element && event.target.closest('dialog, [role="dialog"]')) {
        return;
      }
      event.preventDefault();
      returnToStudio();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, returnToStudio]);

  const summary = status
    ? [status.parts.join(', '), status.unsaved ? 'unsaved' : null].filter(Boolean).join(' · ')
    : '';

  const barShown = phase === 'peeking' || phase === 'restoring';

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby="creative-studio-title"
        className={`m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-rt-surface p-0 text-rt-ink backdrop:bg-rt-ink/35 md:m-auto md:h-[calc(100dvh-4rem)] md:w-[calc(100vw-4rem)] md:max-w-370 md:rounded-[28px] md:border md:border-rt-ink/15 md:shadow-[0_24px_64px_rgba(8,12,21,0.28)] ${
          phase === 'minimising'
            ? 'rt-studio-minimise pointer-events-none'
            : phase === 'leaving'
              ? 'rt-studio-leave pointer-events-none'
              : ''
        } ${phase === 'restoring' ? 'rt-studio-restore' : phase === 'opening' ? 'rt-studio-appear' : ''}`}
        // Escape is a close request to a <dialog>, and closing the studio is far
        // too much for it to mean. Inside, Escape steps back — out of a cell, out
        // of a shape, out of a selection, out of a half-placed element — and each
        // of those is one keystroke away from being the thing the user wanted.
        // Having the last of them also throw the whole canvas away made the key
        // dangerous to press. Leaving is the Back button, which is always there.
        onCancel={(event) => event.preventDefault()}
      >
        <ReportStudioStatus.Provider value={setStatus}>
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-rt-secondary/40 bg-rt-secondary-wash px-4 text-rt-ink sm:px-6 md:min-h-20">
              <IconButton label="Back to pinboard" onClick={leave}>
                <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.8} />
              </IconButton>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold tracking-[0.14em] text-rt-ink/60 uppercase">
                  Creative studio
                </p>
                <h1 id="creative-studio-title" className="truncate text-[17px] font-semibold">
                  {title}
                </h1>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <button
                  ref={peekButtonRef}
                  type="button"
                  onClick={peek}
                  aria-label="Peek at board"
                  title="Minimise the studio to look at the board. Nothing is lost."
                  className="flex h-9 items-center rounded-full border border-rt-secondary-deep/50 px-3.5 text-[13px] font-semibold text-rt-ink transition-colors hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none sm:px-4"
                >
                  <span aria-hidden="true" className="sm:hidden">
                    Peek
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    Peek at board
                  </span>
                </button>
              </div>
            </header>
            {children}
          </div>
        </ReportStudioStatus.Provider>
      </dialog>

      {barShown
        ? createPortal(
            <MinimisedStudio
              title={title}
              summary={summary}
              leaving={phase === 'restoring'}
              onReturn={returnToStudio}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * The board's horizontal extent, for the bar to span.
 *
 * The bar sits at the very bottom of the window but only as wide as the board:
 * the agenda beside the board is not part of it and stays uncovered. Null with
 * no board on screen, as in the tools workbench, where it spans the window.
 */
function measureBoardFrame(): { left: number; width: number } | null {
  const frame = document.querySelector<HTMLElement>('[data-board-frame]');
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  return rect.width > 0 ? { left: rect.left, width: rect.width } : null;
}

/**
 * The studio, slid down so only its top is left showing along the bottom of the
 * board while somebody looks at it.
 *
 * It is drawn as that top rather than as a separate bar: the same rounded
 * corners and edge as the popup, its own header with the same wording and type,
 * and a strip of the canvas below it running off the bottom of the window. So
 * it reads as the studio, pulled down and waiting, not as a notice about one —
 * and pulling it back up is plainly where the studio went.
 */
function MinimisedStudio({
  title,
  summary,
  leaving,
  onReturn,
}: {
  title: string;
  summary: string;
  /** Sliding away while the studio comes back up; no longer takes presses. */
  leaving: boolean;
  onReturn: () => void;
}) {
  const [board, setBoard] = useState(measureBoardFrame);

  // The board changes width without the window resizing when the agenda beside
  // it opens or closes, so it is watched as well as the window.
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>('[data-board-frame]');
    const remeasure = () => setBoard(measureBoardFrame());
    window.addEventListener('resize', remeasure);
    const observer =
      frame && typeof ResizeObserver === 'function' ? new ResizeObserver(remeasure) : null;
    if (frame) observer?.observe(frame);
    return () => {
      window.removeEventListener('resize', remeasure);
      observer?.disconnect();
    };
  }, []);

  return (
    <section
      aria-label="Minimised studio"
      className={`fixed bottom-0 z-40 flex justify-center px-3 sm:px-6 ${board ? '' : 'inset-x-0'} ${
        leaving ? 'rt-studio-dock-drop pointer-events-none' : 'rt-studio-dock-rise'
      }`}
      style={board ? { left: board.left, width: board.width } : undefined}
    >
      <div className="w-full max-w-370 overflow-hidden rounded-t-[28px] border border-b-0 border-rt-ink/15 bg-rt-surface shadow-[0_-14px_40px_rgba(8,12,21,0.18)]">
        {/* The studio's own header, as it looks when the studio is open. */}
        <div className="relative flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-rt-secondary/40 bg-rt-secondary-wash px-4 pt-4 pb-3 text-rt-ink sm:px-6 md:min-h-20">
          <div
            aria-hidden="true"
            className="absolute top-1.5 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-rt-ink/20"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold tracking-[0.14em] text-rt-ink/60 uppercase">
              Creative studio · Minimised
            </p>
            <p className="truncate">
              <span className="text-[17px] font-semibold">{title}</span>
              {summary ? <span className="text-[13px] text-rt-ink-muted"> · {summary}</span> : null}
            </p>
          </div>
          <span className="hidden rounded-full border border-dashed border-rt-secondary-deep/40 px-3 py-1.5 text-[12px] text-rt-ink-muted sm:inline">
            Esc to return
          </span>
          {/* Focused as the bar appears, so the way back is one key away. */}
          <Button autoFocus onClick={onReturn}>
            Back to studio
            <ArrowUp aria-hidden="true" size={15} strokeWidth={2} />
          </Button>
        </div>
        {/* The first of the canvas, running on below the bottom of the window. */}
        <div
          aria-hidden="true"
          className="h-6 bg-rt-surface-sunken"
          style={{
            backgroundImage: 'radial-gradient(rgba(140,164,172,0.35) 1.3px, transparent 1.3px)',
            backgroundSize: '22px 22px',
          }}
        />
      </div>
    </section>
  );
}
