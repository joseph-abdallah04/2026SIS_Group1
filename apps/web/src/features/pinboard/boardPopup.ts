import type { CSSProperties } from 'react';

/** Between a popup and the board's floating toolbar it rests on. */
export const FOOTER_GAP_PX = 12;
/** Kept clear of the window's edge when the toolbar sits near it. */
export const EDGE_PX = 16;
/**
 * How far above the board's middle a popup over it sits.
 *
 * Dead centre reads low: the board's toolbar and its hints occupy the bottom of
 * the frame, so the space a popup is centred in is effectively shorter than the
 * frame is. Lifted by this much, it looks centred in the room it actually has.
 */
const RAISE_PX = 20;

/** With no toolbar to rest on, as in the tools workbench: the middle of the window. */
export const CENTRED_ON_WINDOW: CSSProperties = {
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
};

/** Where a popup over the board sits, and how much room it has there. */
export interface BoardPopupRoom {
  /** The middle of the board, for a panel that centres itself on this point. */
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
}

/**
 * The middle of the board itself, and the room around it, for a popup that
 * belongs over the canvas rather than resting on its toolbar.
 *
 * Centred on the board's own frame, not the window: the agenda rail and the
 * panels beside the board are not the same width, so the middle of the window
 * is somewhere off to one side of what is being looked at. The room is the
 * frame's, so a popup can size itself to the board it sits over rather than to
 * a window most of which is not the board. Null where there is no board on
 * screen, as in the tools workbench, and the caller falls back to the window.
 */
export function boardPopupRoom(): BoardPopupRoom | null {
  return roomWithin(document.querySelector<HTMLElement>('[data-board-frame]'));
}

/**
 * The middle of whatever a popup is actually over.
 *
 * The board is not always the surface underneath. While the room is voting, the
 * ballot covers it, and a popup opened from a ballot card that centred on the
 * board behind would sit off the ballot's own middle by half the agenda rail —
 * measuring something nobody can see. So a surface says it is one with
 * `data-popup-room`, and a popup opened inside it is centred there instead.
 *
 * Null where neither is on screen, as in the tools workbench, and the caller
 * falls back to the window.
 */
export function popupRoomFrom(opener: Element | null): BoardPopupRoom | null {
  const surface = opener?.closest<HTMLElement>('[data-popup-room]');
  return surface ? roomWithin(surface) : boardPopupRoom();
}

function roomWithin(surface: HTMLElement | null): BoardPopupRoom | null {
  if (!surface) return null;

  const room = surface.getBoundingClientRect();
  return {
    left: room.left + room.width / 2,
    top: room.top + room.height / 2 - RAISE_PX,
    maxWidth: Math.max(0, room.width - EDGE_PX * 2),
    // The lift is taken off both ends, so being raised cannot push a tall one
    // off the top of the board.
    maxHeight: Math.max(0, room.height - (EDGE_PX + RAISE_PX) * 2),
  };
}

/**
 * Where a popup over the board goes: resting just above the board's floating
 * toolbar, centred on the board.
 *
 * Centred on the board's own toolbar row rather than on the window, because the
 * panels either side of the board are not the same width, and the middle of the
 * window is not the middle of the thing being worked on. Measured rather than
 * offset by a fixed amount for the same reason.
 *
 * Anchored by the bottom, so a popup that grows grows upward, away from the
 * toolbar, instead of down over it. Null when there is no toolbar on screen, as
 * in the tools workbench, and the caller centres it on the window instead.
 *
 * For a popup that belongs to the toolbar it was opened from, as the sticky
 * popup rising off it is. One that belongs to the board itself goes in the
 * middle of it: see `centreOnBoard`.
 */
export function placeAboveBoardToolbar(width: number): CSSProperties | null {
  const toolbar = document.querySelector<HTMLElement>('[data-creative-toolbar]');
  if (!toolbar) return null;

  const board = (
    toolbar.closest<HTMLElement>('[data-board-toolbar]') ?? toolbar
  ).getBoundingClientRect();
  const centred = board.left + board.width / 2 - width / 2;
  return {
    top: 'auto',
    right: 'auto',
    // The row spans the board but is only as tall as the toolbar, so its top
    // edge is the toolbar's and the popup rests just clear of it.
    bottom: window.innerHeight - board.top + FOOTER_GAP_PX,
    left: Math.max(EDGE_PX, Math.min(centred, window.innerWidth - width - EDGE_PX)),
  };
}
