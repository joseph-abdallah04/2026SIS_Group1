import { render, screen } from '@testing-library/react';
import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import type { CreativeToolsContextValue } from './CreativeToolsContext';

// The editors are irrelevant here and each pulls in a canvas or a diagram
// engine, so they are stubbed. What is under test is the one label every tool
// shows, which the overlay draws from the studio rather than from the editor.
vi.mock('./sticky/StickyEditor', () => ({ StickyEditor: () => null }));
vi.mock('./drawing/DrawingEditor', () => ({ DrawingEditor: () => null }));
vi.mock('./diagram/DiagramEditor', () => ({ DiagramEditor: () => null }));

let tools: Partial<CreativeToolsContextValue> = {};
vi.mock('./CreativeToolsContext', () => ({ useCreativeTools: () => tools }));

const { CreativeStudio } = await import('./CreativeStudio');

function proposal(): BoardItem {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'viewer',
    authorName: 'Alice',
    type: 'drawing',
    artifactJson: { type: 'drawing', svg: '<svg/>' },
    x: 0,
    y: 0,
    createdAt: '2026-09-07T00:00:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    reactions: [],
  };
}

function renderStudio(overrides: Partial<CreativeToolsContextValue>) {
  tools = {
    activeTool: 'drawing',
    closeTool: vi.fn(),
    editSource: null,
    extensionSource: null,
    isReusingOwn: false,
    isLive: true,
    ...overrides,
  };
  render(<CreativeStudio />);
  return screen.getByRole('heading').textContent;
}

describe('creative studio title', () => {
  // Reuse (F38) and Extend (F23) share one write path, so the title is the
  // only thing that tells them apart. The drawing editor has no banner of its
  // own, which made reusing your own drawing read as extending it.
  it('says Reuse when the source is your own proposal', () => {
    expect(renderStudio({ extensionSource: proposal(), isReusingOwn: true })).toBe('Reuse drawing');
  });

  it('says Extend when the source is somebody else’s', () => {
    expect(renderStudio({ extensionSource: proposal(), isReusingOwn: false })).toBe(
      'Extend drawing',
    );
  });

  it('says Edit when the proposal is being rewritten', () => {
    expect(renderStudio({ editSource: proposal() })).toBe('Edit drawing');
  });

  it('says New when nothing came before it', () => {
    expect(renderStudio({})).toBe('New drawing');
  });
});
