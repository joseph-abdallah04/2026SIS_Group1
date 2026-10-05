/**
 * How long a saved file's object URL is kept alive.
 *
 * The download a click starts reads from the URL after the click has returned:
 * revoking it straight away, as this used to, can cancel the download in
 * Firefox and Safari. Half a minute is long past when any browser has started
 * reading, and it is only a reference to bytes already in memory.
 */
const REVOKE_AFTER_MS = 30_000;

/** Hand bytes to the browser's downloader under the given filename. */
export function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS);
}
