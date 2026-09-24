import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, LoaderCircle, RotateCcw, X } from 'lucide-react';
import type { ImageArtifact } from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
import { boardPopupRoom, CENTRED_ON_WINDOW, EDGE_PX } from '../../pinboard/boardPopup';
import type { ProposeResult } from '../CreativeToolsContext';
import { ImageCropper } from './ImageCropper';
import { fullCrop, isFullCrop, type CropRect } from './cropGeometry';
import { decodeImageFile, encodeImage, ImageImportError, type DecodedImage } from './imageEncoding';

/** As wide as it opens, where the board has room: the picture is the point of it. */
const PANEL_WIDTH = 600;
/**
 * Space round the picture on its stage. Enough for the frame's handles, which
 * sit half outside the picture on the edge a crop starts at, to be whole.
 */
const STAGE_PAD = 28;
/** The most height the picture itself may take, leaving the header and footer in view. */
const PICTURE_MAX_HEIGHT = 400;
/** What the header and footer take, which the picture's stage cannot have. */
const CHROME_HEIGHT = 130;

interface ImageImportDialogProps {
  file: File;
  /** Proposes the finished picture; the dialog closes itself once it lands. */
  onPropose: (artifact: ImageArtifact) => Promise<ProposeResult>;
  onClose: () => void;
  /**
   * Replaces the dialog's own encoder in tests, where there is no canvas to
   * draw with. Nothing in the app passes it.
   */
  encode?: typeof encodeImage;
  /** Likewise for the decoder: jsdom cannot read a picture. */
  decode?: typeof decodeImageFile;
}

type Loaded =
  | { state: 'reading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; decoded: DecodedImage; url: string };

/** Where the panel sits: in the middle of the board, sized to it. */
function panelStyle(): { style: CSSProperties; width: number; maxHeight: number } {
  const room = boardPopupRoom();
  const width = Math.min(PANEL_WIDTH, room?.maxWidth ?? window.innerWidth - EDGE_PX * 2);
  const maxHeight = room?.maxHeight ?? window.innerHeight - EDGE_PX * 2;
  return {
    style: {
      ...(room
        ? { left: room.left, top: room.top, transform: 'translate(-50%, -50%)' }
        : CENTRED_ON_WINDOW),
      width,
      maxHeight,
    },
    width,
    maxHeight,
  };
}

/**
 * Bringing a picture onto the board: crop it if it needs it, then propose it.
 *
 * Every way in — the toolbar, a drop, a paste — ends up here rather than
 * proposing straight away. A picture is usually too big and often has more in
 * it than the point being made; this is one screen to deal with both, and
 * pressing Propose without touching anything puts the whole picture up exactly
 * as it was chosen.
 *
 * No caption, like every other proposal: a card says what it says on its face,
 * and anything a picture needs saying beside it is said in the room, or on a
 * sticky next to it that everyone can react to.
 *
 * A light scrim behind it, unlike the board's other popups. This one is a task
 * with a result, and a press on the board behind it — starting a sticky, say —
 * would leave two half-made proposals open at once.
 */
export function ImageImportDialog({
  file,
  onPropose,
  onClose,
  encode = encodeImage,
  decode = decodeImageFile,
}: ImageImportDialogProps) {
  const titleId = useId();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'reading' });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState(panelStyle);
  const formRef = useRef<HTMLFormElement>(null);
  // Stays true across the await, so a second Enter cannot propose twice.
  const proposing = useRef(false);

  useEffect(() => {
    const onResize = () => setLayout(panelStyle());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Read once, for this file. The object URL shows the picture while it is
  // framed; the decoded copy is what gets cropped and encoded.
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    let bitmap: ImageBitmap | null = null;
    decode(file)
      .then((decoded) => {
        bitmap = decoded.bitmap;
        if (!live) {
          decoded.bitmap.close?.();
          return;
        }
        url = URL.createObjectURL(file);
        setLoaded({ state: 'ready', decoded, url });
        setCrop(fullCrop(decoded));
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setLoaded({
          state: 'failed',
          message:
            cause instanceof ImageImportError ? cause.message : 'This image could not be read.',
        });
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
      bitmap?.close?.();
    };
  }, [decode, file]);

  // Ready to propose the moment the picture is read: a drop and then Enter
  // puts the whole picture up without reaching for the mouse.
  useEffect(() => {
    if (loaded.state !== 'ready') return;
    formRef.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }, [loaded.state]);

  const close = () => {
    if (!proposing.current) onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (!proposing.current) onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const reset = () => {
    if (loaded.state !== 'ready') return;
    setCrop(fullCrop(loaded.decoded));
  };

  const propose = async () => {
    if (loaded.state !== 'ready' || !crop || proposing.current) return;
    proposing.current = true;
    setBusy(true);
    setError(null);
    try {
      const artifact = await encode(loaded.decoded, crop);
      const result = await onPropose(artifact);
      if (result.ok) {
        proposing.current = false;
        onClose();
        return;
      }
      setError(result.error);
    } catch (cause) {
      setError(
        cause instanceof ImageImportError ? cause.message : 'This image could not be prepared.',
      );
    }
    proposing.current = false;
    setBusy(false);
  };

  const pictureWidth = layout.width - STAGE_PAD * 2 - 2;
  const pictureHeight = Math.max(
    160,
    Math.min(PICTURE_MAX_HEIGHT, layout.maxHeight - CHROME_HEIGHT - STAGE_PAD * 2),
  );
  const cropped = loaded.state === 'ready' && crop !== null && !isFullCrop(crop, loaded.decoded);

  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div aria-hidden="true" className="absolute inset-0 bg-rt-ink/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="rt-enlarge-open absolute flex flex-col overflow-hidden rounded-3xl border border-rt-ink/15 bg-rt-surface shadow-[0_24px_64px_rgba(8,12,21,0.28)]"
        style={layout.style}
      >
        {/* The warm header every popup that makes a proposal wears, the studio
            and the board's own, so this reads as one of them. */}
        <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-rt-secondary/40 bg-rt-secondary-wash px-5">
          <ImageIcon aria-hidden="true" size={18} strokeWidth={1.8} className="text-rt-ink" />
          <h2 id={titleId} className="shrink-0 text-[15px] font-semibold text-rt-ink">
            Add an image
          </h2>
          <span className="min-w-0 truncate text-[12px] text-rt-ink-muted" title={file.name}>
            {file.name}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={busy}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-rt-ink-muted transition-colors hover:bg-rt-secondary/15 hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-ink focus-visible:outline-none disabled:opacity-45"
          >
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </header>

        <form
          ref={formRef}
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void propose();
          }}
        >
          {/* The stage: one fixed size whatever is on it, so the dialog does not
              change shape as a picture loads, and a tall picture and a wide one
              sit in the same frame. Grey rather than white, so a picture with a
              white edge still shows where it ends. */}
          <div
            className="flex shrink-0 items-center justify-center bg-rt-surface-alt"
            style={{ height: pictureHeight + STAGE_PAD * 2, padding: STAGE_PAD }}
          >
            {loaded.state === 'ready' && crop ? (
              <ImageCropper
                imageUrl={loaded.url}
                size={loaded.decoded}
                crop={crop}
                onCropChange={setCrop}
                maxWidth={pictureWidth}
                maxHeight={pictureHeight}
              />
            ) : loaded.state === 'failed' ? (
              <p role="alert" className="max-w-xs text-center text-[13px] text-rt-secondary-deep">
                {loaded.message}
              </p>
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-rt-ink-muted">
                <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
                Reading image…
              </p>
            )}
          </div>

          {/* One row: what can be done to the picture on the left, what can be
              done with it on the right. */}
          <div className="flex min-h-16 items-center gap-3 border-t border-rt-tertiary px-5 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {error ? (
                <p role="alert" className="text-[12px] leading-snug text-rt-secondary-deep">
                  {error}
                </p>
              ) : cropped && crop ? (
                <>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rt-tertiary px-3 py-1.5 text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-surface-alt hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none disabled:opacity-45"
                  >
                    <RotateCcw aria-hidden="true" size={13} strokeWidth={2} />
                    Reset
                  </button>
                  {/* Only once there is a crop: the size of a picture nobody has
                      touched says nothing, the size of a crop says how much of
                      it is left. */}
                  <span className="truncate text-[12px] text-rt-ink-faint tabular-nums">
                    {crop.width} × {crop.height}
                  </span>
                </>
              ) : loaded.state === 'ready' ? (
                // Nothing else on this screen says the picture can be cut down,
                // so it is said once, until somebody does it.
                <span className="text-[12px] leading-snug text-rt-ink-muted">
                  Drag the edges to crop, or propose it as it is.
                </span>
              ) : null}
            </div>
            <Button variant="quiet" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={loaded.state !== 'ready' || busy}>
              {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : null}
              {busy ? 'Proposing' : 'Propose image'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
