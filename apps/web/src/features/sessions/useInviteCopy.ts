import { useCallback, useEffect, useRef, useState } from 'react';

import { copyText } from '../../lib/copyText';

/** How long a button says "Copied" before it goes back to its name. */
const COPIED_MS = 1500;

/**
 * Copy from a visible field in the same tick as the click, as `CopyField`
 * does: Chrome accepts `execCommand('copy')` on a focused, selected input
 * during a user gesture even where the async clipboard API reports success
 * without writing the OS clipboard.
 */
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
 * Copying a session's join code or invite link, and the "Copied" after it.
 *
 * Keyed, so one hook serves several buttons and only the one pressed changes.
 * `failed` names the one that could not be copied, so its caller can put the
 * value where it can be selected by hand.
 */
export function useInviteCopy<Key extends string>() {
  const [copied, setCopied] = useState<Key | null>(null);
  const [failed, setFailed] = useState<Key | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (key: Key, value: string, field?: HTMLInputElement | null) => {
    const fromField = field ? copyFromField(field) : false;
    const fromApi = await copyText(value);
    const ok = fromField || fromApi;
    window.clearTimeout(timer.current);
    setCopied(ok ? key : null);
    setFailed(ok ? null : key);
    if (ok) timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  }, []);

  return { copied, failed, copy };
}
