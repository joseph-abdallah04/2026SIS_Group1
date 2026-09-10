import { Download } from 'lucide-react';

import { getToken } from '../../lib/auth';

function recapPdfHref(sessionId: string): string {
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/summary.pdf`;
  const token = getToken();
  if (!token) return path;
  return `${path}?token=${encodeURIComponent(token)}`;
}

/**
 * S04: the recap PDF is built and sent by GET /api/sessions/:id/summary.pdf.
 * This is only a link to that endpoint — the browser downloads the file.
 */
export function DownloadRecapButton({ sessionId }: { sessionId: string }) {
  return (
    <a
      href={recapPdfHref(sessionId)}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-rt-secondary px-4 text-[13px] font-semibold text-rt-ink shadow-sm transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      <Download aria-hidden="true" size={16} strokeWidth={2} />
      Download Session Summary
    </a>
  );
}
