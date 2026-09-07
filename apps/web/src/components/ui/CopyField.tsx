import { useRef, useState } from 'react';

import { copyText } from '../../lib/copyText';
import { Button } from './Button';

interface CopyFieldProps {
  label: string;
  value: string;
}

/**
 * Copy from the visible field in the same tick as the click. Chrome will
 * accept `execCommand('copy')` on a focused, selected input during a user
 * gesture even when the async clipboard API reports success without writing
 * the OS clipboard.
 */
function copyFromField(input: HTMLInputElement): boolean {
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/** A selectable value with a Copy button — used for the join code and link. */
export function CopyField({ label, value }: CopyFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const fromField = inputRef.current ? copyFromField(inputRef.current) : false;
    const fromApi = await copyText(value);
    const ok = fromField || fromApi;
    setCopied(ok);
    setFailed(!ok);
    if (ok) setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-rt-ink-faint">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-rt-tertiary bg-rt-surface-alt px-3 py-2 font-mono text-[13px] text-rt-ink outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary"
        />
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {failed && (
        <p className="text-[12px] text-rt-ink-muted">
          Could not copy automatically — select the field and copy it yourself (Cmd+C).
        </p>
      )}
    </div>
  );
}
