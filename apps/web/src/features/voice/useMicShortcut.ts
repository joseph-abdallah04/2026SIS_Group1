import { useEffect } from 'react';

/** Where an `m` is a letter someone is typing, not a shortcut. */
function isTypingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * `M` mutes and unmutes you (F12).
 *
 * A window listener rather than a handler on the button: the point of the
 * shortcut is that it works while you are panning the board or reading a card,
 * which is exactly when the button does not have focus.
 *
 * @param toggle Run on each press. Held keys repeat, so repeats are dropped —
 *   leaning on the key should not flap the room's mute state.
 * @param active False whenever the shortcut would be a lie (voice not
 *   connected, a toggle already in flight).
 */
export function useMicShortcut(toggle: () => void, active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'm' && event.key !== 'M') return;
      // Shift is allowed through — it is how the capital in "press M" is typed.
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingInto(event.target)) return;
      // A modal owns the screen: the creative studio, or a confirm dialog. The
      // board's shortcuts are not on offer underneath one.
      if (document.querySelector('dialog[open]')) return;

      event.preventDefault();
      toggle();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, active]);
}
