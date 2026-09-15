// Tools are split so that everything worth asserting is reachable without a model:
// `run*` is pure input → outcome, and the schema the model is shown is the same object the
// SDK validates against, so both are tested directly.
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  createAssistantTools,
  runCreateDiagram,
  runStickyIdeation,
  ToolOutcomeSink,
} from './index.js';

const tools = createAssistantTools(new ToolOutcomeSink());

/** The schema the SDK validates a tool call against before `execute` ever runs. */
function inputSchemaOf(name: keyof typeof tools): z.ZodType {
  return tools[name]?.inputSchema as z.ZodType;
}

describe('tool registry', () => {
  it('exposes exactly the three MVP tools (F36)', () => {
    expect(Object.keys(tools).sort()).toEqual(['create_diagram', 'sticky_ideation', 'web_search']);
  });

  it('describes every tool for the model', () => {
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, name).toBeTruthy();
      expect(tool.inputSchema, name).toBeDefined();
    }
  });
});

describe('create_diagram', () => {
  it('drops self-edges and repeated directed edges the board would reject', () => {
    const result = runCreateDiagram({
      nodes: [
        { id: 'a', label: 'Draft' },
        { id: 'b', label: 'Review' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    });

    expect(result.ok).toBe(true);
    const artifact = result.artifacts?.[0];
    expect(artifact?.type).toBe('diagram');
    if (artifact?.type === 'diagram') {
      // A → B kept once, B → B dropped, B → A kept: the model's sloppiness never becomes a
      // Propose that fails in the user's hand.
      expect(artifact.edges).toEqual([
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ]);
    }
  });

  it('lays out the nodes it was given and produces one artifact', () => {
    const result = runCreateDiagram({
      nodes: [
        { id: 'leader', label: 'Leader picks shortlist' },
        { id: 'vote', label: 'Members vote' },
        { id: 'result', label: 'Winner recorded' },
      ],
      edges: [
        { from: 'leader', to: 'vote' },
        { from: 'vote', to: 'result', label: 'all in' },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
    const artifact = result.artifacts?.[0];
    if (artifact?.type === 'diagram') {
      expect(artifact.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
      // Boxes, not the 72x32 default — the labels the model writes need the room.
      expect(artifact.nodes.every((n) => n.shape === 'box')).toBe(true);
      expect(
        artifact.nodes.every((n) => typeof n.width === 'number' && typeof n.height === 'number'),
      ).toBe(true);
    }
  });

  it('rejects an edge pointing at an unknown node, and says how to fix it', () => {
    const result = runCreateDiagram({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ from: 'a', to: 'ghost' }],
    });

    expect(result.ok).toBe(false);
    expect(result.modelText).toMatch(/ghost/);
    expect(result.artifacts).toBeUndefined();
  });

  // Shape is the schema's job now: a call that fails it never reaches `runCreateDiagram`,
  // and the SDK reports the failure to the model itself.
  it('refuses a one-node diagram at the schema', () => {
    const parsed = inputSchemaOf('create_diagram').safeParse({
      nodes: [{ id: 'a', label: 'Alone' }],
      edges: [],
    });
    expect(parsed.success).toBe(false);
  });

  // The schema used to demand `[A-Za-z0-9_-]` ids. Asked for a login flowchart, a model
  // writes "Enter Credentials" — the call was rejected whole, and the user watched the
  // tool fail for something the board would have stored happily.
  it('accepts the node ids a model actually writes', () => {
    const parsed = inputSchemaOf('create_diagram').safeParse({
      nodes: [
        { id: 'Enter Credentials', label: 'Enter credentials' },
        { id: 'Validate (server)', label: 'Validate' },
      ],
      edges: [{ from: 'Enter Credentials', to: 'Validate (server)' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('treats a null edge label as no label', () => {
    const parsed = inputSchemaOf('create_diagram').safeParse({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', label: null }],
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as { edges: Array<{ label?: string }> }).edges[0]?.label).toBeUndefined();
  });

  it('defaults edges to empty so a node-only diagram still parses', () => {
    const parsed = inputSchemaOf('create_diagram').safeParse({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('sticky_ideation', () => {
  it('produces one artifact per idea with rotating colours', () => {
    const result = runStickyIdeation({
      ideas: [{ text: 'Event sourcing' }, { text: 'Optimistic UI' }, { text: 'Server authority' }],
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(3);
    const colors = (result.artifacts ?? []).map((a) => (a.type === 'sticky' ? a.color : null));
    expect(new Set(colors).size).toBe(3);
  });

  it('honours a colour the model picked', () => {
    const result = runStickyIdeation({ ideas: [{ text: 'Pink one', color: 'pink' }] });
    const artifact = result.artifacts?.[0];
    expect(artifact?.type === 'sticky' && artifact.color).toBe('pink');
  });

  it('caps the batch at five notes', () => {
    const result = runStickyIdeation({
      ideas: Array.from({ length: 8 }, (_, i) => ({ text: `Idea ${i}` })),
    });
    expect(result.artifacts).toHaveLength(5);
  });

  it('trims whitespace off note text', () => {
    const result = runStickyIdeation({ ideas: [{ text: '  padded  ' }] });
    const artifact = result.artifacts?.[0];
    expect(artifact?.type === 'sticky' && artifact.text).toBe('padded');
  });

  it('refuses an empty ideas array at the schema', () => {
    expect(inputSchemaOf('sticky_ideation').safeParse({ ideas: [] }).success).toBe(false);
  });
});

describe('ToolOutcomeSink', () => {
  it('hands an outcome back once and then forgets it', () => {
    const sink = new ToolOutcomeSink();
    sink.record('call_1', { ok: true, summary: 'done', modelText: 'done' });

    expect(sink.take('call_1')?.summary).toBe('done');
    // Forgetting matters: a long session must not accumulate an outcome per tool call for
    // the lifetime of the process.
    expect(sink.take('call_1')).toBeUndefined();
  });
});
