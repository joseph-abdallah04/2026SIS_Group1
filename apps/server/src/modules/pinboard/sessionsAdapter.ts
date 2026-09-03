// The `sessions` module now exists — this file used to stand in for its
// public surface (docs/02 §2 permits exactly one file per module to do that
// while the real module doesn't exist yet). Collapsed to a re-export; no
// other file in `pinboard/` changes.
export { getActiveQuestion, getQuestion, getSession } from '../sessions/index.js';
