import { describe, expect, it } from 'vitest';
import { DIAGRAM_MAX_NODE_WIDTH } from '@roundtable/shared';
import { diagramWriteArtifactSchema } from '@roundtable/shared/schemas';

import { DIAGRAM_CANVAS_HEIGHT, DIAGRAM_CANVAS_WIDTH } from '../diagram/diagramModel';
import { studioSceneBounds } from './StudioArtwork';
import { pasteStudioFragment } from './studioClipboard';
import { STUDIO_TEMPLATES, templateFragment } from './studioTemplates';

describe('studio starter templates', () => {
  it('offers the eight templates, each once', () => {
    expect(STUDIO_TEMPLATES.map((template) => template.id)).toEqual([
      'matrix',
      'lanes',
      'retro',
      'timeline',
      'flowchart',
      'kanban',
      'swot',
      'mindmap',
    ]);
  });

  it.each(STUDIO_TEMPLATES)('$label produces a proposable artifact', (template) => {
    // A template is only a preset, so what it emits has to clear the same write
    // contract a hand-drawn canvas does — its arrows and tables included.
    const { nodes, arrows, tables } = template.build();
    const result = diagramWriteArtifactSchema.safeParse({
      type: 'diagram',
      nodes,
      edges: [],
      arrows,
      tables,
    });
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it.each(STUDIO_TEMPLATES)('$label lands inside the sheet, arrows and all', (template) => {
    const bounds = studioSceneBounds(templateFragment(template));
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(DIAGRAM_CANVAS_WIDTH);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(DIAGRAM_CANVAS_HEIGHT);
    for (const node of template.build().nodes) {
      expect(node.width ?? 0).toBeLessThanOrEqual(DIAGRAM_MAX_NODE_WIDTH);
    }
  });

  it.each(STUDIO_TEMPLATES)('$label sits on the grid', (template) => {
    const { nodes, tables } = template.build();
    for (const element of [...nodes, ...tables]) {
      expect(element.x % 8, element.id).toBe(0);
      expect(element.y % 8, element.id).toBe(0);
    }
  });

  it.each(STUDIO_TEMPLATES)('$label joins what it shows with arrows, never edges', (template) => {
    const scene = template.build();
    expect(scene).not.toHaveProperty('edges');
    const ids = new Set([...scene.nodes, ...scene.tables].map((element) => element.id));
    for (const arrow of scene.arrows) {
      for (const end of [arrow.from, arrow.to]) {
        if (end.elementId) expect(ids.has(end.elementId), arrow.id).toBe(true);
      }
    }
  });

  it.each(STUDIO_TEMPLATES)('$label says how big all of its text is', (template) => {
    // Text left to the default would draw at the old 11px, the reason these
    // templates were redone.
    const { nodes, arrows, tables } = template.build();
    for (const node of nodes) {
      if (node.label) expect(node.fontSizePreset, node.id).toBeDefined();
    }
    for (const arrow of arrows) {
      if (arrow.label) expect(arrow.fontSizePreset, arrow.id).toBeDefined();
    }
    for (const table of tables) expect(table.fontSizePreset, table.id).toBeDefined();
  });

  it('builds each template once, and a drop never changes the one it shares', () => {
    const template = STUDIO_TEMPLATES.find((entry) => entry.id === 'flowchart')!;
    const fragment = templateFragment(template);
    expect(templateFragment(template)).toBe(fragment);
    const before = JSON.stringify(fragment);
    const empty = { nodes: [], edges: [] };
    const first = pasteStudioFragment(empty, fragment, { x: 0, y: 0 });
    const second = pasteStudioFragment(empty, fragment, { x: 0, y: 0 });
    if (!first.ok || !second.ok) throw new Error('expected both drops to land');
    expect(JSON.stringify(fragment)).toBe(before);
    // Two drops, two sets of ids.
    expect(first.arrows[0]!.id).not.toBe(second.arrows[0]!.id);
  });

  it('gives every element a unique id within its template', () => {
    for (const template of STUDIO_TEMPLATES) {
      const { nodes, arrows, tables } = template.build();
      const ids = [...nodes, ...arrows, ...tables].map((element) => element.id);
      expect(new Set(ids).size, template.id).toBe(ids.length);
    }
  });

  it('puts a table of actions in the retro, and a decision loop in the flowchart', () => {
    const retro = STUDIO_TEMPLATES.find((template) => template.id === 'retro')!.build();
    expect(retro.tables[0]?.cells.slice(0, 3).map((cell) => cell.text)).toEqual([
      'Action',
      'Owner',
      'Due',
    ]);
    const flow = STUDIO_TEMPLATES.find((template) => template.id === 'flowchart')!.build();
    expect(flow.arrows.map((arrow) => arrow.label).filter(Boolean)).toEqual(['Yes', 'No']);
  });
});
