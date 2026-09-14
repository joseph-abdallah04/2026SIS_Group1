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
 * board's header under the item count once the lobby is gone.
 *
 * One short row, not a card: it shares the height of a single header pill with
 * the count and live dot above it, so anything taller would make the whole
 * header taller. The copy-failed hint is the one thing that cannot fit on the
 * line, so it drops below the header instead of pushing it open.
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
    <div className="relative flex h-4.5 items-center gap-1.5 rounded-full border border-rt-secondary/20 bg-white px-2 shadow-sm">
      <span className="text-[9px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        Join code
      </span>
      {/* Sized to the code rather than to the container: a `w-full` field in a
          flex row would stretch the header's whole right-hand group. The width
          has to carry the tracking as well as the glyphs — `ch` measures the
          advance of one character and knows nothing about `tracking`, so a
          bare `9ch` leaves the 9-character code ~0.54em short and an input
          clips the overflow rather than growing, cutting off the last
          character. */}
      <input
        ref={inputRef}
        readOnly
        value={code}
        aria-label="Join code"
        onFocus={(e) => e.currentTarget.select()}
        className="w-[calc(9ch_+_0.6em)] bg-transparent font-mono text-[11px] leading-none tracking-[0.06em] text-rt-ink outline-none"
      />
      <button
        type="button"
        onClick={() => void copy()}
        className="text-[10.5px] leading-none font-semibold text-rt-primary-deep hover:opacity-70"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {failed ? (
        <p
          role="status"
          className="absolute top-full right-0 z-40 mt-2 w-max rounded-lg border border-rt-tertiary bg-white px-2 py-1 text-[11px] leading-snug text-rt-ink-muted shadow-sm"
        >
          Select the code and copy it yourself (Cmd+C).
        </p>
      ) : null}
    </div>
  );
}
