import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUp, LoaderCircle } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';

interface StudioOverlayProps {
  children: ReactNode;
  /** Closes the tool; false if it declined to close. */
  onClose: () => boolean | void;
  /** What was made has gone onto the board, so the studio is done. */
  proposed?: boolean;
  title: string;
}

/**
 * What is on the canvas, as the editor inside the studio describes it.
 *
 * Only the studio's minimised face reads it, and only the editor knows it, so it
 * is passed up rather than worked out twice from outside.
 */
export interface StudioStatus {
  /** Counts worth naming, already worded: "2 elements", "1 arrow". */
  parts: readonly string[];
}

const ReportStudioStatus = createContext<(status: StudioStatus) => void>(() => undefined);

/**
 * Where in the studio's header an editor's own actions go.
 *
 * Three states, not two. `undefined` is outside any studio, where the actions
 * belong in a footer. `null` is inside a studio whose header has not mounted
 * yet: the slot is filled by a ref, so the first render always sees it empty,
 * and treating that as "outside" put a footer under the canvas for a frame.
 */
const StudioActionsSlot = createContext<HTMLElement | null | undefined>(undefined);

const FALLBACK_FOOTER_CLASS =
  'flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary bg-rt-surface px-4 py-3 sm:px-6';

interface StudioActionsProps {
  /** Cancel and Propose, or whatever the editor finishes with. */
  children: ReactNode;
  /** Why the last proposal did not go through; said in place of the summary. */
  error?: string | null;
  /** What the canvas holds, as the editor words it. */
  summary: ReactNode;
  /** The footer's classes outside the studio, where there is no header. */
  footerClassName?: string;
}

/**
 * An editor's own actions — what it holds, Cancel and Propose — in the studio's
 * header rather than a footer under the canvas, so the canvas has that height.
 *
 * Outside the studio, as in an editor rendered on its own, there is no header to
 * go into, and they stay in a footer beneath it.
 */
export function StudioActions({
  children,
  error,
  summary,
  footerClassName = FALLBACK_FOOTER_CLASS,
}: StudioActionsProps) {
  const slot = useContext(StudioActionsSlot);

  // Inside a studio, but its header is not there yet: nothing, for the one
  // render before it is.
  if (slot === null) return null;

  if (slot === undefined) {
    return (
      <footer className={footerClassName}>
        <div className="min-w-0 flex-1">
          {error ? (
            <p role="alert" className="text-[12px] text-rt-secondary-deep">
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-rt-ink-faint" aria-live="polite">
              {summary}
            </p>
          )}
        </div>
        {children}
      </footer>
    );
  }

  return createPortal(
    <>
      <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-rt-secondary-deep/25" />
      {error ? (
        <p
          role="alert"
          className="line-clamp-2 max-w-64 min-w-0 text-right text-[12px] leading-snug text-rt-secondary-deep"
        >
          {error}
        </p>
      ) : (
        // Left out where the header is short of room: the minimised studio
        // says the same, and the canvas itself shows what is on it.
        <p
          aria-live="polite"
          className="hidden text-[11px] whitespace-nowrap text-rt-ink-muted lg:block"
        >
          {summary}
        </p>
      )}
      {children}
    </>,
    slot,
  );
}

/**
 * Tells the studio what the editor's canvas holds, so its minimised face can
 * say so. A no-op outside the studio, as in an editor rendered on its own.
 */
export function useReportStudioStatus(parts: readonly string[]) {
  const report = useContext(ReportStudioStatus);
  // One value to compare between renders, so a new array of the same words
  // does not report again.
  const wording = JSON.stringify(parts);
  useEffect(() => {
    report({ parts: JSON.parse(wording) as string[] });
  }, [report, wording]);
}

interface StudioProposeButtonProps {
  /** The editor's form, which the button submits from the header. */
  form: string;
  disabled: boolean;
  /** A proposal is on its way, however briefly. */
  submitting: boolean;
  /** On its way for long enough to say so; see `useSlowSubmission`. */
  sending: boolean;
  /**
   * Rewriting a proposal already on the board, so the button says it updates
   * that proposal rather than offering to propose it again.
   */
  editing?: boolean;
  title: string;
}

/**
 * Propose, or Update proposal for an edit, in the studio's header.
 *
 * The same size whatever it is doing: while a slow send is waiting, the label
 * is covered by a spinner rather than replaced by a longer one, so nothing else
 * in the header moves.
 *
 * From the moment a proposal is sent it refuses another press and says it is
 * unavailable, but it does not dim: most sends are over before a dimmed button
 * could be seen as anything but a flicker. It dims with the spinner once a send
 * is slow.
 */
export function StudioProposeButton({
  form,
  disabled,
  submitting,
  sending,
  editing = false,
  title,
}: StudioProposeButtonProps) {
  return (
    <Button
      type="submit"
      form={form}
      className="relative shrink-0 aria-disabled:cursor-wait"
      disabled={disabled}
      aria-disabled={submitting || undefined}
      aria-busy={sending || undefined}
      title={title}
      onClick={(event) => {
        if (submitting) event.preventDefault();
      }}
    >
      <span aria-hidden={sending || undefined} className={sending ? 'invisible' : undefined}>
        {editing ? 'Update proposal' : 'Propose'}
      </span>
      {sending ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
          <span className="sr-only">{editing ? 'Updating' : 'Proposing'}</span>
        </span>
      ) : null}
    </Button>
  );
}

/** Typing into something, where Escape belongs to the text. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * How long the studio takes to slide down to rest, back up, or settle after a
 * drag. Mirrored in `.rt-studio-slide`.
 *
 * Longer than the studio's toolbars take to come and go, because this moves the
 * whole studio most of the height of the window: at toolbar speed it covered
 * half the distance in its first frame and read as a jump. The phase only moves
 * on once the slide has finished, or the last of it is cut off.
 */
const SLIDE_MS = 300;
/** How long it takes to fade in when a tool opens it; `.rt-studio-appear`. */
const APPEAR_MS = 180;
/** How long it fades out when it leaves; `.rt-studio-leave`. */
const LEAVE_MS = 180;

/** How far a press has to travel before it is a drag rather than a press. */
const DRAG_SLOP_PX = 4;
/** Let go past this share of the way up, and the studio finishes coming up. */
const LIFT_COMMIT = 0.3;
/** Or flicked upward at least this fast, in px per ms, however little it rose. */
const FLICK_PX_PER_MS = 0.5;
/** A flick is judged on the pointer's last moments before it was let go. */
const FLICK_WINDOW_MS = 80;
/** And needs at least a frame's worth of them to be judged at all. */
const FLICK_MIN_SPAN_MS = 16;

/** Kept clear either side of the studio where it sits over the board. */
const BOARD_GUTTER_PX = 12;
/** The studio's widest, as `max-w-370`. */
const STUDIO_MAX_WIDTH_PX = 1480;
/** Narrower than this the studio takes the whole screen, as `md:`. */
const WIDE_MIN_PX = 768;

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
 * `peeking` is resting at the bottom of the board with only its top showing;
 * `dragging` is being pulled up from there by the pointer, and `dropping` is
 * settling back down when let go too low. In those three the dialog is open but
 * not modal, so the board around it stays live.
 *
 * `opening`, `minimising` and `restoring` are the moments in between: fading
 * in when a tool opens it, sliding down to rest at the bottom, and sliding back
 * up again, whether from the button or from a drag let go high enough.
 */
type StudioPhase =
  'opening' | 'open' | 'minimising' | 'peeking' | 'dragging' | 'dropping' | 'restoring' | 'leaving';

/** Resting at the bottom or moving under the pointer there: the board is live. */
const ON_BOARD: ReadonlySet<StudioPhase> = new Set(['peeking', 'dragging', 'dropping']);
/** Everything but fully up: the canvas is out of reach. */
const AWAY: ReadonlySet<StudioPhase> = new Set(['minimising', 'peeking', 'dragging', 'dropping']);

const PHASE_CLASSES: Record<StudioPhase, string> = {
  opening: 'rt-studio-appear',
  open: '',
  minimising: 'rt-studio-peeked rt-studio-slide rt-studio-minimise pointer-events-none',
  peeking: 'rt-studio-peeked',
  dragging: 'rt-studio-dragging',
  dropping: 'rt-studio-peeked rt-studio-slide pointer-events-none',
  restoring: 'rt-studio-slide rt-studio-restore',
  leaving: 'rt-studio-leave pointer-events-none',
};

/**
 * Where the studio rests while the board is looked at: in the board's own
 * column, as wide as the board less a gutter either side and centred on it, so
 * the agenda beside the board stays in view.
 *
 * Up, the studio is wide and centred on the window instead; it narrows into
 * this column as it slides down and widens back out as it comes up. Null where
 * there is no board to rest over, as in the tools workbench, or no room around
 * it, where the studio takes the screen either way.
 */
function measureStudioColumn(): { left: number; width: number } | null {
  if (window.innerWidth < WIDE_MIN_PX) return null;
  const frame = document.querySelector<HTMLElement>('[data-board-frame]');
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  const width = Math.min(rect.width - BOARD_GUTTER_PX * 2, STUDIO_MAX_WIDTH_PX);
  if (width <= 0) return null;
  return { left: rect.left + (rect.width - width) / 2, width };
}

function useStudioColumn() {
  const [column, setColumn] = useState(measureStudioColumn);

  const remeasure = useCallback(() => {
    const next = measureStudioColumn();
    setColumn((current) =>
      current?.left === next?.left && current?.width === next?.width ? current : next,
    );
  }, []);

  // The board changes width without the window resizing when the agenda beside
  // it opens or closes, so it is watched as well as the window.
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>('[data-board-frame]');
    window.addEventListener('resize', remeasure);
    const observer =
      frame && typeof ResizeObserver === 'function' ? new ResizeObserver(remeasure) : null;
    if (frame) observer?.observe(frame);
    return () => {
      window.removeEventListener('resize', remeasure);
      observer?.disconnect();
    };
  }, [remeasure]);

  return [column, remeasure] as const;
}

interface PointerSample {
  y: number;
  at: number;
}

/** A press on the minimised face, followed until it is let go. */
interface Drag {
  pointerId: number;
  startY: number;
  /** Where the pointer has been lately, oldest first. */
  samples: PointerSample[];
  /** From resting at the bottom to fully up, in px. */
  travel: number;
  moved: boolean;
}

/**
 * How fast the pointer was rising as it was let go, in px per ms.
 *
 * From the oldest position in the last `FLICK_WINDOW_MS` to where it was let
 * go, and only over at least `FLICK_MIN_SPAN_MS`. It used to be the speed of the
 * last move with any time between it and the one before. Moves reported in the
 * same millisecond have none, so a fast early rise stood through a later move
 * back down, and a drag lifted and then lowered was let go as a flick.
 */
function releaseSpeed(samples: readonly PointerSample[], y: number, at: number): number {
  const from = samples.find((sample) => sample.at >= at - FLICK_WINDOW_MS);
  if (!from || at - from.at < FLICK_MIN_SPAN_MS) return 0;
  return (from.y - y) / (at - from.at);
}

/**
 * The creative studio: a large popup over the board, which can step aside to
 * let somebody look at the board and come back exactly where they left it.
 *
 * A popup rather than the whole window, so the board stays in view around it
 * and it reads as something being made for that board, not a separate place.
 * On a narrow screen there is no room around it to show, so it takes the
 * screen as before.
 *
 * Peeking slides the studio down until only its top is showing along the bottom
 * of the board. Nothing is unmounted: the canvas keeps its undo history, its
 * zoom and whatever is selected, none of which the saved draft holds, so coming
 * back is a return rather than a reopening. While it rests there the board is
 * live — it can be panned, read and reacted to — and the studio comes back by
 * its button, by Escape, or by being dragged back up.
 */
export function StudioOverlay({ children, onClose, proposed = false, title }: StudioOverlayProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const studioFaceRef = useRef<HTMLElement>(null);
  const boardFaceRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const peekButtonRef = useRef<HTMLButtonElement>(null);
  const focusBeforePeek = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<'return' | 'restore' | null>(null);
  const transition = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const [phase, setPhase] = useState<StudioPhase>(() => (motionAllowed() ? 'opening' : 'open'));
  const phaseRef = useRef(phase);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  // Let go mid-drag, so already moving when the slide takes over.
  const [released, setReleased] = useState(false);
  const [column, remeasureColumn] = useStudioColumn();
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

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
    if (phase === 'opening') after(APPEAR_MS, () => setPhase('open'));
    // Only on arrival; every later phase schedules its own end.
  }, []);

  /**
   * Only one face of the studio can be reached at a time.
   *
   * Up, its own header and canvas; down, the face that brings it back. The
   * other is taken out of reach rather than only hidden, so Tab never walks
   * into a canvas below the bottom of the window, or onto a button faded out.
   * Before paint and before the effects below, so focus is never sent into
   * something still out of reach.
   *
   * The drag's lift is let go here too, once the phase has moved on and a class
   * has taken over the position, so the studio never jumps between the two.
   */
  useLayoutEffect(() => {
    phaseRef.current = phase;
    const away = AWAY.has(phase);
    const onBoard = ON_BOARD.has(phase);
    studioFaceRef.current?.toggleAttribute('inert', away);
    bodyRef.current?.toggleAttribute('inert', away);
    boardFaceRef.current?.toggleAttribute('inert', !onBoard);
    if (phase !== 'dragging') dialogRef.current?.style.removeProperty('--studio-lift');
  }, [phase]);

  // Focus follows whichever face has just come within reach.
  useEffect(() => {
    if (phase === 'peeking' && pendingFocus.current === 'return') {
      pendingFocus.current = null;
      boardFaceRef.current?.querySelector('button')?.focus();
    }
    if ((phase === 'restoring' || phase === 'open') && pendingFocus.current === 'restore') {
      pendingFocus.current = null;
      const previous = focusBeforePeek.current;
      (previous?.isConnected ? previous : peekButtonRef.current)?.focus();
    }
  }, [phase]);

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
   * Only while the studio is up: resting on the board, there is no close request
   * to refuse, and the board's own Escape handlers are owed an unprevented key.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dialogRef.current?.open && !ON_BOARD.has(phaseRef.current)) event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const peek = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open || AWAY.has(phaseRef.current)) return;
    // The board may have changed width since the studio opened.
    remeasureColumn();
    // Remembered so coming back puts focus where it was, not at the top.
    const active = document.activeElement;
    focusBeforePeek.current =
      active instanceof HTMLElement && dialog.contains(active) ? active : null;
    pendingFocus.current = 'return';

    // Reopened without being modal: a modal dialog makes everything behind it
    // inert, and the board has to answer to the pointer while the studio rests
    // on it. Nothing inside is unmounted, so nothing in the editor is lost.
    const rest = () => {
      dialog.close();
      dialog.show();
      setPhase('peeking');
    };
    if (!motionAllowed()) {
      rest();
      return;
    }
    setPhase('minimising');
    after(SLIDE_MS, rest);
  }, [after, remeasureColumn]);

  const returnToStudio = useCallback(
    (byDrag = false) => {
      const dialog = dialogRef.current;
      if (!dialog || !ON_BOARD.has(phaseRef.current)) return;
      setReleased(byDrag);
      // Modal again, so the board behind it is out of reach while it is up.
      dialog.close();
      dialog.showModal();
      pendingFocus.current = 'restore';

      if (!motionAllowed()) {
        setPhase('open');
        return;
      }
      setPhase('restoring');
      after(SLIDE_MS, () => setPhase('open'));
    },
    [after],
  );

  /** Let go too low: settles back down to rest at the bottom. */
  const dropBack = useCallback(() => {
    setReleased(true);
    if (!motionAllowed()) {
      setPhase('peeking');
      return;
    }
    setPhase('dropping');
    after(SLIDE_MS, () => setPhase('peeking'));
  }, [after]);

  /**
   * Leaving by the back arrow fades the studio out first, as the sticky popup
   * does, then closes it.
   *
   * The studio is gone the moment the tool closes, so the close waits for the
   * fade. It then stays faded out until it is gone: the router applies the
   * close as a transition, a render or more after this, and setting the studio
   * back to showing in the meantime flashed it up at full strength for a frame
   * after every close. Only if the tool declines to close is it shown again,
   * rather than left faded out and unreachable.
   */
  const leave = useCallback(() => {
    if (!motionAllowed()) {
      onClose();
      return;
    }
    setPhase('leaving');
    after(LEAVE_MS, () => {
      if (onClose() === false) setPhase('open');
    });
  }, [after, onClose]);

  // Once what was made is on the board there is nothing left to do here, so
  // the studio fades out back to the board on its own, as the sticky popup
  // does, rather than stopping on a screen that only says so. Once only: the
  // tool closing resets the proposal, and a later render must not restart the
  // fade.
  const leftAfterProposing = useRef(false);
  useEffect(() => {
    if (!proposed || leftAfterProposing.current) return;
    leftAfterProposing.current = true;
    leave();
  }, [proposed, leave]);

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
      const dialog =
        event.target instanceof Element && event.target.closest('dialog, [role="dialog"]');
      if (dialog && dialog !== dialogRef.current) return;
      event.preventDefault();
      returnToStudio();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, returnToStudio]);

  /**
   * Pulling the studio up from where it rests.
   *
   * It follows the pointer the whole way, so what comes up is plainly the studio
   * that went down. Let go high enough, or flicked up, and it finishes coming
   * up; let go low, and it settles back. A press that never moves is not a drag,
   * and a press on the button is the button's.
   */
  const onBoardFacePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (phaseRef.current !== 'peeking' || event.button !== 0 || event.isPrimary === false) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    // How far below its open position it rests, measured rather than worked out
    // again, so the pointer and the studio never part company.
    const travel = dialog.getBoundingClientRect().top - dialog.offsetTop;
    if (travel <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      samples: [{ y: event.clientY, at: event.timeStamp }],
      travel,
      moved: false,
    };
  };

  const onBoardFacePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const risen = current.startY - event.clientY;
    if (!current.moved) {
      if (Math.abs(risen) < DRAG_SLOP_PX) return;
      current.moved = true;
      setPhase('dragging');
    }
    current.samples.push({ y: event.clientY, at: event.timeStamp });
    // Only the last moments are ever read, so older ones are let go.
    while (
      current.samples.length > 1 &&
      current.samples[0]!.at < event.timeStamp - FLICK_WINDOW_MS
    ) {
      current.samples.shift();
    }
    const lift = Math.min(1, Math.max(0, risen / current.travel));
    dialogRef.current?.style.setProperty('--studio-lift', String(lift));
  };

  const onBoardFacePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    if (!current.moved) return;
    const lift = (current.startY - event.clientY) / current.travel;
    const speed = releaseSpeed(current.samples, event.clientY, event.timeStamp);
    if (lift >= LIFT_COMMIT || speed >= FLICK_PX_PER_MS) returnToStudio(true);
    else dropBack();
  };

  const onBoardFacePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    drag.current = null;
    if (current.moved) dropBack();
  };

  // What the canvas holds, and nothing about saving: resting on the board loses
  // nothing, and a diagram is kept as a draft anyway, so "unsaved" was neither
  // true nor anything to act on from here.
  const summary = status ? status.parts.join(', ') : '';

  const onBoard = ON_BOARD.has(phase);
  // Worded only while the studio is down or on its way, so the canvas's own
  // counts are not said twice while it is up.
  const faceWorded = AWAY.has(phase) || phase === 'restoring';

  return (
    <dialog
      ref={dialogRef}
      // Named directly rather than by the heading, which is hidden while the
      // studio rests on the board.
      aria-label={title}
      data-phase={phase}
      className={`fixed inset-0 z-40 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-rt-surface p-0 text-rt-ink [--studio-showing:5.5rem] [--studio-top:0px] backdrop:bg-rt-ink/35 md:m-auto md:h-[calc(100dvh-4rem)] md:w-[calc(100vw-4rem)] md:max-w-370 md:rounded-[28px] md:border md:border-rt-ink/15 md:shadow-[0_24px_64px_rgba(8,12,21,0.28)] md:[--studio-showing:6.5rem] md:[--studio-top:2rem] ${
        AWAY.has(phase) ? 'max-md:rounded-t-[28px]' : ''
      } ${column ? 'rt-studio-columned' : ''} ${PHASE_CLASSES[phase]} ${
        released && (phase === 'restoring' || phase === 'dropping') ? 'rt-studio-released' : ''
      }`}
      // Where it rests over the board. Where it opens is the window's middle,
      // worked out in `.rt-studio-columned`.
      style={
        column
          ? ({
              '--studio-rest-left': `${column.left}px`,
              '--studio-rest-width': `${column.width}px`,
            } as CSSProperties)
          : undefined
      }
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
          {/* Two faces in the one header: the studio's own while it is up, and
              the one that brings it back while it rests on the board. They
              cross-fade as it is dragged between the two. */}
          <div className="relative shrink-0">
            <header
              ref={studioFaceRef}
              aria-hidden={onBoard || undefined}
              className={`rt-studio-face-studio flex min-h-16 items-center gap-3 border-b border-rt-secondary/40 bg-rt-secondary-wash px-4 text-rt-ink sm:px-6 md:min-h-20 ${
                AWAY.has(phase) ? 'pointer-events-none' : ''
              }`}
            >
              <IconButton label="Back to pinboard" onClick={leave}>
                <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.8} />
              </IconButton>
              <div className="min-w-0">
                <p className="text-[9px] font-semibold tracking-[0.14em] text-rt-ink/60 uppercase">
                  Creative studio
                </p>
                <h1 className="truncate text-[17px] font-semibold">{title}</h1>
              </div>
              <div className="ml-auto flex min-w-0 items-center gap-2">
                <button
                  ref={peekButtonRef}
                  type="button"
                  onClick={peek}
                  aria-label="Peek at board"
                  title="Minimise the studio to look at the board. Nothing is lost."
                  className="flex h-9 shrink-0 items-center rounded-full border border-rt-secondary-deep/50 px-3.5 text-[13px] font-semibold text-rt-ink transition-colors hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none sm:px-4"
                >
                  <span aria-hidden="true" className="sm:hidden">
                    Peek
                  </span>
                  <span aria-hidden="true" className="hidden sm:inline">
                    Peek at board
                  </span>
                </button>
                {/* The editor's actions, from `StudioActions`. */}
                <div
                  ref={setActionsSlot}
                  className="flex min-w-0 items-center gap-2 empty:hidden"
                />
              </div>
            </header>

            <section
              ref={boardFaceRef}
              aria-label="Minimised studio"
              aria-hidden={!onBoard || undefined}
              className={`rt-studio-face-board absolute inset-0 flex touch-none items-center gap-x-4 border-b border-rt-secondary/40 bg-rt-secondary-wash px-4 pt-2 text-rt-ink select-none sm:px-6 ${
                onBoard ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
              }`}
              onPointerDown={onBoardFacePointerDown}
              onPointerMove={onBoardFacePointerMove}
              onPointerUp={onBoardFacePointerUp}
              onPointerCancel={onBoardFacePointerCancel}
            >
              <div
                aria-hidden="true"
                className="absolute top-1.5 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-rt-ink/20"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold tracking-[0.14em] text-rt-ink/60 uppercase">
                  Creative studio · Minimised
                </p>
                <p className="truncate">
                  <span className="text-[17px] font-semibold">{faceWorded ? title : null}</span>
                  {faceWorded && summary ? (
                    <span className="text-[13px] text-rt-ink-muted"> · {summary}</span>
                  ) : null}
                </p>
              </div>
              <Button className="shrink-0" onClick={() => returnToStudio()}>
                Back to studio
                <ArrowUp aria-hidden="true" size={15} strokeWidth={2} />
              </Button>
            </section>
          </div>
          <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
            <StudioActionsSlot.Provider value={actionsSlot}>{children}</StudioActionsSlot.Provider>
          </div>
        </div>
      </ReportStudioStatus.Provider>
    </dialog>
  );
}
