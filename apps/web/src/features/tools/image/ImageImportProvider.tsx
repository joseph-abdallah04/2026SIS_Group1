import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useCreativeTools } from '../CreativeToolsContext';
import { ImageImportDialog } from './ImageImportDialog';
import { IMAGE_FILE_ACCEPT, isImageFile } from './imageEncoding';

interface ImageImportContextValue {
  /** Whether a picture can be brought in right now. */
  canImport: boolean;
  /** A picture is being framed, which is as good as an editor being open. */
  importing: boolean;
  /** Opens the file picker. */
  pickFile: () => void;
  /**
   * Starts importing a file already in hand — a drop or a paste. `at` is the
   * point on the board to put it, where it was dropped; without one it lands
   * in the middle of the view, like everything else proposed.
   */
  importFile: (file: File, at?: { x: number; y: number }) => void;
}

const ImageImportContext = createContext<ImageImportContextValue | null>(null);

/** Null outside a board — the tools workbench and some tests — where there is nowhere to import to. */
export function useImageImport(): ImageImportContextValue | null {
  return useContext(ImageImportContext);
}

/** Whether a paste is going somewhere that wants it: a text field, a note being written. */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/**
 * One way of bringing a picture onto the board, reached three ways.
 *
 * The toolbar's Image button opens the file picker; a file dropped on the
 * board, or a screenshot pasted while nothing else wants the paste, go straight
 * to the same dialog. All three end in the dialog rather than on the board: see
 * `ImageImportDialog` for why.
 *
 * Only one picture at a time. A second drop while one is open is ignored rather
 * than queued — nobody drops two files meaning to frame them in turn, and
 * replacing the first would throw away a crop somebody was part-way through.
 */
export function ImageImportProvider({ children }: { children: ReactNode }) {
  const { isLive, submissionStatus, activeTool, closeTool, proposeArtifact } = useCreativeTools();
  const [pending, setPending] = useState<{
    file: File;
    at?: { x: number; y: number };
    id: number;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canImport = isLive && submissionStatus !== 'submitting' && pending === null;

  const importFile = useCallback(
    (file: File, at?: { x: number; y: number }) => {
      if (!canImport || !isImageFile(file)) return;
      // One thing being made at a time. An open editor that refuses to close —
      // unsaved work it is asking about — keeps the picture out.
      if (activeTool && !closeTool()) return;
      setPending((current) => ({ file, at, id: (current?.id ?? 0) + 1 }));
    },
    [activeTool, canImport, closeTool],
  );

  const pickFile = useCallback(() => {
    if (!canImport) return;
    input.current?.click();
  }, [canImport]);

  // A screenshot pasted onto the board. Left alone while anything else could
  // want it: a text field, a sticky being written, an editor that is open.
  useEffect(() => {
    if (!canImport || activeTool) return;
    const onPaste = (event: ClipboardEvent) => {
      if (typingInto(event.target) || typingInto(document.activeElement)) return;
      const file = Array.from(event.clipboardData?.files ?? []).find(isImageFile);
      if (!file) return;
      event.preventDefault();
      importFile(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [activeTool, canImport, importFile]);

  return (
    <ImageImportContext.Provider
      value={{ canImport, importing: pending !== null, pickFile, importFile }}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept={IMAGE_FILE_ACCEPT}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared, so choosing the same file again still counts as a change.
          event.target.value = '';
          if (file) importFile(file);
        }}
      />
      {pending ? (
        <ImageImportDialog
          key={pending.id}
          file={pending.file}
          onPropose={(artifact) => proposeArtifact(artifact, { at: pending.at })}
          onClose={() => setPending(null)}
        />
      ) : null}
    </ImageImportContext.Provider>
  );
}
