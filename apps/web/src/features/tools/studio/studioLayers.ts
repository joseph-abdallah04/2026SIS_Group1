// What sits over what, on a canvas covered in floating things.
//
// Everything used to be `z-20`. A popover inside a `z-20` toolbar only outranks
// that toolbar's own children — against a *sibling* toolbar at the same level,
// the browser falls back to document order, so a panel opened from the
// properties bar disappeared behind the tool rail because the rail happens to be
// rendered second. Ranking them here makes the order a decision rather than a
// consequence of the order the JSX happens to be written in.
//
// The rule the ranks encode: whatever you just opened is on top.

export const STUDIO_LAYER = {
  /** The rail, the history pair, the navigation cluster. Always present. */
  chrome: 'z-20',
  /** The properties bar. Belongs to the current selection, so it reads over the
   *  permanent furniture. */
  selection: 'z-30',
  /** A toolbar with one of its panels open, whichever toolbar that is. */
  open: 'z-40',
  /** A question that has to be answered before anything else happens. */
  prompt: 'z-50',
} as const;
