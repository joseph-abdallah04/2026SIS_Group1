import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, X } from 'lucide-react';
import type { StickyColor } from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
import { closingFades } from '../../../lib/motion';
import { CENTRED_ON_WINDOW, placeAboveBoardToolbar } from '../../pinboard/boardPopup';
import { STICKY_RADIUS, STICKY_SHADOW, STICKY_THEMES } from '../../pinboard/pinboardTokens';
import { prepareStickyText, STICKY_MAX_LINES, STICKY_TEXT_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import { EXTEND_UNCHANGED_HINT } from '../proposeErrors';
import {
  NO_STICKY_FORMAT,
  RichStickyField,
  StickyFormatBar,
  type RichStickyFieldHandle,
  type StickyFormat,
} from './RichStickyField';
import {
  clearStickyDraft,
  readStickyDraft,
  sourceDraftKeyFor,
  writeStickyDraft,
} from './stickyDraft';
import {
  formatForArtifact,
  lineCount,
  sameNote,
  toStickyNote,
  type StickyNote,
} from './stickyMarks';

const STICKY_COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];

const POPUP_WIDTH = 'min(92vw, 520px)';
const POPUP_MAX_WIDTH_PX = 520;
/** How long the popup takes to fade out; the same as `.rt-sticky-popup-fade`. */
const EXIT_MS = 150;
/** The toolbar button for the tool that is already open. */
const OPEN_TOOL_BUTTON = '[data-creative-toolbar] button[aria-pressed="true"]';
/**
 * How tall the note grows before it scrolls: about a dozen lines at the popup's
 * size, which a note at the limit in ordinary prose stays within, and short
 * enough that the popup and its close button stay on a small laptop's screen.
 */
const NOTE_MAX_HEIGHT_PX = 360;

/** Where the popup rests over the board; see `placeAboveBoardToolbar`. */
const placeAboveFooter = () =>
  placeAboveBoardToolbar(Math.min(window.innerWidth * 0.92, POPUP_MAX_WIDTH_PX));

/**
 * Writing a sticky, as a note you write on rather than a room you enter.
 *
 * A sticky is a short note and a colour. A full-screen studio for
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
    isReusing,
    isExtendingOwn,
    editSource,
    isLive,
    resetSubmission,
    stickyDraftKey,
    submissionError,
    submissionStatus,
    submitArtifact,
  } = useCreativeTools();
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<RichStickyFieldHandle>(null);
  // Read while rendering, before the note takes focus, so this is whatever
  // opened the popup: the toolbar button, or a card's Extend.
  const [opener] = useState(() => document.activeElement);
  // Whether that was reached from the keyboard, which is when it shows a ring.
  // Pressed with a pointer it is focused all the same, but without one.
  const [openedFromKeyboard] = useState(() => showsFocusRing(opener));
  // Editing rewrites this proposal; extending starts a new one from it.
  const sourceProposal = editSource ?? extensionSource;
  const sourceArtifact =
    sourceProposal?.artifactJson.type === 'sticky' ? sourceProposal.artifactJson : null;
  /**
   * Every sticky being written is a draft: a new one, and each proposal being
   * edited or extended, apart from one another and keyed to that proposal. So
   * closing the popup loses nothing, whatever it was opened for, and one note's
   * words never open in another.
   *
   * Decided once, when the popup opens, along with whether it is an edit and
   * what it was opened on. Closing clears the source a render before the popup
   * itself goes, and a key worked out afresh in that render would take an edit
   * for a new sticky and save its words over the new sticky's draft.
   */
  const [draftKey] = useState(() =>
    stickyDraftKey && sourceProposal
      ? sourceDraftKeyFor(stickyDraftKey, editSource ? 'edit' : 'extend', sourceProposal.id)
      : stickyDraftKey,
  );
  const [editing] = useState(() => editSource !== null);
  // Decided once for the same reason: closing clears what the popup was opened
  // from a render before the popup goes.
  const [reusing] = useState(() => isReusing);
  const [source] = useState(() => sourceArtifact);
  const [saved] = useState(() => (draftKey ? readStickyDraft(draftKey) : null));
  // A kept draft is what was last written, so it wins over the proposal it was
  // started from: that proposal is already in it.
  const [note, setNote] = useState<StickyNote>(() => toStickyNote(saved ?? source ?? { text: '' }));
  const [color, setColor] = useState<StickyColor>(saved?.color ?? source?.color ?? 'yellow');
  const [validationError, setValidationError] = useState<string | null>(null);
  // What the selection is set in, for the toolbar.
  const [format, setFormat] = useState<StickyFormat>(NO_STICKY_FORMAT);
  /**
   * An extension that still says exactly what its original says, set the same
   * way. Proposing it would put an identical card on the board marked as
   * building on the first, so Propose waits for a change — the words, their
   * formatting, or the colour. Reuse is exempt: bringing your idea to a new
   * question unchanged is the point of it. Measured against the source as it
   * was when the popup opened, which closing does not clear.
   */
  const unchangedExtension =
    !editing && !reusing && source !== null && color === source.color && sameNote(note, source);

  const theme = STICKY_THEMES[color];
  const [placement, setPlacement] = useState(placeAboveFooter);

  useEffect(() => {
    const onResize = () => setPlacement(placeAboveFooter());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
   * Saved as it is typed, colour and formatting included, so closing the popup by any route —
   * a press outside it, Escape, the close button, a refresh — keeps the note.
   *
   * Not once it has been proposed, and not while it is on its way out. The
   * draft is cleared the moment a proposal lands, and the popup fades for a
   * moment after that with the note still focused; a keystroke then would
   * write the proposed note straight back and open it again next time.
   *
   * Runs only when the note or its colour changes, and reads those two
   * conditions from refs rather than depending on them. Depending on the
   * submission status re-ran the save when closing reset that status to idle,
   * a render before the popup went, and wrote the proposed note back anyway.
   */
  const proposedRef = useRef(false);
  useEffect(() => {
    if (!draftKey || closingRef.current || proposedRef.current) return;
    // An edit or extension left exactly as the proposal it opened on is not a
    // draft, so an untouched popup keeps nothing, and opens on the proposal as
    // it is next time.
    if (source && color === source.color && sameNote(note, source)) {
      clearStickyDraft(draftKey);
    } else {
      writeStickyDraft(draftKey, { ...note, color });
    }
  }, [draftKey, note, color, source]);

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
   * back on whatever opened it, if that was reached from the keyboard. Without
   * a dialog to do that, somebody on the keyboard would be left with focus on
   * nothing. A press outside does not: focus belongs to whatever was pressed.
   *
   * Opened with a pointer, it is left alone. Escape is a key, so focus put
   * back by it draws the keyboard's ring round the button or the card, for
   * somebody who never used the keyboard to get there.
   */
  function dismiss() {
    if (openedFromKeyboard && opener instanceof HTMLElement && opener.isConnected) {
      opener.focus();
    }
    beginClose();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Ctrl+Enter submits without going through the disabled button.
    if (unchangedExtension) return;
    const prepared = prepareStickyText(note.text);
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }

    setValidationError(null);
    const proposed = await submitArtifact({
      type: 'sticky',
      text: prepared.text,
      color,
      ...formatForArtifact(note),
    });
    // Cleared once it has landed, here rather than when the popup closes: the
    // popup can be closed while the proposal is still on its way, and a note
    // already on the board should not come back as a draft next time.
    if (proposed) {
      proposedRef.current = true;
      if (draftKey) clearStickyDraft(draftKey);
    }
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  const error = validationError ?? submissionError;
  const noteFull = note.text.length >= STICKY_TEXT_LIMIT;
  const linesFull = lineCount(note.text) >= STICKY_MAX_LINES;
  const label = editSource
    ? 'Edit sticky'
    : extensionSource
      ? isReusing
        ? 'Reusing your sticky'
        : isExtendingOwn
          ? 'Extending your sticky'
          : `Extending ${extensionSource.authorName}'s sticky`
      : 'New sticky';
  const proposeTitle = !isLive
    ? `Reconnect before ${editing ? 'updating' : 'proposing'}`
    : unchangedExtension
      ? EXTEND_UNCHANGED_HINT
      : `${editing ? 'Update proposal' : 'Propose sticky'} (Ctrl+Enter)`;

  // Portalled to the body, like the board's other popovers, so the canvas's
  // scale transform is not its containing block and it is placed against the
  // window it was measured in.
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="sticky-composer-label"
      className={`fixed z-40 text-rt-ink ${closing ? 'pointer-events-none' : ''}`}
      style={placement ?? CENTRED_ON_WINDOW}
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

        {/* The note's formatting, above the note it applies to. Pressing a
            button keeps the selection in the note, so it styles what was
            selected, or what is typed next. */}
        <StickyFormatBar
          field={fieldRef}
          active={format}
          disabled={closing}
          className="mt-2 -ml-1.5"
        />

        <div className="mt-1">
          <RichStickyField
            ref={fieldRef}
            id="sticky-text"
            label="Note"
            value={note}
            limit={STICKY_TEXT_LIMIT}
            lineLimit={STICKY_MAX_LINES}
            autoFocus
            readOnly={closing}
            maxHeight={NOTE_MAX_HEIGHT_PX}
            placeholder="Capture the idea in one clear note"
            onFormatChange={setFormat}
            onChange={(next) => {
              // On its way out, so there is nowhere for more writing to go.
              if (closingRef.current) return;
              setNote(next);
              setValidationError(null);
              if (submissionError) resetSubmission();
            }}
            className="min-h-[124px] text-[19px] leading-relaxed font-medium text-rt-ink"
          />
        </div>

        {error ? (
          <p role="alert" className="mb-1 text-[12px] leading-relaxed text-rt-secondary-deep">
            {error}
          </p>
        ) : unchangedExtension ? (
          // Said on the paper rather than only in a tooltip: a Propose button
          // that is dead for no visible reason looks broken.
          <p className="mb-1 text-[12px] leading-relaxed text-rt-ink/60">{EXTEND_UNCHANGED_HINT}</p>
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

          {/* "Full" once the note is at its limit and nothing more will go in,
              and the line limit once Enter will not start another line. */}
          <span
            className={`ml-auto text-[12px] tabular-nums ${
              noteFull || linesFull ? 'font-semibold text-rt-secondary-deep' : 'text-rt-ink/55'
            }`}
            aria-live="polite"
          >
            {noteFull
              ? 'Full'
              : linesFull
                ? `${STICKY_MAX_LINES} lines max`
                : `${note.text.length} / ${STICKY_TEXT_LIMIT}`}
          </span>

          {/* An edit rewrites a proposal already on the board, so it says so
              rather than offering to propose it again. */}
          <Button
            type="submit"
            disabled={!isLive || unchangedExtension || submissionStatus === 'submitting'}
            title={proposeTitle}
          >
            {submissionStatus === 'submitting' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
            ) : null}
            {submissionStatus === 'submitting'
              ? editing
                ? 'Updating'
                : 'Proposing'
              : editing
                ? 'Update proposal'
                : 'Propose'}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/**
 * Whether an element is showing the keyboard's focus ring. Where the browser
 * cannot say, it is taken to be, so focus still goes back as it always did.
 */
function showsFocusRing(element: Element | null): boolean {
  if (!element) return false;
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}
