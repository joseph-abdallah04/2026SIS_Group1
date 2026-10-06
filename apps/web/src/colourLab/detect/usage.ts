import { type Use } from '../engine/cssom';
import { type SlotKey } from '../model/slots';

/** Elements checked per selector before giving up on finding one that is showing. */
const LOOK_AT = 40;

function isShowing(element: Element): boolean {
  if (element.getClientRects().length > 0) return true;
  // display: contents has no box of its own, but its children do.
  try {
    return getComputedStyle(element).display === 'contents';
  } catch {
    return false;
  }
}

/** Whether anything the selector matches is on screen. A selector the browser rejects is not. */
function selectorShows(selector: string): boolean {
  try {
    const found = document.querySelectorAll(selector);
    const limit = Math.min(found.length, LOOK_AT);
    for (let i = 0; i < limit; i++) {
      const element = found[i];
      if (element && isShowing(element)) return true;
    }
  } catch {
    // An invalid selector, left over from stripping a state out of it.
  }
  return false;
}

function runningAnimations(): Set<string> {
  const names = new Set<string>();
  try {
    for (const animation of document.getAnimations()) {
      const name = (animation as Partial<CSSAnimation>).animationName;
      if (name) names.add(name);
    }
  } catch {
    // No Web Animations: keyframe colours are then never reported as in use.
  }
  return names;
}

/** Whether a media query holds now, asked once per query however many rules use it. */
function mediaCheck(): (text: string) => boolean {
  const known = new Map<string, boolean>();
  return (text) => {
    let result = known.get(text);
    if (result === undefined) {
      result = window.matchMedia?.(text).matches ?? true;
      known.set(text, result);
    }
    return result;
  };
}

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), { timeout: 200 });
    else setTimeout(resolve, 0);
  });

/** The longest the check runs before handing the thread back. */
const SLICE_MS = 8;

/**
 * Which slots are in use on the page right now, and how many places each is.
 *
 * A stylesheet rule counts when something it styles is showing. That is every
 * Tailwind utility in the app, so a class the page never uses is rightly not
 * counted. Hover, focus and pseudo-element rules count when the element they
 * belong to is on screen, since the state is the user's to cause.
 *
 * Works in slices so a big page is not frozen while it is checked, and gives up
 * if `current` says a newer check has started.
 */
export async function computeUsage(
  uses: readonly Use[],
  elementCounts: readonly ReadonlyMap<SlotKey, number>[],
  current: () => boolean,
): Promise<Map<SlotKey, number> | null> {
  const counts = new Map<SlotKey, number>();
  const showing = new Map<string, boolean>();
  const mediaHolds = mediaCheck();
  const animating = runningAnimations();

  let sliceStart = performance.now();
  for (const use of uses) {
    if (performance.now() - sliceStart > SLICE_MS) {
      await yieldToBrowser();
      if (!current()) return null;
      sliceStart = performance.now();
    }
    if (!use.media.every(mediaHolds)) continue;
    let used: boolean;
    if (use.selector === null) {
      used = use.keyframes !== null && animating.has(use.keyframes);
    } else {
      let shows = showing.get(use.selector);
      if (shows === undefined) {
        shows = selectorShows(use.selector);
        showing.set(use.selector, shows);
      }
      used = shows;
    }
    if (used) counts.set(use.slot, (counts.get(use.slot) ?? 0) + 1);
  }

  for (const source of elementCounts) {
    for (const [slot, count] of source) counts.set(slot, (counts.get(slot) ?? 0) + count);
  }
  return counts;
}

/** The elements a slot is painted on, for outlining. Capped: a colour like ink is on everything. */
export function elementsUsing(
  slot: SlotKey,
  uses: readonly Use[],
  extra: readonly Element[],
  limit = 80,
): Element[] {
  const found = new Set<Element>(extra.slice(0, limit));
  const mediaHolds = mediaCheck();
  for (const use of uses) {
    if (found.size >= limit) break;
    if (use.slot !== slot || use.selector === null || !use.media.every(mediaHolds)) continue;
    try {
      for (const element of Array.from(document.querySelectorAll(use.selector))) {
        if (found.size >= limit) break;
        if (isShowing(element)) found.add(element);
      }
    } catch {
      // Not a selector the browser accepts.
    }
  }
  return [...found];
}
