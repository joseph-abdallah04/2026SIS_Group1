import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, X } from 'lucide-react';
import type { StickyColor } from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
import { STICKY_RADIUS, STICKY_SHADOW, STICKY_THEMES } from '../../pinboard/pinboardTokens';
import { prepareStickyText, STICKY_TEXT_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import { clearStickyDraft, readStickyDraft, writeStickyDraft } from './stickyDraft';
import { stickyFits } from './stickyPresentation';
import { useNoteAutoGrow } from './useNoteAutoGrow';

const STICKY_COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];

const POPUP_WIDTH = 'min(92vw, 520px)';
const POPUP_MAX_WIDTH_PX = 520;
/** Between the popup and the board's footer it rests on. */
const FOOTER_GAP_PX = 12;
/** Kept clear of the window's edge when the toolbar sits near it. */
const EDGE_PX = 16;
/** How long the popup takes to fade out; the same as `.rt-sticky-popup-fade`. */
const EXIT_MS = 150;
/** The toolbar button for the tool that is already open. */
const OPEN_TOOL_BUTTON = '[data-creative-toolbar] button[aria-pressed="true"]';

/**
 * Whether closing fades. Not for anyone who has asked for less motion, and not
 * where there is no way to ask, which is only ever an environment with no
 * rendering at all: there, a close that waited on an animation would wait on
 * nothing.
 */
function closingFades(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** With no toolbar to rest on, as in the tools workbench: the middle of the window. */
const CENTRED: CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

/**
 * Where the popup goes: resting just above the board's footer, centred on it.
 *
 * Centred on the board's own footer rather than on the window, because the
 * panels either side of the board are not the same width, and the middle of
 * the window is not the middle of the thing being written onto. Measured
 * rather than offset by a fixed amount for the same reason.
 *
 * Anchored by the bottom, so a note that grows grows upward, away from the
 * toolbar, instead of down over it. Null when there is no toolbar on screen, as
 * in the tools workbench, and the popup sits in the middle of the window.
 */
function placeAboveFooter(): CSSProperties | null {
  const toolbar = document.querySelector<HTMLElement>('[data-creative-toolbar]');
  if (!toolbar) return null;

  const board = (
    toolbar.closest<HTMLElement>('[data-board-footer]') ?? toolbar
  ).getBoundingClientRect();
  const width = Math.min(window.innerWidth * 0.92, POPUP_MAX_WIDTH_PX);
  const centred = board.left + board.width / 2 - width / 2;
  return {
    top: 'auto',
    right: 'auto',
    // Clear of the footer's top edge, not the toolbar's: the toolbar sits
    // inside the footer, so resting on it would put the note on the line.
    bottom: window.innerHeight - board.top + FOOTER_GAP_PX,
    left: Math.max(EDGE_PX, Math.min(centred, window.innerWidth - width - EDGE_PX)),
  };
}

/**
 * Writing a sticky, as a note you write on rather than a room you enter.
 *
 * A sticky is one short line of text and a colour. A full-screen studio for
 * that asks somebody to leave the board, lose sight of what everyone else has
 * just proposed, and come back — for a sentence. So this is a popup over the
 * board: the paper you are writing on, in the colour you picked, with the
 * board still visible behind it. The drawing and diagram tools keep the studio,
 * because a canvas genuinely needs the room.
 *
 * There is no preview, because the popup is the preview. It is the same paper
 * the board uses — the same colours, the same square corners, the same shadow
 * falling below it — so what you are writing on is what lands.
 *
 * It behaves like the other popovers on the board rather than like a dialog.
 * Nothing behind it is locked or dimmed, a press anywhere else closes it, and
 * whatever was written is kept, so closing it to look at something is free.
 */
export function StickyEditor() {
  const {
    closeTool,
    extensionSource,
    isReusingOwn,
    editSource,
    isLive,
    resetSubmission,
    stickyDraftKey,
    submissionError,
    submissionStatus,
    submitArtifact,
  } = useCreativeTools();
  const panelRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  // Read while rendering, before the note takes focus, so this is whatever
  // opened the popup: the toolbar button, or a card's Extend.
  const [opener] = useState(() => document.activeElement);
  // Editing rewrites this proposal; extending starts a new one from it.
  const sourceProposal = editSource ?? extensionSource;
  const sourceArtifact =
    sourceProposal?.artifactJson.type === 'sticky' ? sourceProposal.artifactJson : null;
  /**
   * Only a new sticky is a draft. Editing and extending both open on a
   * proposal that already exists, so there is nothing to lose by closing them,
   * and letting them read or write the draft would put one note's words into
   * another.
   *
   * Decided once, when the popup opens. Closing an extension clears its source
   * a render before the popup itself goes, and a key worked out afresh in that
   * render would take the extension for a new sticky and save its words over
   * the draft.
   */
  const [draftKey] = useState(() => (editSource || extensionSource ? null : stickyDraftKey));
  const [saved] = useState(() => (draftKey ? readStickyDraft(draftKey) : null));
  const [text, setText] = useState(sourceArtifact?.text ?? saved?.text ?? '');
  const [color, setColor] = useState<StickyColor>(
    sourceArtifact?.color ?? saved?.color ?? 'yellow',
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  // The last keystroke was refused because the note had filled the largest
  // sticky, which the character count alone would not show.
  const [paperFull, setPaperFull] = useState(false);

  // Saved as it is typed, colour included, so closing the popup by any route
  // — a press outside it, Escape, the close button, a refresh — keeps the note.
  useEffect(() => {
    if (draftKey) writeStickyDraft(draftKey, { text, color });
  }, [draftKey, text, color]);
  const theme = STICKY_THEMES[color];
  const [placement, setPlacement] = useState(placeAboveFooter);

  useEffect(() => {
    const onResize = () => setPlacement(placeAboveFooter());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The paper grows instead of scrolling, so a long note is never written
  // into a box that hides its own first line.
  useNoteAutoGrow(noteRef, text);

  /**
   * Nothing to acknowledge. The sticky lands on the board directly behind this
   * popup, so a receipt would cover the one thing that proves it worked. The
   * full-screen studio needed a success screen because it had hidden the board.
   */
  const closeRef = useRef(closeTool);
  useEffect(() => {
    closeRef.current = closeTool;
  });

  /**
   * Every close from here fades out first, then closes.
   *
   * The popup is removed the moment the tool closes, so there is nothing left
   * to animate unless the close itself waits. While it fades it takes no more
   * presses, so a second click on the board lands on the board.
   *
   * The wait is a timer rather than the end of the animation, so it closes on
   * time even where the animation never runs, and it is cancelled if the popup
   * goes first — opening another tool mid-fade removes it straight away, and a
   * close arriving after that would shut the tool just opened.
   */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const exitTimer = useRef<number | null>(null);

  const beginClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!closingFades()) {
      closeRef.current();
      return;
    }
    setClosing(true);
    exitTimer.current = window.setTimeout(() => closeRef.current(), EXIT_MS);
  }, []);

  // Changed its mind: the open tool's own button, pressed mid-fade.
  const cancelClose = useCallback(() => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    exitTimer.current = null;
    closingRef.current = false;
    setClosing(false);
  }, []);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (submissionStatus === 'success') beginClose();
  }, [submissionStatus, beginClose]);

  /**
   * A press anywhere outside the popup closes it, and still does whatever it
   * was a press on: a card is still picked up, another tool still opens. The
   * note is already saved, so nothing is lost by it.
   *
   * Listened for on the way down rather than on click, so the popup is gone
   * before a drag that starts outside it gets going.
   */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || panelRef.current?.contains(target)) return;
      // The toolbar button for the tool already open. Pressing it again would
      // close the popup and open it straight back, flashing the note away and
      // losing the cursor, for no change at all — and pressed while the popup
      // is fading, it is somebody asking for it back.
      if (target.closest(OPEN_TOOL_BUTTON)) {
        if (closingRef.current) cancelClose();
        return;
      }
      beginClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [beginClose, cancelClose]);

  /**
   * Closing from inside the popup, by Escape or the close button, puts focus
   * back on whatever opened it. Without a dialog to do that, somebody on the
   * keyboard would be left with focus on nothing. A press outside does not:
   * focus belongs to whatever was pressed.
   */
  function dismiss() {
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    beginClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prepared = prepareStickyText(text);
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }

    setValidationError(null);
    const proposed = await submitArtifact({ type: 'sticky', text: prepared.text, color });
    // Cleared once it has landed, here rather than when the popup closes: the
    // popup can be closed while the proposal is still on its way, and a note
    // already on the board should not come back as a draft next time.
    if (proposed && draftKey) clearStickyDraft(draftKey);
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  const error = validationError ?? submissionError;
  const label = editSource
    ? 'Edit sticky'
    : extensionSource
      ? isReusingOwn
        ? 'Reusing your sticky'
        : `Extending ${extensionSource.authorName}'s sticky`
      : 'New sticky';

  // Portalled to the body, like the board's other popovers, so the canvas's
  // scale transform is not its containing block and it is placed against the
  // window it was measured in.
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="sticky-composer-label"
      className={`fixed z-40 text-rt-ink ${closing ? 'pointer-events-none' : ''}`}
      style={placement ?? CENTRED}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        dismiss();
      }}
    >
      {/* The rise is on the paper, not on the panel around it: the panel is
          what is positioned, and in the workbench that position is itself a
          transform, which an animated one would overwrite. */}
      <form
        className={`${closing ? 'rt-sticky-popup-fade' : 'rt-sticky-popup-rise'} p-6`}
        // Bare paper, exactly as it will sit on the board: no outline, square
        // corners, and the shadow that falls below it.
        style={{
          width: POPUP_WIDTH,
          background: theme.bg,
          borderRadius: STICKY_RADIUS,
          boxShadow: STICKY_SHADOW,
        }}
        onKeyDown={onFormKeyDown}
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            id="sticky-composer-label"
            className="pt-1 text-[11px] leading-snug font-semibold tracking-[0.14em] text-rt-ink/70 uppercase"
          >
            {label}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rt-ink/20 text-rt-ink/70 transition-colors hover:bg-rt-ink/8 hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none"
          >
            <X aria-hidden="true" size={15} strokeWidth={2.4} />
          </button>
        </div>

        <label htmlFor="sticky-text" className="sr-only">
          Note
        </label>
        <textarea
          id="sticky-text"
          ref={noteRef}
          autoFocus
          maxLength={STICKY_TEXT_LIMIT}
          rows={1}
          placeholder="Capture the idea in one clear note"
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            // Refused only when it adds text, so deleting always works, even
            // on a note that arrived too long for its paper.
            if (next.length > text.length && !stickyFits(next)) {
              setPaperFull(true);
              return;
            }
            setPaperFull(false);
            setText(next);
            setValidationError(null);
            if (submissionError) resetSubmission();
          }}
          className="mt-3 min-h-[124px] w-full resize-none overflow-hidden bg-transparent text-[19px] leading-relaxed font-medium text-rt-ink outline-none transition-[height] duration-150 ease-out placeholder:text-rt-ink/35 motion-reduce:transition-none"
        />

        {error ? (
          <p role="alert" className="mb-1 text-[12px] leading-relaxed text-rt-secondary-deep">
            {error}
          </p>
        ) : null}

        {/* Torn along the same line the paper would tear: the note above it,
            what the note is made of below. */}
        <div className="mt-2 flex items-center gap-3 border-t border-dashed border-rt-ink/25 pt-3">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Colour</legend>
            {STICKY_COLORS.map((option) => {
              const optionTheme = STICKY_THEMES[option];
              const selected = color === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-label={`${option} sticky`}
                  aria-pressed={selected}
                  title={option[0]?.toUpperCase() + option.slice(1)}
                  onClick={() => setColor(option)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:ring-offset-2 focus-visible:outline-none"
                  style={{
                    background: optionTheme.bg,
                    // The chosen one is ringed in the ink the note is written
                    // in, since the paper itself carries no outline to echo.
                    borderColor: selected ? '#080C15' : optionTheme.border,
                  }}
                />
              );
            })}
          </fieldset>

          <span
            className={`ml-auto text-[12px] tabular-nums ${
              text.length >= STICKY_TEXT_LIMIT || paperFull
                ? 'text-rt-secondary-deep'
                : 'text-rt-ink/55'
            }`}
            aria-live="polite"
          >
            {text.length} / {STICKY_TEXT_LIMIT}
          </span>

          <Button
            type="submit"
            disabled={!isLive || submissionStatus === 'submitting'}
            title={isLive ? 'Propose sticky (Ctrl+Enter)' : 'Reconnect before proposing'}
          >
            {submissionStatus === 'submitting' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
            ) : null}
            {submissionStatus === 'submitting' ? 'Proposing' : 'Propose'}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
