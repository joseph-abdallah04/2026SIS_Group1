/**
 * Copy a string to the clipboard. `navigator.clipboard.writeText` is the
 * modern path, but it is missing or throws in some embedded browsers (and
 * any non-secure origin). The textarea + `execCommand('copy')` fallback
 * still runs inside the user-gesture of the click, which is what those
 * environments need.
 *
 * Returns whether *this page* accepted the copy — a sandboxed browser can
 * still report success without writing the host OS clipboard.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the older path rather than surfacing a "Copied" lie.
  }

  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    // Stay in the viewport: Chrome has been known to ignore copy from a
    // node parked at -9999px even when execCommand returns true.
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
