import { render } from '@testing-library/react';
import type { BoardItem, DiagramNode } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { ProposalCard } from './ProposalCard';

function diagramItem(nodes: DiagramNode[]): BoardItem {
  return {
    id: 'diagram-1',
    questionId: 'question-1',
    authorId: 'user-1',
    authorName: 'Alice',
    type: 'diagram',
    artifactJson: { type: 'diagram', nodes, edges: [] },
    x: 0,
    y: 0,
    createdAt: '2026-09-03T00:00:00.000Z',
    extendsProposalId: null,
  };
}

describe('diagram proposal card', () => {
  it('renders box, container, and text shapes distinctly', () => {
    const { container } = render(
      <ProposalCard
        item={diagramItem([
          { id: 'box', label: 'API', x: 0, y: 0, shape: 'box' },
          { id: 'container', label: 'Platform', x: 100, y: 0, shape: 'container' },
          { id: 'text', label: 'Architecture boundary', x: 200, y: 0, shape: 'text' },
        ])}
      />,
    );

    // Box and container are stroked outlines; text is a bare label with no border.
    expect(container.querySelectorAll('g > rect[stroke]')).toHaveLength(2);
    expect(container.querySelector('rect[stroke-dasharray="4 3"]')).not.toBeNull();
    const fittedText = [...container.querySelectorAll('text')].find(
      (element) => element.textContent === 'Architecture boundary',
    );
    // Diagram contract v2 wraps labels into bounded lines instead of squeezing
    // them onto one line with textLength.
    expect(fittedText?.getAttribute('textLength')).toBeNull();
    expect(fittedText?.querySelectorAll('tspan')).toHaveLength(1);
  });

  it('renders a legacy node without shape as a box', () => {
    const { container } = render(
      <ProposalCard item={diagramItem([{ id: 'legacy', label: 'Idea', x: 0, y: 0 }])} />,
    );

    expect(container.querySelector('g > rect[rx="8"]')).not.toBeNull();
  });

  it('renders a labeled arrow between variable-size shape boundaries', () => {
    const item = diagramItem([
      { id: 'client', label: 'Client', x: 24, y: 24, shape: 'box' },
      { id: 'server', label: 'Server', x: 300, y: 24, shape: 'container' },
    ]);
    if (item.artifactJson.type !== 'diagram') throw new Error('Expected diagram fixture');
    item.artifactJson.edges = [{ from: 'client', to: 'server', label: 'calls' }];
    const { container } = render(<ProposalCard item={item} />);

    // Arrows are paths now, so a bowed reciprocal pair can share the same code
    // as a straight one; the boundary anchors are unchanged.
    const arrow = container.querySelector('path[marker-end]');
    expect(arrow?.getAttribute('d')).toMatch(/^M144,/);
    expect(arrow?.getAttribute('d')).toContain(' L300,');
    expect(
      [...container.querySelectorAll('text')].some((text) => text.textContent === 'calls'),
    ).toBe(true);
  });

  it('bows a reciprocal pair apart on the board card too', () => {
    const item = diagramItem([
      { id: 'a', label: 'A', x: 24, y: 24, shape: 'box' },
      { id: 'b', label: 'B', x: 400, y: 24, shape: 'box' },
    ]);
    if (item.artifactJson.type !== 'diagram') throw new Error('Expected diagram fixture');
    item.artifactJson.edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ];
    const { container } = render(<ProposalCard item={item} />);

    // The card shares the editor's routing, so both directions stay readable
    // instead of one arrow hiding under the other.
    const paths = [...container.querySelectorAll('path[marker-end]')].map((path) =>
      path.getAttribute('d'),
    );
    expect(paths).toHaveLength(2);
    expect(paths.every((path) => path?.includes('Q'))).toBe(true);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it('renders the complete diagram rather than truncating after four nodes', () => {
    const item = diagramItem(
      Array.from({ length: 5 }, (_, index) => ({
        id: `n${index + 1}`,
        label: `Node ${index + 1}`,
        x: index * 150,
        y: 24,
        shape: 'box' as const,
      })),
    );
    if (item.artifactJson.type !== 'diagram') throw new Error('Expected diagram fixture');
    item.artifactJson.edges = [{ from: 'n4', to: 'n5' }];
    const { container } = render(<ProposalCard item={item} />);

    expect(
      [...container.querySelectorAll('text')].some((text) => text.textContent === 'Node 5'),
    ).toBe(true);
    expect(container.querySelectorAll('path[marker-end]')).toHaveLength(1);
  });
});
