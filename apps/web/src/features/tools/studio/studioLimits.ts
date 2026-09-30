// How much one studio canvas may hold, said plainly.
//
// Every kind of element has a ceiling in the write contract. Hitting one used
// to surface only at Propose, as "This diagram could not be prepared" — after
// the work was done, and with nothing to say what to take away. Checked where
// things are added instead, with the same words wherever it is checked.

import {
  DIAGRAM_ARROW_LIMIT,
  DIAGRAM_INK_LIMIT,
  DIAGRAM_PATH_LIMIT,
  DIAGRAM_TABLE_LIMIT,
} from '@roundtable/shared';

import { DIAGRAM_EDGE_LIMIT, DIAGRAM_NODE_LIMIT } from '../artifactLimits';

export interface StudioCounts {
  nodes?: number;
  edges?: number;
  ink?: number;
  paths?: number;
  tables?: number;
  arrows?: number;
}

const LIMITS: { kind: keyof StudioCounts; limit: number; noun: string }[] = [
  { kind: 'nodes', limit: DIAGRAM_NODE_LIMIT, noun: 'elements' },
  // Edges are the older kind of connection, and read as arrows to anyone using it.
  { kind: 'edges', limit: DIAGRAM_EDGE_LIMIT, noun: 'arrows' },
  { kind: 'ink', limit: DIAGRAM_INK_LIMIT, noun: 'freehand strokes' },
  { kind: 'paths', limit: DIAGRAM_PATH_LIMIT, noun: 'lines' },
  { kind: 'tables', limit: DIAGRAM_TABLE_LIMIT, noun: 'tables' },
  { kind: 'arrows', limit: DIAGRAM_ARROW_LIMIT, noun: 'arrows' },
];

/** What is over its limit in these counts, as a sentence; null when nothing is. */
export function studioLimitError(counts: StudioCounts): string | null {
  for (const { kind, limit, noun } of LIMITS) {
    if ((counts[kind] ?? 0) > limit) return `A diagram can hold ${limit} ${noun} at most.`;
  }
  return null;
}
