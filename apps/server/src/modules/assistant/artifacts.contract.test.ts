// Guards the shared artifact contract at the point the assistant depends on it: anything
// that reaches `parseArtifact` is on its way to the pinboard, so this is the last checkpoint.
import { MAX_ARTIFACT_BYTES, parseArtifact, summarizeArtifact } from '@roundtable/shared';
import { proposalCreateSchema } from '@roundtable/shared/schemas';
import { describe, expect, it } from 'vitest';

import { runCreateDiagram, runStickyIdeation } from './tools/index.js';

describe('parseArtifact', () => {
  it('accepts a well-formed sticky note', () => {
    const result = parseArtifact({ type: 'sticky', text: 'Ship the MVP', color: 'blue' });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown artifact type', () => {
    expect(parseArtifact({ type: 'video', url: 'x' }).ok).toBe(false);
  });

  it('rejects a sticky with an invalid colour', () => {
    expect(parseArtifact({ type: 'sticky', text: 'hi', color: 'chartreuse' }).ok).toBe(false);
  });

  it('rejects a diagram whose edge points at a missing node', () => {
    const result = parseArtifact({
      type: 'diagram',
      nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }],
      edges: [{ from: 'a', to: 'nope' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate node ids', () => {
    const result = parseArtifact({
      type: 'diagram',
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'a', label: 'Also A', x: 10, y: 10 },
      ],
      edges: [],
    });
    expect(result.ok).toBe(false);
  });

  it('enforces the size ceiling', () => {
    const result = parseArtifact({
      type: 'drawing',
      svg: '<svg>'.padEnd(MAX_ARTIFACT_BYTES + 100, 'x'),
    });
    expect(result.ok).toBe(false);
  });

  // Rules the board grew after the agent was written, and that `parseArtifact` only knows
  // because it now runs the board's own write schemas rather than a copy of some of them.
  it('rejects a diagram edge from a node to itself', () => {
    const result = parseArtifact({
      type: 'diagram',
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'b', label: 'B', x: 200, y: 0 },
      ],
      edges: [{ from: 'a', to: 'a' }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects the same arrow drawn twice', () => {
    const result = parseArtifact({
      type: 'diagram',
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0 },
        { id: 'b', label: 'B', x: 200, y: 0 },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

/**
 * The agent's tools and the tools a person uses by hand write to one board through one
 * contract, and this is what says so.
 *
 * `parseArtifact` is the gate in the chat; `proposalCreateSchema` is the gate the Propose
 * button goes through. If the first is the more forgiving of the two, the difference is
 * not caught anywhere until a user presses Propose on something the agent has already
 * shown them and the board turns it down — which is the one failure the chat cannot
 * explain and the model cannot be told to fix. So: whatever a tool produces must be
 * proposable, exactly as it stands.
 */
describe('what the tools make is what the board accepts', () => {
  /** Proposed the way the chat panel proposes it, at the position the board picks. */
  function proposable(artifact: unknown) {
    const parsed = parseArtifact(artifact);
    expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true);
    if (!parsed.ok) return;
    return proposalCreateSchema.safeParse({
      type: parsed.artifact.type,
      artifactJson: parsed.artifact,
      x: 120,
      y: 240,
    });
  }

  it('proposes a diagram laid out by the diagram tool', () => {
    const result = runCreateDiagram({
      nodes: [
        { id: 'Enter Credentials', label: 'Enter credentials' },
        { id: 'validate', label: 'Validate against the directory' },
        { id: 'ok', label: 'Signed in' },
        { id: 'no', label: 'Rejected' },
      ],
      edges: [
        { from: 'Enter Credentials', to: 'validate' },
        { from: 'validate', to: 'ok', label: 'match' },
        { from: 'validate', to: 'no', label: 'no match' },
      ],
    });

    const proposal = proposable(result.artifacts?.[0]);
    expect(proposal?.success, proposal?.success ? '' : JSON.stringify(proposal?.error.issues)).toBe(
      true,
    );
  });

  it('proposes every sticky the ideation tool writes', () => {
    const result = runStickyIdeation({
      ideas: [
        { text: 'Ask the users first' },
        { text: 'Ship the smallest useful thing' },
        { text: 'Measure before tuning', color: 'pink' },
      ],
    });

    expect(result.artifacts).toHaveLength(3);
    for (const artifact of result.artifacts ?? []) {
      const proposal = proposable(artifact);
      expect(proposal?.success).toBe(true);
    }
  });
});

describe('summarizeArtifact', () => {
  it('truncates long sticky text', () => {
    const summary = summarizeArtifact({ type: 'sticky', text: 'x'.repeat(200), color: 'yellow' });
    expect(summary.length).toBeLessThanOrEqual(80);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('describes a diagram by its shape', () => {
    expect(
      summarizeArtifact({
        type: 'diagram',
        nodes: [
          { id: 'a', label: 'A', x: 0, y: 0 },
          { id: 'b', label: 'B', x: 1, y: 1 },
        ],
        edges: [{ from: 'a', to: 'b' }],
      }),
    ).toBe('2 nodes, 1 edge');
  });

  // A canvas somebody built by hand out of the studio's other tools. Summarised only by
  // its nodes and edges this reads as an empty board, and the agent offers to start one.
  it('counts what the studio can draw besides boxes and arrows between them', () => {
    const summary = summarizeArtifact({
      type: 'diagram',
      nodes: [],
      edges: [],
      tables: [
        {
          id: 't1',
          x: 0,
          y: 0,
          colWidths: [96, 96],
          rowHeights: [32],
          cells: [{ text: 'Owner' }, { text: 'Due' }],
        },
      ],
      arrows: [{ id: 'a1', from: { x: 0, y: 0 }, to: { x: 120, y: 80 } }],
    });

    expect(summary).toBe('1 table, 1 arrow');
  });

  it('says so when there is nothing on the canvas at all', () => {
    expect(summarizeArtifact({ type: 'diagram', nodes: [], edges: [] })).toBe('Empty canvas');
  });
});
