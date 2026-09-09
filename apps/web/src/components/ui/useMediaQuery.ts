import { useEffect, useState } from 'react';

/**
 * Whether a media query currently matches.
 *
 * For layout that cannot be expressed in CSS alone — the properties bar is
 * positioned by arithmetic, so "dock it at the bottom on a small screen" is a
 * decision the component has to make rather than a class it can wear.
 *
 * Starts false and corrects itself on mount: a server render and a first paint
 * have no window to ask, and guessing wrong for one frame is better than
 * guessing at all.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
