import { useCallback, useEffect, useState } from 'react';

/** How long a note about an export, a copy or a download stays up. */
const STATUS_MS = 4000;

export interface RecapStatusNote {
  ok: boolean;
  text: string;
}

interface Shown extends RecapStatusNote {
  /** The same words said twice are two notes, so a second one restarts the timer. */
  id: number;
}

/** The summary's one note at a time: the last export, copy or download, for a few seconds. */
export function useRecapStatus() {
  const [status, setStatus] = useState<Shown | null>(null);
  const report = useCallback(
    (note: RecapStatusNote) => setStatus((current) => ({ ...note, id: (current?.id ?? 0) + 1 })),
    [],
  );
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);
  return { status, report };
}

/**
 * Where those notes are said: fixed to the window rather than set at the top
 * of the page, because the card a note is about is usually scrolled well
 * down. The board's own pill.
 *
 * The live region stays on the page and only its words change: one that
 * arrives together with its words is often not read out at all.
 */
export function RecapStatus({ status }: { status: (RecapStatusNote & { id: number }) | null }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
    >
      {status ? (
        <p
          key={status.id}
          className={`max-w-full rounded-2xl border bg-white px-3.5 py-1.5 text-center text-[11.5px] font-medium text-balance shadow-sm ${
            status.ok
              ? 'border-rt-secondary/40 text-rt-secondary-deep'
              : 'border-red-200 text-red-600'
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
