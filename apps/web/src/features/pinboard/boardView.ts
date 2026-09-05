/**
 * Where the viewer is currently looking, in board coordinates.
 *
 * The canvas owns pan and zoom, but the creative tools sit above it in the tree
 * and need to know the middle of the view to drop a new proposal there. Passing
 * it through React would mean re-rendering the tools on every frame of a pan,
 * so the canvas writes here instead and the tools read it once, at the moment
 * something is proposed.
 *
 * A module-level value is safe because exactly one board is on screen at a
 * time: the session page renders a single canvas.
 */
export interface BoardCentre {
  x: number;
  y: number;
}

let centre: BoardCentre | null = null;

/** Called by the canvas whenever the view moves. Cheap, and never re-renders. */
export function setBoardCentre(next: BoardCentre): void {
  centre = next;
}

/** Null before the board has been measured, e.g. in tool previews and tests. */
export function getBoardCentre(): BoardCentre | null {
  return centre;
}

/** The canvas is going away; the next board must not inherit this one's view. */
export function clearBoardCentre(): void {
  centre = null;
}
