import { useRef, useState } from 'react';

import { copyText } from '../../lib/copyText';

interface JoinCodeCardProps {
  code: string;
}

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

/**
 * Compact invite chip for a live session. The waiting room already has the
 * full code + link fields; this is the same code, small enough to sit in the
 * board's footer beside the zoom control once the lobby is gone.
 *
 * One row, not a card: it lived at the foot of the participant rail until that
 * rail was retired (F13.2), and the footer it moved to is a single
 * `items-center` line. A two-row card there would make the whole footer taller.
 * The copy-failed hint is the one thing that cannot fit on the line, so it sits
 * above the footer instead of pushing it open.
 */
export function JoinCodeCard({ code }: JoinCodeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const fromField = inputRef.current ? copyFromField(inputRef.current) : false;
    const fromApi = await copyText(code);
    const ok = fromField || fromApi;
    setCopied(ok);
    setFailed(!ok);
    if (ok) setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative flex items-center gap-2 rounded-full border border-rt-secondary/20 bg-white px-2.5 py-1 shadow-sm">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        Join code
      </span>
      {/* Sized to the code rather than to the container: a `w-full` field in a
          flex row would stretch the footer's whole right-hand group. */}
      <input
        ref={inputRef}
        readOnly
        value={code}
        aria-label="Join code"
        onFocus={(e) => e.currentTarget.select()}
        className="w-[9ch] bg-transparent font-mono text-[12.5px] tracking-[0.06em] text-rt-ink outline-none"
      />
      <button
        type="button"
        onClick={() => void copy()}
        className="text-[11px] font-semibold text-rt-primary-deep hover:opacity-70"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {failed ? (
        <p
          role="status"
          className="absolute right-0 bottom-full mb-2 w-max rounded-lg border border-rt-tertiary bg-white px-2 py-1 text-[11px] leading-snug text-rt-ink-muted shadow-sm"
        >
          Select the code and copy it yourself (Cmd+C).
        </p>
      ) : null}
    </div>
  );
}
