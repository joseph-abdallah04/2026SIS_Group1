import { describe, expect, it } from 'vitest';
import { compareBoardItems, type BoardItem } from '@roundtable/shared';
import { proposalCreateSchema, proposalUpdateSchema } from '@roundtable/shared/schemas';

import { toBoardItem } from './service.js';

// Pure logic only — no database. The Prisma query in `listProposals` is covered
// by the integration smoke test (docs/05 §10), not here.

type ProposalRow = Parameters<typeof toBoardItem>[0];

function row(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'u1',
    author: { displayName: 'Alice' },
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
    x: 10,
    y: 20,
    extendsProposalId: null,
    reactions: [],
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    ...overrides,
  } as ProposalRow;
}

function item(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'p1',
    questionId: 'q1',
    authorId: 'u1',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
    x: 0,
    y: 0,
    createdAt: '2026-08-31T10:00:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    reactions: [],
    ...overrides,
  };
}

describe('toBoardItem', () => {
  it('maps a proposal row to the wire shape, flattening the author name', () => {
    expect(toBoardItem(row())).toEqual({
      id: 'p1',
      questionId: 'q1',
      authorId: 'u1',
      authorName: 'Alice',
      type: 'sticky',
      artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
      x: 10,
      y: 20,
      createdAt: '2026-08-31T10:00:00.000Z',
      editedAt: null,
      extendsProposalId: null,
      reactions: [],
    });
  });

  it('serialises createdAt as a UTC ISO string so every client sorts alike', () => {
    const mapped = toBoardItem(row({ createdAt: new Date(1756634400000) }));
    expect(mapped.createdAt).toBe(new Date(1756634400000).toISOString());
    expect(mapped.createdAt).toMatch(/Z$/);
  });

  it('keeps the extends link for F23 child proposals', () => {
    expect(toBoardItem(row({ extendsProposalId: 'parent-1' })).extendsProposalId).toBe('parent-1');
  });

  it.each([
    ['drawing', { type: 'drawing', svg: '<svg />' }],
    ['diagram', { type: 'diagram', nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }], edges: [] }],
  ])('passes a %s artifact through unchanged', (type, artifactJson) => {
    const mapped = toBoardItem(row({ type: type as ProposalRow['type'], artifactJson }));
    expect(mapped.artifactJson).toEqual(artifactJson);
  });

  it('rejects a row whose stored artifact does not match its type', () => {
    // A sticky row carrying a diagram payload is corrupt data, not something to
    // render — the row/artifact type check catches it before it reaches a client.
    expect(() => toBoardItem(row({ artifactJson: { type: 'diagram', nodes: [] } }))).toThrow(
      /Invalid artifact/,
    );
  });

  it('keeps a structurally valid legacy diagram readable despite a dangling edge', () => {
    const artifactJson = {
      type: 'diagram',
      nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }],
      edges: [{ from: 'a', to: 'removed-node' }],
    };

    expect(toBoardItem(row({ type: 'diagram', artifactJson })).artifactJson).toEqual(artifactJson);
  });

  it('rejects an artifact with an unknown type', () => {
    expect(() => toBoardItem(row({ artifactJson: { type: 'video', url: 'x' } }))).toThrow(
      /Invalid artifact/,
    );
  });
});

describe('compareBoardItems', () => {
  it('orders by creation time', () => {
    const older = item({ id: 'b', createdAt: '2026-08-31T10:00:00.000Z' });
    const newer = item({ id: 'a', createdAt: '2026-08-31T10:00:01.000Z' });
    expect([newer, older].sort(compareBoardItems).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('breaks same-millisecond ties by id, so all clients agree', () => {
    const at = '2026-08-31T10:00:00.000Z';
    const items = [item({ id: 'c', createdAt: at }), item({ id: 'a', createdAt: at })];
    expect([...items].sort(compareBoardItems).map((i) => i.id)).toEqual(['a', 'c']);
    // Same input in the opposite arrival order must produce the same board.
    expect(
      [...items]
        .reverse()
        .sort(compareBoardItems)
        .map((i) => i.id),
    ).toEqual(['a', 'c']);
  });

  it('treats an item as equal to itself', () => {
    expect(compareBoardItems(item(), item())).toBe(0);
  });
});

describe('board convergence under live events (F15)', () => {
  // Sockets give no cross-client delivery-order guarantee, so two participants
  // can receive the same burst of proposals in different orders. Applying the
  // shared comparator after each insert is what makes their boards identical
  // anyway — "multiple rapid submissions render in consistent order everywhere".
  function applyLive(existing: BoardItem[], incoming: BoardItem): BoardItem[] {
    return [...existing.filter((i) => i.id !== incoming.id), incoming].sort(compareBoardItems);
  }

  const burst: BoardItem[] = [
    item({ id: 'c', createdAt: '2026-08-31T10:00:00.000Z' }),
    item({ id: 'a', createdAt: '2026-08-31T10:00:00.000Z' }),
    item({ id: 'b', createdAt: '2026-08-31T10:00:00.001Z' }),
  ];

  it('is insensitive to the order events arrive in', () => {
    const arrivals = [
      [burst[0], burst[1], burst[2]],
      [burst[2], burst[0], burst[1]],
      [burst[1], burst[2], burst[0]],
    ] as BoardItem[][];

    const boards = arrivals.map((order) => order.reduce(applyLive, []).map((i) => i.id));

    expect(boards).toEqual([
      ['a', 'c', 'b'],
      ['a', 'c', 'b'],
      ['a', 'c', 'b'],
    ]);
  });

  it('is idempotent, so a redelivered event cannot duplicate a card', () => {
    const once = burst.reduce(applyLive, [] as BoardItem[]);
    const twice = burst.reduce(applyLive, once);
    expect(twice.map((i) => i.id)).toEqual(once.map((i) => i.id));
  });

  it('matches what a reconnecting client gets from a fresh server snapshot', () => {
    const live = burst.reduce(applyLive, [] as BoardItem[]);
    const refetched = [...burst].sort(compareBoardItems);
    expect(live).toEqual(refetched);
  });
});

describe('proposalCreateSchema', () => {
  const sticky = {
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
    x: 0,
    y: 0,
  };

  it('accepts the payload the tool editors send', () => {
    expect(proposalCreateSchema.safeParse(sticky).success).toBe(true);
  });

  it('rejects a proposal whose column type contradicts its artifact', () => {
    const mismatched = { ...sticky, type: 'drawing' };
    expect(proposalCreateSchema.safeParse(mismatched).success).toBe(false);
  });

  it('drops fields the server owns, so a client cannot forge authorship', () => {
    const forged = { ...sticky, authorId: 'someone-else', questionId: 'another-board' };
    const parsed = proposalCreateSchema.safeParse(forged);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty('authorId');
    expect(parsed.success && parsed.data).not.toHaveProperty('questionId');
  });
});

describe('sticky formatting', () => {
  const withMarks = (text: string, marks: unknown) => ({
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow', marks },
    x: 0,
    y: 0,
  });

  it('accepts ranges that cover part of the note', () => {
    const parsed = proposalCreateSchema.safeParse(
      withMarks('Ship the beta', [
        { from: 0, to: 4, style: 'bold' },
        { from: 5, to: 13, style: 'italic' },
      ]),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.artifactJson).toMatchObject({
      marks: [
        { from: 0, to: 4, style: 'bold' },
        { from: 5, to: 13, style: 'italic' },
      ],
    });
  });

  it('accepts a sticky with no formatting, as every earlier note is', () => {
    expect(proposalCreateSchema.safeParse(withMarks('Hello', undefined)).success).toBe(true);
  });

  it('refuses a range that runs past the end of the note', () => {
    expect(
      proposalCreateSchema.safeParse(withMarks('Hi', [{ from: 0, to: 5, style: 'bold' }])).success,
    ).toBe(false);
  });

  it('refuses an empty or backwards range', () => {
    expect(
      proposalCreateSchema.safeParse(withMarks('Hello', [{ from: 3, to: 3, style: 'bold' }]))
        .success,
    ).toBe(false);
    expect(
      proposalCreateSchema.safeParse(withMarks('Hello', [{ from: 4, to: 1, style: 'bold' }]))
        .success,
    ).toBe(false);
  });

  it('refuses a style the board does not have', () => {
    expect(
      proposalCreateSchema.safeParse(withMarks('Hello', [{ from: 0, to: 2, style: 'comic-sans' }]))
        .success,
    ).toBe(false);
  });

  // An edit is a write, so it faces the same rules as a create.
  it('holds an edit to the same rules', () => {
    const edit = (marks: unknown) => ({
      id: 'p1',
      artifactJson: { type: 'sticky', text: 'Hi', color: 'yellow', marks },
    });
    expect(
      proposalUpdateSchema.safeParse(edit([{ from: 0, to: 2, style: 'underline' }])).success,
    ).toBe(true);
    expect(
      proposalUpdateSchema.safeParse(edit([{ from: 0, to: 9, style: 'underline' }])).success,
    ).toBe(false);
  });

  it('accepts a list style for each line of the note', () => {
    const listed = {
      type: 'sticky',
      artifactJson: {
        type: 'sticky',
        text: 'Plan\nDraft',
        color: 'yellow',
        lines: [null, 'number'],
      },
      x: 0,
      y: 0,
    };
    expect(proposalCreateSchema.safeParse(listed).success).toBe(true);
  });

  it('refuses a list style for a line the note does not have, or a style it cannot be', () => {
    const withLines = (lines: unknown) => ({
      type: 'sticky',
      artifactJson: { type: 'sticky', text: 'One line', color: 'yellow', lines },
      x: 0,
      y: 0,
    });
    expect(proposalCreateSchema.safeParse(withLines(['bullet', 'bullet'])).success).toBe(false);
    expect(proposalCreateSchema.safeParse(withLines(['checkbox'])).success).toBe(false);
  });

  it('accepts nesting for the lines of a list, as deep as a sticky goes', () => {
    const nested = (levels: unknown) => ({
      type: 'sticky',
      artifactJson: {
        type: 'sticky',
        text: 'Plan\nDraft\nReview',
        color: 'yellow',
        lines: ['bullet', 'bullet', 'bullet'],
        levels,
      },
      x: 0,
      y: 0,
    });
    expect(proposalCreateSchema.safeParse(nested([0, 1, 2])).success).toBe(true);
    expect(proposalCreateSchema.safeParse(nested([0, 1, 3])).success).toBe(false);
    expect(proposalCreateSchema.safeParse(nested([0, 1, 1, 1])).success).toBe(false);
    expect(proposalCreateSchema.safeParse(nested([0, 0.5])).success).toBe(false);
  });

  describe('links', () => {
    const withLinks = (text: string, links: unknown) => ({
      type: 'sticky',
      artifactJson: { type: 'sticky', text, color: 'yellow', links },
      x: 0,
      y: 0,
    });

    it('accepts a link to a website over part of the note', () => {
      const parsed = proposalCreateSchema.safeParse(
        withLinks('Read the spec', [{ from: 9, to: 13, href: 'https://example.com/spec' }]),
      );
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.artifactJson).toMatchObject({
        links: [{ from: 9, to: 13, href: 'https://example.com/spec' }],
      });
    });

    // Everybody on the board presses these, so nothing but a website gets in.
    it.each([
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'file:///etc/passwd',
      'mailto:someone@example.com',
      'https://trusted.example@evil.example',
      '//example.com',
      'example.com',
    ])('refuses a link that opens %s', (href) => {
      expect(
        proposalCreateSchema.safeParse(withLinks('Press here', [{ from: 0, to: 5, href }])).success,
      ).toBe(false);
    });

    it('refuses a link past the end of the note, empty, or over another link', () => {
      const href = 'https://example.com/';
      expect(
        proposalCreateSchema.safeParse(withLinks('Hi', [{ from: 0, to: 5, href }])).success,
      ).toBe(false);
      expect(
        proposalCreateSchema.safeParse(withLinks('Hello', [{ from: 2, to: 2, href }])).success,
      ).toBe(false);
      expect(
        proposalCreateSchema.safeParse(
          withLinks('Hello there', [
            { from: 6, to: 11, href },
            { from: 0, to: 7, href },
          ]),
        ).success,
      ).toBe(false);
    });

    it('holds an edit to the same rules', () => {
      const edit = (href: string) => ({
        id: 'p1',
        artifactJson: {
          type: 'sticky',
          text: 'Hi',
          color: 'yellow',
          links: [{ from: 0, to: 2, href }],
        },
      });
      expect(proposalUpdateSchema.safeParse(edit('https://example.com/')).success).toBe(true);
      expect(proposalUpdateSchema.safeParse(edit('javascript:alert(1)')).success).toBe(false);
    });
  });

  // Reading is tolerant: a stored note is shown, and the board clamps a range
  // to the text it has, rather than the whole board failing on one card.
  it('still reads a stored note whose ranges no longer fit', () => {
    const item = toBoardItem(
      row({
        artifactJson: {
          type: 'sticky',
          text: 'Hi',
          color: 'yellow',
          marks: [{ from: 0, to: 9, style: 'bold' }],
        },
      }),
    );
    expect(item.artifactJson).toMatchObject({ text: 'Hi' });
  });
});
