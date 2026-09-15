/**
 * Whether closing fades. Not for anyone who has asked for less motion, and not
 * where there is no way to ask, which is only ever an environment with no
 * rendering at all: there, a close that waited on an animation would wait on
 * nothing.
 */
export function closingFades(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
