import { useState } from 'react';
import { Download } from 'lucide-react';

import { api } from '../../lib/api';
import { saveBlob } from '../../lib/saveBlob';
import type { RecapStatusNote } from './RecapStatus';
import { RECAP_HEADER_BUTTON, RECAP_HEADER_BUTTON_PRIMARY } from './recapButtons';

const FALLBACK_FILENAME = 'session-recap.pdf';

/** The viewer's IANA zone, so the file's times match the page's. None if the browser will not say. */
function viewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * S04: the recap PDF is built and sent by GET /api/sessions/:id/summary.pdf.
 * This only asks for that file — the server decides who may have it, what is
 * in it, and what it is called. It sends the viewer's time zone, so the times
 * in the file are the ones the page shows.
 *
 * A fetch rather than a link because the request has to carry the bearer
 * token in a header (see `api.download`). How it went is said through the
 * page's one status region (`report`), not beside the button.
 */
export function DownloadRecapButton({
  sessionId,
  report,
}: {
  sessionId: string;
  report: (note: RecapStatusNote) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    const zone = viewerTimeZone();
    try {
      const { blob, filename } = await api.download(
        `/api/sessions/${encodeURIComponent(sessionId)}/summary.pdf${
          zone ? `?tz=${encodeURIComponent(zone)}` : ''
        }`,
      );
      const name = filename ?? FALLBACK_FILENAME;
      saveBlob(blob, name);
      report({ ok: true, text: `Downloaded ${name}` });
    } catch (err) {
      report({
        ok: false,
        text: err instanceof Error ? err.message : 'Could not download the summary',
      });
    } finally {
      setBusy(false);
    }
  }

  // Named by `aria-label` too, because on a phone the words are hidden and
  // only the icon is left.
  return (
    <button
      type="button"
      onClick={() => void onDownload()}
      disabled={busy}
      aria-label={busy ? 'Preparing the PDF' : 'Download PDF'}
      title="Download the summary as a PDF"
      className={`${RECAP_HEADER_BUTTON} ${RECAP_HEADER_BUTTON_PRIMARY}`}
    >
      <Download aria-hidden size={15} strokeWidth={2} className={busy ? 'animate-pulse' : ''} />
      <span className="hidden sm:inline">{busy ? 'Preparing…' : 'Download PDF'}</span>
    </button>
  );
}
