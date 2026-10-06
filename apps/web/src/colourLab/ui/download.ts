/**
 * Saving and copying text. Written here and not borrowed from the app, so the lab asks nothing of
 * the code around it and a merge from `main` cannot break it.
 */

/** How long a saved file's address is kept: a download reads it after the click has returned. */
const REVOKE_AFTER_MS = 30_000;

/** Hands text to the browser's downloader as a file. */
export function saveText(text: string, filename: string): void {
  const href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), REVOKE_AFTER_MS);
}

/** Puts text on the clipboard. `false` if the browser would not. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older way rather than report a copy that did not happen.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  } catch {
    return false;
  }
}

/** `51 KB`, or `1.2 MB`, for a file of this many characters. */
export function sizeOf(text: string): string {
  const bytes = new Blob([text]).size;
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The text of a file the person chose. */
export function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
