import type { AssistantToolName, ArtifactJson } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { assistantTools, findTool, type ToolRunContext } from './index.js';

function harness(): ToolRunContext & {
  artifacts: Array<{ artifact: ArtifactJson; source: AssistantToolName }>;
} {
  const artifacts: Array<{ artifact: ArtifactJson; source: AssistantToolName }> = [];
  return {
    artifacts,
    signal: new AbortController().signal,
    emitArtifact: (artifact, source) => artifacts.push({ artifact, source }),
  };
}

describe('tool registry', () => {
  it('exposes exactly the three MVP tools (F36)', () => {
    expect(Object.keys(assistantTools).sort()).toEqual([
      'create_diagram',
      'sticky_ideation',
      'web_search',
    ]);
  });

  it('names each tool definition after its registry key', () => {
    for (const [key, tool] of Object.entries(assistantTools)) {
      expect(tool.definition.function.name).toBe(key);
      expect(tool.name).toBe(key);
    }
  });

  it('returns undefined for a hallucinated tool', () => {
    expect(findTool('summon_intern')).toBeUndefined();
  });
});

describe('create_diagram', () => {
  it('lays out the nodes it was given and emits one artifact', async () => {
    const context = harness();
    const result = await assistantTools.create_diagram.run(
      {
        nodes: [
          { id: 'leader', label: 'Leader picks shortlist' },
          { id: 'vote', label: 'Members vote' },
          { id: 'result', label: 'Winner recorded' },
        ],
        edges: [
          { from: 'leader', to: 'vote' },
          { from: 'vote', to: 'result', label: 'all in' },
        ],
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(context.artifacts).toHaveLength(1);
    const artifact = context.artifacts[0]?.artifact;
    expect(artifact?.type).toBe('diagram');
    if (artifact?.type === 'diagram') {
      expect(artifact.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
      // Boxes, not the 72x32 default — the labels the model writes need the room.
      expect(artifact.nodes.every((n) => n.shape === 'box')).toBe(true);
    }
  });

  it('rejects an edge pointing at an unknown node, and says how to fix it', async () => {
    const context = harness();
    const result = await assistantTools.create_diagram.run(
      {
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        edges: [{ from: 'a', to: 'ghost' }],
      },
      context,
    );

    expect(result.ok).toBe(false);
    expect(result.modelText).toMatch(/ghost/);
    expect(context.artifacts).toHaveLength(0);
  });

  it('rejects a one-node diagram', async () => {
    const result = await assistantTools.create_diagram.run(
      { nodes: [{ id: 'a', label: 'Alone' }], edges: [] },
      harness(),
    );
    expect(result.ok).toBe(false);
  });

  it('reports invalid arguments instead of throwing', async () => {
    const result = await assistantTools.create_diagram.run({ nodes: 'not an array' }, harness());
    expect(result.ok).toBe(false);
    expect(result.summary).toBe('Invalid arguments');
  });
});

describe('sticky_ideation', () => {
  it('emits one artifact per idea with rotating colours', async () => {
    const context = harness();
    const result = await assistantTools.sticky_ideation.run(
      {
        ideas: [
          { text: 'Event sourcing' },
          { text: 'Optimistic UI' },
          { text: 'Server authority' },
        ],
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(context.artifacts).toHaveLength(3);
    const colors = context.artifacts.map((a) =>
      a.artifact.type === 'sticky' ? a.artifact.color : null,
    );
    expect(new Set(colors).size).toBe(3);
  });

  it('honours a colour the model picked', async () => {
    const context = harness();
    await assistantTools.sticky_ideation.run(
      { ideas: [{ text: 'Pink one', color: 'pink' }] },
      context,
    );
    const artifact = context.artifacts[0]?.artifact;
    expect(artifact?.type === 'sticky' && artifact.color).toBe('pink');
  });

  it('caps the batch at five notes', async () => {
    const context = harness();
    await assistantTools.sticky_ideation.run(
      { ideas: Array.from({ length: 8 }, (_, i) => ({ text: `Idea ${i}` })) },
      context,
    );
    expect(context.artifacts).toHaveLength(5);
  });

  it('trims whitespace off note text', async () => {
    const context = harness();
    await assistantTools.sticky_ideation.run({ ideas: [{ text: '  padded  ' }] }, context);
    const artifact = context.artifacts[0]?.artifact;
    expect(artifact?.type === 'sticky' && artifact.text).toBe('padded');
  });

  it('rejects an empty ideas array', async () => {
    const result = await assistantTools.sticky_ideation.run({ ideas: [] }, harness());
    expect(result.ok).toBe(false);
  });
});
