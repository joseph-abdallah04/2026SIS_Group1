import { useState } from 'react';
import { Download } from 'lucide-react';

import { api } from '../../lib/api';

const FALLBACK_FILENAME = 'session-recap.pdf';

/** Hand the fetched bytes to the browser's downloader under the server's filename. */
function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/**
 * S04: the recap PDF is built and sent by GET /api/sessions/:id/summary.pdf.
 * This only asks for that file — the server decides who may have it, what is
 * in it, and what it is called.
 *
 * A fetch rather than a link because the request has to carry the bearer
 * token in a header (see `api.download`).
 */
export function DownloadRecapButton({ sessionId }: { sessionId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDownload() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await api.download(
        `/api/sessions/${encodeURIComponent(sessionId)}/summary.pdf`,
      );
      saveBlob(blob, filename ?? FALLBACK_FILENAME);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the summary');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      {error ? <span className="text-[12px] text-red-600">{error}</span> : null}
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={busy}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-rt-secondary px-4 text-[13px] font-semibold text-rt-ink shadow-sm transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        <Download aria-hidden="true" size={16} strokeWidth={2} />
        {busy ? 'Preparing…' : 'Download Session Summary'}
      </button>
    </span>
  );
}
