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
 * The picture on the clipboard, if there is one.
 *
 * Read from the clipboard's files, and failing that its items: some browsers
 * and some apps that copy a picture put it only among the items, and a paste
 * that looked only at the files arrived empty-handed.
 */
export function pastedImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  const file = Array.from(data.files ?? []).find(isImageFile);
  if (file) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const fromItem = item.getAsFile();
    if (fromItem && isImageFile(fromItem)) return fromItem;
  }
  return null;
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

  // A screenshot, or a copied picture, pasted onto the board. Left alone while
  // an editor is open, which has its own idea of what a paste means.
  //
  // A text field keeps any paste with words in it. A picture with none goes
  // to the importer even then: a text field cannot take a picture, so leaving
  // it there threw the paste away, and somebody who had last clicked in the
  // agenda's question box saw nothing happen at all.
  useEffect(() => {
    if (!canImport || activeTool) return;
    const onPaste = (event: ClipboardEvent) => {
      const file = pastedImage(event.clipboardData);
      if (!file) return;
      const typing = typingInto(event.target) || typingInto(document.activeElement);
      // Words, not just a text entry: some apps copy a picture with an empty
      // one beside it, and that is no reason to keep the picture out.
      if (typing && (event.clipboardData?.getData('text/plain') ?? '').trim() !== '') return;
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
