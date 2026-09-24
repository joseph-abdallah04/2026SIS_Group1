/**
 * Whether an element is showing the keyboard's focus ring: whether it was
 * reached from the keyboard rather than pressed with a pointer.
 *
 * Where the browser cannot say, it is taken to be, so focus that used to be
 * put back is still put back.
 */
export function showsFocusRing(element: Element | null): boolean {
  if (!element) return false;
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** What Tab can reach inside `root`, in order. */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  );
}

/**
 * Keeps Tab inside a modal: from its last stop round to its first, and back.
 *
 * Also from anywhere outside it, back in. A press on the scrim leaves focus on
 * the page behind, and the next Tab would otherwise walk out across the board.
 * Call it from a document keydown listener while the modal is open.
 */
export function keepTabWithin(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const items = focusablesIn(root);
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (!(active instanceof Node) || !root.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
