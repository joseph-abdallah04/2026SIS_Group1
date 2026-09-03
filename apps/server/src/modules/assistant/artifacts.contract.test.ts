// Guards the shared artifact contract at the point the assistant depends on it: anything
// that reaches `parseArtifact` is on its way to the pinboard, so this is the last checkpoint.
import { MAX_ARTIFACT_BYTES, parseArtifact, summarizeArtifact } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

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
    ).toBe('2 nodes, 1 edges');
  });
});
