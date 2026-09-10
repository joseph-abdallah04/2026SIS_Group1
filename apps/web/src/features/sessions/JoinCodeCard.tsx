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
 * full code + link fields; this is the same code, small enough to sit at the
 * foot of the participant rail after the lobby is gone.
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
    <div className="rounded-2xl border border-rt-secondary/20 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
          Join code
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-[11px] font-semibold text-rt-primary-deep hover:opacity-70"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <input
        ref={inputRef}
        readOnly
        value={code}
        aria-label="Join code"
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 w-full bg-transparent font-mono text-[13px] tracking-[0.06em] text-rt-ink outline-none"
      />
      {failed ? (
        <p className="mt-1 text-[11px] leading-snug text-rt-ink-muted">
          Select the code and copy it yourself (Cmd+C).
        </p>
      ) : null}
    </div>
  );
}
