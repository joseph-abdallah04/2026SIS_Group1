import { describe, expect, it } from 'vitest';
import { DIAGRAM_MAX_NODE_WIDTH, DIAGRAM_MIN_NODE_WIDTH } from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import { DIAGRAM_CANVAS_HEIGHT, DIAGRAM_CANVAS_WIDTH } from '../diagram/diagramModel';
import { STUDIO_TEMPLATES } from './studioTemplates';

describe('studio starter templates', () => {
  it.each(STUDIO_TEMPLATES)('$label produces a proposable artifact', (template) => {
    // A template is only a preset, so what it emits has to clear the same write
    // contract a hand-drawn canvas does — including the bounded container sizes.
    const { nodes, edges } = template.build();
    const result = diagramWriteArtifactSchema.safeParse({ type: 'diagram', nodes, edges });
    expect(result.success).toBe(true);
  });

  it.each(STUDIO_TEMPLATES)('$label lands inside the sheet', (template) => {
    for (const node of template.build().nodes) {
      const width = node.width ?? DIAGRAM_MIN_NODE_WIDTH;
      const height = node.height ?? 32;
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + width).toBeLessThanOrEqual(DIAGRAM_CANVAS_WIDTH);
      expect(node.y + height).toBeLessThanOrEqual(DIAGRAM_CANVAS_HEIGHT);
      expect(width).toBeLessThanOrEqual(DIAGRAM_MAX_NODE_WIDTH);
    }
  });

  it('gives every template a unique id and every node a unique id within it', () => {
    expect(new Set(STUDIO_TEMPLATES.map((template) => template.id)).size).toBe(
      STUDIO_TEMPLATES.length,
    );
    for (const template of STUDIO_TEMPLATES) {
      const ids = template.build().nodes.map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
