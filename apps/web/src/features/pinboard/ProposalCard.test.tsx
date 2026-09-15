import { fireEvent, render, screen } from '@testing-library/react';
import type { BoardItem, DiagramNode, StickyMark } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

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
    editedAt: null,
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

describe('sticky card', () => {
  // A note written in lines lands in those lines, rather than run together.
  it('shows the note exactly as written, line breaks and runs of spaces included', () => {
    const text = 'Ship the API\n\n    then   the UI';
    render(
      <ProposalCard
        item={{
          ...diagramItem([]),
          type: 'sticky',
          artifactJson: { type: 'sticky', text, color: 'yellow' },
        }}
      />,
    );

    const lines = [...document.querySelectorAll('.rt-sticky-line')];
    // A line for every line written, the blank one included, spaces kept.
    expect(lines.map((line) => line.textContent)).toEqual([
      'Ship the API',
      '',
      '    then   the UI',
    ]);
    // Preserves spaces as well as breaks; pre-line would collapse the spaces.
    expect(document.querySelector('[data-sticky-note]')).toHaveClass('whitespace-pre-wrap');
  });

  function stickyItem(text: string, marks?: StickyMark[]): BoardItem {
    return {
      ...diagramItem([]),
      type: 'sticky',
      artifactJson: { type: 'sticky', text, color: 'yellow', ...(marks ? { marks } : {}) },
    };
  }

  it('shows each word in the styles it was written in', () => {
    const { container } = render(
      <ProposalCard
        item={stickyItem('Ship the beta, not the bug', [
          { from: 0, to: 4, style: 'bold' },
          { from: 9, to: 13, style: 'italic' },
          { from: 15, to: 18, style: 'underline' },
          { from: 15, to: 18, style: 'strike' },
        ])}
      />,
    );

    const styled = [...container.querySelectorAll('[data-sticky-note] span')];
    expect(styled.map((span) => span.textContent)).toEqual(['Ship', 'beta', 'not']);
    expect(styled[0]).toHaveStyle({ fontWeight: '700' });
    expect(styled[1]).toHaveStyle({ fontStyle: 'italic' });
    expect((styled[2] as HTMLElement).style.textDecorationLine).toBe('underline line-through');
    expect(container.querySelector('[data-sticky-note]')?.textContent).toBe(
      'Ship the beta, not the bug',
    );
  });

  // Ranges a stored note no longer has words for are clamped, never an error.
  it('shows lists as they were written, numbered from 1', () => {
    render(
      <ProposalCard
        item={{
          ...stickyItem('Plan\nDraft\nReview\nNote'),
          artifactJson: {
            type: 'sticky',
            text: 'Plan\nDraft\nReview\nNote',
            color: 'yellow',
            lines: [null, 'number', 'number', 'bullet'],
          },
        }}
      />,
    );

    const lines = [...document.querySelectorAll('.rt-sticky-line')];
    expect(
      lines.map((line) => [line.getAttribute('data-list'), line.getAttribute('data-number')]),
    ).toEqual([
      [null, null],
      ['number', '1'],
      ['number', '2'],
      ['bullet', null],
    ]);
  });

  it('shows a note whose formatting runs past its words', () => {
    render(<ProposalCard item={stickyItem('Hi', [{ from: 0, to: 40, style: 'bold' }])} />);

    expect(screen.getByText('Hi')).toHaveStyle({ fontWeight: '700' });
  });

  // Longer than even the largest square holds: every word stays on the card,
  // which keeps the largest width and is left to grow taller.
  // jsdom lays nothing out, so the height itself is measured in a browser. What
  // this holds is the contract that lets the card grow: the square is a floor,
  // and nothing between the card and the note can be squeezed below the note,
  // which in a column that fills its card is what cut a long one off.
  it('lets a note too long for the largest square make the card taller', () => {
    const text = `Start${'\n'.repeat(20)}the end`;
    const { container } = render(<ProposalCard item={stickyItem(text)} />);

    const card = container.querySelector('article')!;
    const note = container.querySelector<HTMLElement>('[data-sticky-note]')!;
    expect(card.style.width).toBe('339px');
    expect(card.style.minHeight).toBe('339px');
    expect(card.style.height).toBe('');
    for (let box: HTMLElement | null = note; box && box !== card; box = box.parentElement) {
      expect(box.className).not.toMatch(/\bmin-h-0\b|\boverflow-(hidden|auto|clip)\b/);
      expect(box.style.height).toBe('');
      expect(box.style.maxHeight).toBe('');
    }
    expect(note.textContent).toContain('the end');
    expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull();
  });

  it('nests list items, each level numbered its own way', () => {
    render(
      <ProposalCard
        item={{
          ...stickyItem(''),
          artifactJson: {
            type: 'sticky',
            text: 'Plan\nScope\nBudget\nShip',
            color: 'yellow',
            lines: ['number', 'number', 'bullet', 'number'],
            levels: [0, 1, 2, 0],
          },
        }}
      />,
    );

    const lines = [...document.querySelectorAll('.rt-sticky-line')];
    expect(
      lines.map((line) => [line.getAttribute('data-level'), line.getAttribute('data-number')]),
    ).toEqual([
      [null, '1'],
      ['1', 'a'],
      ['2', null],
      [null, '2'],
    ]);
  });

  function linkedItem(href: string): BoardItem {
    return {
      ...stickyItem(''),
      artifactJson: {
        type: 'sticky',
        text: 'Read the spec first',
        color: 'yellow',
        links: [{ from: 9, to: 13, href }],
      },
    };
  }

  // Opened in a new tab, with nothing of the board handed to the site.
  it('opens a link in a new tab, telling the site nothing about the board', () => {
    render(<ProposalCard item={linkedItem('https://example.com/spec')} />);

    const link = screen.getByRole('link', { name: 'spec' });
    expect(link).toHaveAttribute('href', 'https://example.com/spec');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // A stored note is only as trustworthy as whoever wrote it.
  it('never draws a link that would run something, only its words', () => {
    const { container } = render(
      <ProposalCard item={linkedItem('javascript:alert(document.cookie)')} />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('[data-sticky-note]')?.textContent).toBe('Read the spec first');
  });

  // Pressing a link is not picking the card up, or pressing the card.
  it('keeps a press on a link to the link', () => {
    const onPointerDown = vi.fn();
    const onClick = vi.fn();
    render(
      <div onPointerDown={onPointerDown} onClick={onClick}>
        <ProposalCard item={linkedItem('https://example.com/spec')} />
      </div>,
    );

    const link = screen.getByRole('link', { name: 'spec' });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.pointerDown(link);
    fireEvent.click(link);

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  // On a ballot the card is the vote button, and a link inside a button is
  // neither one thing nor the other.
  it('draws links as words only where the card is itself a press', () => {
    render(<ProposalCard item={linkedItem('https://example.com/spec')} interactive={false} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('spec')).toHaveClass('rt-sticky-link');
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

describe('studio table proposal card (v4)', () => {
  const table = {
    id: 'table-1',
    x: 0,
    y: 0,
    colWidths: [96, 96],
    rowHeights: [32, 32],
    cells: [{ text: 'Idea' }, { text: 'Owner' }, { text: 'Search' }, { text: 'Ana' }],
    headerRow: true,
  };

  function tableItem(artifact: Partial<Extract<BoardItem['artifactJson'], { type: 'diagram' }>>) {
    return {
      ...diagramItem([]),
      artifactJson: { type: 'diagram' as const, nodes: [], edges: [], ...artifact },
    };
  }

  it('draws every cell of a proposed table', () => {
    const { container } = render(<ProposalCard item={tableItem({ tables: [table] })} />);
    const texts = [...container.querySelectorAll('text')].map((node) => node.textContent);
    expect(texts).toContain('Idea');
    expect(texts).toContain('Ana');
    // One rect per cell.
    expect(container.querySelectorAll('rect')).toHaveLength(4);
  });

  it('frames a canvas that holds only a table', () => {
    const { container } = render(<ProposalCard item={tableItem({ tables: [table] })} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('.border-dashed')).toBeNull();
  });

  it('tints the header row so it reads as a heading', () => {
    const { container } = render(<ProposalCard item={tableItem({ tables: [table] })} />);
    const fills = [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill'));
    // The first row is tinted and the body is not.
    expect(fills[0]).not.toBe(fills[2]);
  });

  it('honours a cell fill over the header tint', () => {
    const filled = {
      ...table,
      cells: [{ text: 'Idea', fill: 'rose' as const }, {}, {}, {}],
    };
    const { container } = render(<ProposalCard item={tableItem({ tables: [filled] })} />);
    const fills = [...container.querySelectorAll('rect')].map((rect) => rect.getAttribute('fill'));
    expect(fills).toContain('#FAE0E0');
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

  // The mark answers "is this still what they wrote", so it appears only once
  // the words have actually changed.
  it('says nothing about editing on a card nobody has edited', () => {
    render(<ProposalCard item={diagramItem([])} />);

    expect(screen.queryByText(/Edited/)).toBeNull();
  });

  it('marks a card whose content was rewritten, and says when', () => {
    render(<ProposalCard item={{ ...diagramItem([]), editedAt: '2026-09-03T04:30:00.000Z' }} />);

    const mark = screen.getByText(/Edited/);
    expect(mark).toBeTruthy();
    expect(mark.getAttribute('title')).toMatch(/^Edited at /);
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
