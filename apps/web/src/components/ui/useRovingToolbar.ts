import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

/**
 * Arrow-key movement inside a toolbar, with one tab stop for the whole thing.
 *
 * A toolbar is one control as far as Tab is concerned. Without this, tabbing
 * through the studio means pressing Tab twenty times to get past the tools —
 * which is the difference between a keyboard being usable and being technically
 * supported. Arrows move between the buttons; Tab leaves.
 *
 * The active stop is tracked on the DOM rather than in React state: which button
 * is focused is already the browser's business, and mirroring it into state only
 * creates a second copy to keep in step.
 */
export function useRovingToolbar<T extends HTMLElement>(orientation: 'horizontal' | 'vertical') {
  const ref = useRef<T | null>(null);

  const buttons = useCallback(
    () =>
      [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter(
        (button) => !button.disabled,
      ),
    [],
  );

  // Exactly one button is tabbable: the focused one, or the first if focus is
  // elsewhere. Re-run on every render, since which buttons exist changes with
  // the selection.
  useEffect(() => {
    const all = buttons();
    if (all.length === 0) return;
    const focused = all.find((button) => button === document.activeElement);
    for (const button of all) {
      button.tabIndex = button === (focused ?? all[0]) ? 0 : -1;
    }
  });

  const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const previous = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';

  function onKeyDown(event: KeyboardEvent<T>) {
    const keys = [next, previous, 'Home', 'End'];
    if (!keys.includes(event.key)) return;

    const all = buttons();
    if (all.length === 0) return;
    const from = all.indexOf(document.activeElement as HTMLButtonElement);
    if (from === -1) return;

    event.preventDefault();
    // Deliberately not stopped from bubbling further than this: the canvas uses
    // arrows to nudge a selection, and it only ever sees them when focus is on
    // the canvas rather than in here.
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? all.length - 1
          : // Wrapping, because a toolbar is a ring: running off the end of six
            // tools and stopping is a dead end nobody expects.
            (from + (event.key === next ? 1 : -1) + all.length) % all.length;
    all[to]?.focus();
  }

  return { ref, onKeyDown };
}
