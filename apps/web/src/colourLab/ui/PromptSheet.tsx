import { ArrowLeft, Check, Copy, Download, FileUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { type LabEdits, parseState } from '../prompt/state';
import { type PromptResult } from '../prompt/renderLight';
import { copyText, readText, saveText, sizeOf } from './download';

interface PromptSheetProps {
  result: PromptResult;
  /** Whether the lab holds any colours of its own now, which loading would replace. */
  hasEdits: boolean;
  onClose: () => void;
  onLoad: (edits: LabEdits) => void;
}

const TITLES = { light: 'Light-theme prompt', dark: 'Dark-theme prompt' } as const;

/** The lines shown as a preview: enough to see what it is, not so many that it is a wall. */
const PREVIEW_LINES = 40;

/**
 * What one of the two prompts holds, and the ways to take it: saved as a text file, or copied. The
 * file is for pasting into Claude on `main`, and holds everything that Claude needs.
 */
export function PromptSheet({ result, hasEdits, onClose, onLoad }: PromptSheetProps) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState<LabEdits | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  // A click leaves the keyboard where it was, outside the lab. The sheet takes it, so Escape and Tab work here.
  useEffect(() => {
    sheet.current?.focus({ preventScroll: true });
  }, [result.kind]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const flash = (set: () => void, clear: () => void): void => {
    set();
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(clear, 2200);
  };

  const download = (): void => {
    saveText(result.text, result.filename);
    flash(
      () => setSaved(true),
      () => setSaved(false),
    );
  };

  const copy = async (): Promise<void> => {
    const ok = await copyText(result.text);
    flash(
      () => setCopied(ok),
      () => setCopied(null),
    );
  };

  const read = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setLoadError(null);
    const edits = parseState(await readText(file));
    if (!edits) {
      setLoadError('That file has no Colour Lab colours in it.');
      return;
    }
    if (hasEdits) setLoading(edits);
    else onLoad(edits);
  };

  const preview = result.text.split('\n').slice(0, PREVIEW_LINES).join('\n');

  return (
    <div
      className="cl-sheet"
      role="region"
      aria-label={TITLES[result.kind]}
      tabIndex={-1}
      ref={sheet}
    >
      <div className="cl-inspector-head">
        <button
          className="cl-icon-button"
          aria-label="Back to the list"
          title="Back to the list"
          onClick={onClose}
        >
          <ArrowLeft size={15} />
        </button>
        <b className="cl-sheet-title">{TITLES[result.kind]}</b>
      </div>

      {result.empty ? (
        <p className="cl-empty">
          {result.kind === 'light'
            ? 'There are no light-theme changes yet. Change a colour with Light showing, then come back.'
            : 'The dark theme has no colour that differs from the light one.'}
        </p>
      ) : (
        <>
          <p className="cl-note">
            A text file to give to Claude on <code>main</code>. It holds everything Claude needs,
            including a script that makes the changes.
          </p>
          <ul className="cl-sheet-summary">
            {result.summary.map((line) => (
              <li key={line}>{line.replace(/\*\*/g, '')}</li>
            ))}
          </ul>
          {result.warnings.length > 0 && (
            <p className="cl-sheet-warn" role="status">
              {result.warnings.length === 1
                ? '1 colour could not be read and is left out.'
                : `${result.warnings.length} colours could not be read and are left out.`}
            </p>
          )}
          <div className="cl-sheet-actions">
            <button className="cl-primary" onClick={download}>
              {saved ? <Check size={14} aria-hidden /> : <Download size={14} aria-hidden />}
              {saved ? 'Saved' : 'Download .txt'}
            </button>
            <button className="cl-secondary" onClick={() => void copy()}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied === true ? 'Copied' : copied === false ? 'Could not copy' : 'Copy'}
            </button>
          </div>
          <p className="cl-sheet-meta">
            {result.filename} · {sizeOf(result.text)}
          </p>
          <details className="cl-sheet-preview">
            <summary>Preview</summary>
            <pre>{preview}</pre>
          </details>
        </>
      )}

      <div className="cl-sheet-load">
        {loading ? (
          <div className="cl-sheet-confirm" role="alert">
            <span>Replace the colours you have now with the ones in that file?</span>
            <button
              className="cl-primary"
              onClick={() => {
                onLoad(loading);
                setLoading(null);
              }}
            >
              Replace
            </button>
            <button className="cl-secondary" onClick={() => setLoading(null)}>
              Keep mine
            </button>
          </div>
        ) : (
          <label className="cl-secondary cl-file">
            <FileUp size={14} aria-hidden />
            Load colours from a prompt…
            <input
              type="file"
              accept=".txt,.json,text/plain,application/json"
              onChange={(event) => {
                void read(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        )}
        {loadError && (
          <p className="cl-sheet-warn" role="alert">
            {loadError}
          </p>
        )}
      </div>
    </div>
  );
}
