// Starter frames for a blank studio canvas.
//
// RoundTable is a facilitated brainstorming tool, so the useful thing to offer
// someone staring at an empty sheet is the shape of the conversation, not more
// tools. Each template is only a preset that emits ordinary nodes and edges —
// there is nothing new in the artifact, and everything it produces can be
// moved, restyled, regrouped or deleted like anything else on the canvas.

import type { DiagramEdge, DiagramNode } from '@roundtable/shared';

export interface StudioTemplate {
  id: string;
  label: string;
  /** Shown as the button's title; says what the frame is for. */
  hint: string;
  build: () => { nodes: DiagramNode[]; edges: DiagramEdge[] };
}

function container(
  id: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DiagramNode {
  return { id, label, x, y, shape: 'container', width, height };
}

// Positions are multiples of the 8-unit grid so a template lands already
// aligned. Sizes stay inside DIAGRAM_MIN/MAX_NODE_WIDTH/HEIGHT and the 960x600
// sheet — a frame that breached either would be refused at propose time, which
// `studioTemplates.test.ts` asserts against the real write schema.
export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'matrix',
    label: 'Matrix',
    hint: 'Impact and effort quadrants for sorting ideas',
    build: () => ({
      nodes: [
        container('quick-wins', 'Quick wins', 200, 128, 200, 144),
        container('big-bets', 'Big bets', 424, 128, 200, 144),
        container('fill-ins', 'Fill-ins', 200, 296, 200, 144),
        container('time-sinks', 'Time sinks', 424, 296, 200, 144),
      ],
      edges: [],
    }),
  },
  {
    id: 'lanes',
    label: 'Lanes',
    hint: 'Swimlanes for splitting work across stages',
    build: () => ({
      nodes: [
        container('discover', 'Discover', 240, 112, 480, 112),
        container('build', 'Build', 240, 240, 480, 112),
        container('ship', 'Ship', 240, 368, 480, 112),
      ],
      edges: [],
    }),
  },
  {
    id: 'retro',
    label: 'Retro',
    hint: 'Went well, to improve, actions',
    build: () => ({
      nodes: [
        container('went-well', 'Went well', 184, 136, 184, 296),
        container('to-improve', 'To improve', 392, 136, 184, 296),
        container('actions', 'Actions', 600, 136, 184, 296),
      ],
      edges: [],
    }),
  },
  {
    id: 'timeline',
    label: 'Timeline',
    hint: 'Now, next, later — connected in order',
    build: () => ({
      nodes: [
        { id: 'now', label: 'Now', x: 152, y: 280, shape: 'box' },
        { id: 'next', label: 'Next', x: 344, y: 280, shape: 'box' },
        { id: 'later', label: 'Later', x: 536, y: 280, shape: 'box' },
        { id: 'someday', label: 'Someday', x: 728, y: 280, shape: 'box' },
      ],
      edges: [
        { from: 'now', to: 'next' },
        { from: 'next', to: 'later' },
        { from: 'later', to: 'someday' },
      ],
    }),
  },
];
