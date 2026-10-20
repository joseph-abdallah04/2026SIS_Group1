/**
 * What a page hands the session's page as it goes there: that the room has
 * just been opened, so the waiting room flips its join code in, once, as the
 * room's arrival.
 */
export interface WaitingRoomState {
  justOpened?: boolean;
}

/** Where to go once a room is open, and how. */
export const JUST_OPENED = {
  replace: true,
  state: { justOpened: true } satisfies WaitingRoomState,
};
