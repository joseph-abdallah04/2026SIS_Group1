// Keeping an unfinished canvas.
//
// Everything in the studio lives in memory until it is proposed. Closing the
// tool, reloading, or following a link away loses the lot, and the only thing
// standing between someone and that has been a `window.confirm`. A canvas is
// minutes of work — strokes, a laid-out diagram, a filled table — so it is kept
// as it is made.
//
// `sessionStorage` rather than `localStorage`, deliberately. A draft is worth
// surviving a reload or a mis-click on the back button; it is not worth
// reappearing next week on a question that has long since moved on. Tying its
// life to the tab bounds how stale a silently-restored draft can be.

import { diagramArtifactSchema } from '@roundtable/shared/schemas';
import type { DiagramArtifact } from '@roundtable/shared';

/**
 * What a draft belongs to.
 *
 * Composing, extending and editing produce different artifacts from the same
 * tool, so each keeps its own draft: a half-written extension must never be
 * offered to someone starting from scratch. An edit is keyed to the proposal it
 * rewrites, since that is what makes it a different piece of work.
 */
export interface StudioDraftScope {
  sessionId: string;
  questionId: string;
  mode: 'compose' | 'extend' | 'edit';
  /** The proposal being extended or edited; absent when composing. */
  sourceId?: string | null;
}

const PREFIX = 'rt.studio.draft';

export function studioDraftKey(scope: StudioDraftScope): string {
  const parts = [PREFIX, scope.sessionId, scope.questionId, scope.mode];
  if (scope.sourceId) parts.push(scope.sourceId);
  return parts.join(':');
}

/**
 * The draft for this scope, or null.
 *
 * Validated on the way out, not trusted. Storage is written by whatever build
 * of the app was running last, which may have had a shape this one does not
 * understand, and anything in it can also be edited by hand. The lenient read
 * schema is the same one the board uses for artifacts arriving from the server:
 * a draft it cannot make sense of is dropped rather than allowed to break the
 * editor it is loaded into.
 */
export function readStudioDraft(
  storage: Storage | undefined,
  scope: StudioDraftScope,
): DiagramArtifact | null {
  if (!storage) return null;

  let raw: string | null = null;
  try {
    raw = storage.getItem(studioDraftKey(scope));
  } catch {
    // Storage can be unavailable outright — a private window, or a browser set
    // to block it. Losing a draft is bad; refusing to open the editor is worse.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = diagramArtifactSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Keeps the draft, or gives up quietly.
 *
 * A failed write is never worth interrupting someone mid-draw for: storage
 * being full or blocked means the canvas is no safer than it was before this
 * existed, which is exactly where it has always been.
 */
export function writeStudioDraft(
  storage: Storage | undefined,
  scope: StudioDraftScope,
  artifact: DiagramArtifact,
): void {
  if (!storage) return;
  try {
    storage.setItem(studioDraftKey(scope), JSON.stringify(artifact));
  } catch {
    // Quota, or storage blocked. Nothing to do and nothing to say.
  }
}

export function clearStudioDraft(storage: Storage | undefined, scope: StudioDraftScope): void {
  if (!storage) return;
  try {
    storage.removeItem(studioDraftKey(scope));
  } catch {
    // As above.
  }
}

/** Whether an artifact holds anything worth keeping. */
export function isDraftWorthKeeping(artifact: DiagramArtifact): boolean {
  return (
    artifact.nodes.length > 0 ||
    (artifact.ink?.length ?? 0) > 0 ||
    (artifact.paths?.length ?? 0) > 0 ||
    (artifact.tables?.length ?? 0) > 0 ||
    (artifact.arrows?.length ?? 0) > 0
  );
}
