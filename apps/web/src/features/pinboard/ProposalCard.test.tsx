import { render, screen } from '@testing-library/react';
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
    reactions: [],
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

describe('studio proposal card (v4)', () => {
  // Packed `[x0, y0, x1, y1]`, the form a stroke is stored and broadcast in.
  const stroke = {
    id: 'ink-1',
    points: [10, 10, 90, 60],
    strokeColor: 'ink' as const,
    strokeWidthPreset: 'regular' as const,
  };

  function studioItem(artifact: Partial<Extract<BoardItem['artifactJson'], { type: 'diagram' }>>) {
    return {
      ...diagramItem([]),
      artifactJson: { type: 'diagram' as const, nodes: [], edges: [], ...artifact },
    };
  }

  it('draws the ink a studio canvas was proposed with', () => {
    const { container } = render(<ProposalCard item={studioItem({ ink: [stroke] })} />);
    const paths = [...container.querySelectorAll('path')];
    expect(paths.some((path) => path.getAttribute('stroke') === '#080C15')).toBe(true);
  });

  it('frames a sketch that has no shapes instead of showing the empty placeholder', () => {
    const { container } = render(<ProposalCard item={studioItem({ ink: [stroke] })} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.border-dashed')).toBeNull();
  });

  it('paints ink under a shape when the artifact says so', () => {
    // The card has to honour the same order the editor did, or what the author
    // arranged is not what the room sees.
    const { container } = render(
      <ProposalCard
        item={studioItem({
          nodes: [{ id: 'n1', label: 'API', x: 0, y: 0, shape: 'box' }],
          ink: [stroke],
          z: ['ink-1', 'n1'],
        })}
      />,
    );

    const svg = container.querySelector('svg')!;
    const painted = [...svg.querySelectorAll('path, g')];
    const inkIndex = painted.findIndex((el) => el.getAttribute('stroke') === '#080C15');
    const nodeIndex = painted.findIndex((el) => el.getAttribute('transform') === 'translate(0, 0)');
    expect(inkIndex).toBeGreaterThanOrEqual(0);
    expect(nodeIndex).toBeGreaterThanOrEqual(0);
    expect(inkIndex).toBeLessThan(nodeIndex);
  });

  it('still shows the empty placeholder for a diagram with nothing in it', () => {
    const { container } = render(<ProposalCard item={studioItem({})} />);
    expect(container.querySelector('.border-dashed')).not.toBeNull();
  });
});

describe('studio path proposal card (v4)', () => {
  const line = {
    id: 'path-1',
    anchors: [
      { x: 10, y: 10 },
      { x: 90, y: 60 },
    ],
    strokeColor: 'ink' as const,
  };

  function pathItem(artifact: Partial<Extract<BoardItem['artifactJson'], { type: 'diagram' }>>) {
    return {
      ...diagramItem([]),
      artifactJson: { type: 'diagram' as const, nodes: [], edges: [], ...artifact },
    };
  }

  it('draws a path the studio proposed', () => {
    const { container } = render(<ProposalCard item={pathItem({ paths: [line] })} />);
    const drawn = [...container.querySelectorAll('path')].filter(
      (path) => path.getAttribute('stroke') === '#080C15',
    );
    expect(drawn).toHaveLength(1);
    expect(drawn[0]?.getAttribute('d')).toBe('M 10 10 L 90 60');
  });

  it('frames a canvas that holds only paths', () => {
    const { container } = render(<ProposalCard item={pathItem({ paths: [line] })} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.border-dashed')).toBeNull();
  });

  it('fills a closed path and leaves an open one unfilled', () => {
    const closed = {
      ...line,
      id: 'path-2',
      anchors: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
      closed: true,
      fillColor: 'blue' as const,
    };
    const { container } = render(<ProposalCard item={pathItem({ paths: [closed, line] })} />);
    const fills = [...container.querySelectorAll('path')].map((path) => path.getAttribute('fill'));
    expect(fills).toContain('#DCE9F7');
    expect(fills).toContain('none');
  });

  it('paints a path under a shape when the artifact says so', () => {
    const { container } = render(
      <ProposalCard
        item={pathItem({
          nodes: [{ id: 'n1', label: 'API', x: 0, y: 0, shape: 'box' }],
          paths: [line],
          z: ['path-1', 'n1'],
        })}
      />,
    );
    const painted = [...container.querySelectorAll('svg path, svg g')];
    const pathIndex = painted.findIndex((el) => el.getAttribute('d') === 'M 10 10 L 90 60');
    const nodeIndex = painted.findIndex((el) => el.getAttribute('transform') === 'translate(0, 0)');
    expect(pathIndex).toBeGreaterThanOrEqual(0);
    expect(pathIndex).toBeLessThan(nodeIndex);
  });
});

describe('card layout', () => {
  // The artifact opens the card and the attribution closes it. The byline sits
  // bottom-right, clear of both things the board draws over this card: the
  // edit and remove controls on the top-right corner, and the reaction chips
  // along the bottom-left.
  it('leads with the artifact and signs off underneath it', () => {
    const { container } = render(
      <ProposalCard item={diagramItem([{ id: 'n1', label: 'Idea', x: 0, y: 0, shape: 'box' }])} />,
    );

    const article = container.querySelector('article');
    expect(article?.firstElementChild?.querySelector('svg')).not.toBeNull();
    expect(article?.lastElementChild?.tagName).toBe('FOOTER');
  });

  it('carries the author and the time in that footer', () => {
    render(<ProposalCard item={diagramItem([])} />);

    const footer = screen.getByText('Alice').closest('footer');
    expect(footer).not.toBeNull();
    expect(footer?.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-09-03T00:00:00.000Z',
    );
  });

  // The board draws the reaction chips over this card's bottom-left corner,
  // reaching up into it. The byline's inset has to clear them, and it has to
  // do so at a fixed size: a card that resized as chips came and went drew the
  // eye to its own edges rather than to what was written on it.
  it('keeps the same bottom inset whether or not it has reactions', () => {
    const bare = render(<ProposalCard item={diagramItem([])} />);
    const bareFooter = bare.container.querySelector('footer')?.className;
    bare.unmount();

    const reacted = render(
      <ProposalCard
        item={{ ...diagramItem([]), reactions: [{ emoji: '👍', userIds: ['someone'] }] }}
      />,
    );

    expect(reacted.container.querySelector('footer')?.className).toBe(bareFooter);
    expect(bareFooter).toContain('pb-3');
  });
});
