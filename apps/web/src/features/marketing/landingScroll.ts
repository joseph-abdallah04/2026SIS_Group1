/**
 * In-page jumps on the landing page.
 *
 * The header writes hashes into the URL (`#voting`, …). React never paints
 * those sections into the first HTML, so the browser cannot honour a hash on
 * load by itself — and the click handler `preventDefault`s, so it cannot
 * honour one after paint either. Both paths go through here.
 */

export function prefersReducedLandingMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function scrollToLandingHash(
  hash: string = typeof window === 'undefined' ? '' : window.location.hash,
  behavior?: ScrollBehavior,
): boolean {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!id) return false;
  const target = document.getElementById(id);
  if (!target) return false;
  const reduce = prefersReducedLandingMotion();
  target.scrollIntoView({
    behavior: behavior ?? (reduce ? 'auto' : 'smooth'),
    block: 'start',
  });
  return true;
}
