import { describe, expect, it } from 'vitest';
import { compareBoardItems, type BoardItem } from '@roundtable/shared';
import { proposalCreateSchema } from '@roundtable/shared/schemas';

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
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
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
    extendsProposalId: null,
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
      extendsProposalId: null,
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
    [
      'diagram',
      { type: 'diagram', nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }], edges: [] },
    ],
  ])('passes a %s artifact through unchanged', (type, artifactJson) => {
    const mapped = toBoardItem(row({ type: type as ProposalRow['type'], artifactJson }));
    expect(mapped.artifactJson).toEqual(artifactJson);
  });

  it('rejects a row whose stored artifact does not match its type', () => {
    // A sticky row carrying a diagram payload is corrupt data, not something to
    // render — the discriminated union catches it before it reaches a client.
    expect(() => toBoardItem(row({ artifactJson: { type: 'diagram', nodes: [] } }))).toThrow(
      /Invalid artifact/,
    );
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
    expect([...items].reverse().sort(compareBoardItems).map((i) => i.id)).toEqual(['a', 'c']);
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
