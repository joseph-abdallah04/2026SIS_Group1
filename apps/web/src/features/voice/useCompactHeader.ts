import { useEffect, useState } from 'react';

/**
 * Below this the board header shows one face fewer.
 *
 * The header's right side (faces, mic, Invite, the exit) is about 300px, and
 * the question on the left is what gives way, by truncating. Under 900px it is
 * down to a few words, and a face fewer hands it back about 20px.
 */
const COMPACT_MAX_WIDTH = 900;

/**
 * True while the header should show a reduced people snapshot.
 *
 * A media query rather than Tailwind's `hidden sm:flex`, because the two widths
 * need *different data*, not the same data styled twice: the speaking-promotion
 * in `splitForHeader` picks a different slot for each limit, so a CSS-hidden
 * bubble could hide a promoted speaker with nothing left to say so. Rendering
 * both sets instead would put every participant in the DOM twice and read the
 * room out twice to a screen reader.
 *
 * Defaults to `false` wherever `matchMedia` is missing — older browsers, and
 * jsdom, where the full-width case is the one worth testing by default.
 */
export function useCompactHeader(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia(`(max-width: ${COMPACT_MAX_WIDTH - 1}px)`);
    setCompact(query.matches);

    // `addEventListener` on a MediaQueryList needs Safari 14+; the deprecated
    // `addListener` covers older ones. No fallback is written because the app
    // already requires newer than that — the session view is sized with
    // `h-dvh`, which is Safari 15.4+.
    const onChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return compact;
}
