import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardItem, DiagramNode } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { ProposalCard } from './ProposalCard';

/** The word a byline mark shows, as opposed to the explanation it carries. */
function markLabelled(label: string | RegExp): HTMLElement | null {
  const shown = Array.from(
    document.querySelectorAll<HTMLElement>('[data-foot-mark] > [aria-hidden="true"]'),
  );
  return (
    shown.find((node) =>
      typeof label === 'string' ? node.textContent === label : label.test(node.textContent ?? ''),
    ) ?? null
  );
}

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
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
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

    const note = screen.getByText(/Ship the API/);
    expect(note.textContent).toBe(text);
    // Preserves spaces as well as breaks; pre-line would collapse the spaces.
    expect(note).toHaveClass('whitespace-pre-wrap');
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

    const mark = markLabelled(/^Edited$/);
    expect(mark).not.toBeNull();
    // Explained to screen readers as text, and on hover as a tooltip.
    expect(mark?.closest('[data-foot-mark]')?.textContent).toMatch(/Edited at /);
    // Kept on the right, beside the time.
    expect(
      mark?.closest('span.shrink-0:not([data-foot-mark])')?.querySelector('time'),
    ).not.toBeNull();
  });

  it('says nothing about extending on a card that builds on nobody', () => {
    render(<ProposalCard item={diagramItem([])} />);

    expect(screen.queryByText('Extended')).toBeNull();
  });

  // A reuse records its source too, but the server leaves `extendsFrom` empty
  // for it, so the card is quiet about it.
  it('says nothing for a reuse, whose lineage points at an earlier question', () => {
    render(<ProposalCard item={{ ...diagramItem([]), extendsProposalId: 'from-q1' }} />);

    expect(screen.queryByText('Extended')).toBeNull();
  });

  it('marks an extension, and names whose idea it builds on', () => {
    render(
      <ProposalCard
        viewerId="user-9"
        item={{
          ...diagramItem([]),
          extendsProposalId: 'original',
          extendsFrom: { authorId: 'user-2', authorName: 'Bob' },
        }}
      />,
    );

    const mark = markLabelled('Extended');
    expect(mark?.closest('[data-foot-mark]')?.textContent).toContain(
      "Extended: builds on Bob's idea",
    );
    // Beside the author's name, not over on the right with the time.
    expect(screen.getByText('Alice').parentElement?.contains(mark ?? null)).toBe(true);
  });

  it('says "your idea" when the viewer wrote the original', () => {
    render(
      <ProposalCard
        viewerId="user-2"
        item={{
          ...diagramItem([]),
          extendsProposalId: 'original',
          extendsFrom: { authorId: 'user-2', authorName: 'Bob' },
        }}
      />,
    );

    expect(markLabelled('Extended')?.closest('[data-foot-mark]')?.textContent).toContain(
      'Extended: builds on your idea',
    );
  });

  describe('when the byline is short of room', () => {
    const extended = {
      ...diagramItem([]),
      extendsProposalId: 'original',
      extendsFrom: { authorId: 'user-2', authorName: 'Bob' },
    };

    /**
     * jsdom lays nothing out, so the byline is given widths: the footer's
     * inner width, the name's natural width, the right-hand side's width and
     * the full word's.
     */
    function layOut({ foot, name }: { foot: number; name: number }) {
      const restore = [
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
          this: HTMLElement,
        ) {
          return this.tagName === 'FOOTER' ? foot : 0;
        }),
        vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
          this: HTMLElement,
        ) {
          return this.classList.contains('truncate') ? name : 0;
        }),
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
          this: HTMLElement,
        ) {
          if (this.tagName === 'SPAN' && this.querySelector('time')) return 40; // time
          if (this.textContent === 'Extended' && this.classList.contains('invisible')) return 44;
          return 0;
        }),
      ];
      return () => restore.forEach((spy) => spy.mockRestore());
    }

    it('keeps the whole word while there is a comfortable gap', () => {
      const restore = layOut({ foot: 200, name: 60 });
      try {
        render(<ProposalCard item={extended} />);
        expect(markLabelled('Extended')).not.toBeNull();
      } finally {
        restore();
      }
    });

    // Shortened before the two sides meet, not at the last pixel.
    it('shortens to "Ext." before the gap closes completely', () => {
      // 60 + 44 + 40 = 144 of 160: a gap remains, but a narrow one.
      const restore = layOut({ foot: 160, name: 60 });
      try {
        render(<ProposalCard item={extended} />);
        expect(markLabelled('Ext.')).not.toBeNull();
        expect(markLabelled('Extended')).toBeNull();
      } finally {
        restore();
      }
    });

    it('shortens for a long name on a roomy card', () => {
      const restore = layOut({ foot: 260, name: 190 });
      try {
        render(<ProposalCard item={extended} />);
        expect(markLabelled('Ext.')).not.toBeNull();
      } finally {
        restore();
      }
    });

    it('explains "Ext." on hover', async () => {
      const restore = layOut({ foot: 160, name: 60 });
      try {
        render(<ProposalCard item={extended} />);
        const mark = markLabelled('Ext.')!.closest('[data-foot-mark]')!;

        await userEvent.hover(mark);
        expect(await screen.findByRole('presentation', { hidden: true })).toHaveTextContent(
          "Extended: builds on Bob's idea",
        );

        await userEvent.unhover(mark);
        expect(screen.queryByRole('presentation', { hidden: true })).toBeNull();
      } finally {
        restore();
      }
    });
  });

  // The byline mixes text sizes; centring them leaves each word at a slightly
  // different height, so every level of it lines up on the text baseline.
  it('sets the whole byline on one baseline', () => {
    render(
      <ProposalCard
        item={{
          ...diagramItem([]),
          editedAt: '2026-09-03T04:30:00.000Z',
          extendsProposalId: 'original',
          extendsFrom: { authorId: 'user-2', authorName: 'Bob' },
        }}
      />,
    );

    const footer = screen.getByText('Alice').closest('footer')!;
    const rows = [footer, ...footer.querySelectorAll(':scope > span')];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveClass('items-baseline');
      expect(row).not.toHaveClass('items-center');
    }
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
