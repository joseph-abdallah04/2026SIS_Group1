// What an arrow's endpoints can be bound to, on a given canvas.
//
// The lookup lives in `@roundtable/shared` (`studioScene.ts`), so the editor,
// the board card and the recap PDF all bind an arrow to the same point of the
// same shape. Re-exported here for the studio's existing imports.

export { arrowTargetLookup, arrowTargets, type ArrowTargetScene } from '@roundtable/shared';
