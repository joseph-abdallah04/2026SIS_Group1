import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionStatus } from '@roundtable/shared';

// The write path's rules are the interesting part, not Prisma. Both the
// database and the sessions adapter are stubbed so each rule can be exercised
// on its own; the queries themselves are covered by the integration smoke test.
vi.mock('../../db.js', () => ({
  prisma: {
    proposal: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock('./sessionsAdapter.js', () => ({
  getQuestion: vi.fn(),
  getActiveQuestion: vi.fn(),
  getSession: vi.fn(),
}));

const { prisma } = await import('../../db.js');
const { getActiveQuestion, getQuestion, getSession } = await import('./sessionsAdapter.js');
const { createProposal } = await import('./service.js');
const { registerPinboardSocketHandlers } = await import('./socket.js');

const create = vi.mocked(prisma.proposal.create);
const findFirst = vi.mocked(prisma.proposal.findFirst);
const question = vi.mocked(getQuestion);
const activeQuestion = vi.mocked(getActiveQuestion);
const session = vi.mocked(getSession);

const STICKY = {
  type: 'sticky',
  artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
  x: 0,
  y: 0,
} as Parameters<typeof createProposal>[0]['input'];

function questionRef(status: QuestionStatus = 'discussion') {
  return { id: 'q1', sessionId: 's1', text: 'Q', position: 0, status };
}

function createdRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-new',
    questionId: 'q1',
    authorId: 'u1',
    author: { displayName: 'Alice' },
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Hello', color: 'yellow' },
    x: 0,
    y: 0,
    extendsProposalId: null,
    reactions: [],
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  question.mockResolvedValue(questionRef('discussion'));
  session.mockResolvedValue({ id: 's1', title: 'Session', status: 'active', leaderId: 'leader-1' });
  create.mockResolvedValue(createdRow() as never);
});

describe('createProposal', () => {
  it('writes the proposal and returns it in board shape', async () => {
    const proposal = await createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY });
    expect(proposal.id).toBe('p-new');
    expect(proposal.authorName).toBe('Alice');
  });

  it('takes the author from its argument, never from the input', async () => {
    await createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ authorId: 'u1', questionId: 'q1' });
  });

  it('rejects a write to a question that does not exist', async () => {
    question.mockResolvedValue(null);
    await expect(
      createProposal({ questionId: 'gone', authorId: 'u1', input: STICKY }),
    ).rejects.toThrow(/Question not found/);
    expect(create).not.toHaveBeenCalled();
  });

  // The phase lock lives here rather than in the socket handler so a server-side
  // caller — the assistant proposing on a user's behalf (F37) — cannot skip it.
  it.each(['pending', 'voting', 'answered', 'skipped'] as const)(
    'refuses to write while the question is %s',
    async (status) => {
      question.mockResolvedValue(questionRef(status));
      await expect(
        createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY }),
      ).rejects.toThrow(/proposals are closed/);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('allows a write while the question is in discussion', async () => {
    await expect(
      createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY }),
    ).resolves.toBeDefined();
  });

  // F32: ending a session leaves its questions' statuses alone, so without the
  // session gate a question still in `discussion` would keep taking proposals
  // after the leader wrapped up.
  it('refuses to write once the session has ended, even with the question still in discussion', async () => {
    session.mockResolvedValue({
      id: 's1',
      title: 'Session',
      status: 'ended',
      leaderId: 'leader-1',
    });
    await expect(
      createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY }),
    ).rejects.toThrow(/has ended/);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(['draft', 'lobby'] as const)(
    'refuses to write while the session is %s',
    async (status) => {
      session.mockResolvedValue({ id: 's1', title: 'Session', status, leaderId: 'leader-1' });
      await expect(
        createProposal({ questionId: 'q1', authorId: 'u1', input: STICKY }),
      ).rejects.toThrow(/not live/);
      expect(create).not.toHaveBeenCalled();
    },
  );

  describe('extends', () => {
    const extending = { ...STICKY, extendsProposalId: 'parent-1' };

    it('accepts a parent that is on the same board', async () => {
      findFirst.mockResolvedValue({ id: 'parent-1' } as never);
      create.mockResolvedValue(createdRow({ extendsProposalId: 'parent-1' }) as never);

      const proposal = await createProposal({
        questionId: 'q1',
        authorId: 'u1',
        input: extending,
      });
      expect(proposal.extendsProposalId).toBe('parent-1');
    });

    it('rejects a parent on another board or already deleted', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        createProposal({ questionId: 'q1', authorId: 'u1', input: extending }),
      ).rejects.toThrow(/not on this board/);
      expect(create).not.toHaveBeenCalled();
    });

    it('scopes the parent lookup to this question and non-deleted rows', async () => {
      findFirst.mockResolvedValue({ id: 'parent-1' } as never);
      await createProposal({ questionId: 'q1', authorId: 'u1', input: extending });
      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({
        id: 'parent-1',
        questionId: 'q1',
        deletedAt: null,
      });
    });
  });
});

describe('proposalCreate handler', () => {
  // Just enough of a socket to capture the handler and inspect what it acks.
  function fakeSocket(data: { user: { id: string } | null; sessionId: string | null }) {
    const handlers = new Map<string, (payload: unknown, ack: unknown) => void>();
    const socket = {
      data,
      on: (event: string, fn: (payload: unknown, ack: unknown) => void) => {
        handlers.set(event, fn);
      },
    };
    const intent =
      (event: string) =>
      (payload: unknown): Promise<{ ok: boolean; code?: string }> =>
        new Promise((resolve) => {
          handlers.get(event)?.(payload, resolve);
        });

    return { socket, propose: intent('proposalCreate'), edit: intent('proposalUpdate') };
  }

  const io = { to: () => ({ emit: vi.fn() }) };

  function register(data: { user: { id: string } | null; sessionId: string | null }) {
    const harness = fakeSocket(data);
    registerPinboardSocketHandlers(io as never, harness.socket as never);
    return harness;
  }

  it('refuses a socket that has not joined a session', async () => {
    const { propose } = register({ user: null, sessionId: null });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'NOT_IN_SESSION' });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a socket with a session but no resolved user', async () => {
    const { propose } = register({ user: null, sessionId: 's1' });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'NOT_IN_SESSION' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a payload whose type contradicts its artifact', async () => {
    activeQuestion.mockResolvedValue(questionRef('discussion'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(await propose({ ...STICKY, type: 'drawing' })).toMatchObject({
      ok: false,
      code: 'INVALID_PROPOSAL',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a diagram whose arrow references a missing node', async () => {
    activeQuestion.mockResolvedValue(questionRef('discussion'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(
      await propose({
        type: 'diagram',
        artifactJson: {
          type: 'diagram',
          nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' }],
          edges: [{ from: 'n1', to: 'missing' }],
        },
        x: 0,
        y: 0,
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    expect(create).not.toHaveBeenCalled();
  });

  // Diagram contract v2 adds optional size and style fields. The editor bounds
  // them, but a crafted socket payload bypasses the editor entirely, so the
  // shared write schema has to stop these before anything is persisted.
  describe('diagram style contract v2', () => {
    function diagram(node: Record<string, unknown>) {
      return {
        type: 'diagram',
        artifactJson: {
          type: 'diagram',
          nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box', ...node }],
          edges: [],
        },
        x: 0,
        y: 0,
      };
    }

    beforeEach(() => {
      activeQuestion.mockResolvedValue(questionRef('discussion'));
    });

    it('accepts a legitimately sized and styled diagram', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          diagram({
            width: 200,
            height: 90,
            fillColor: 'blue',
            strokeColor: 'slate',
            strokeWidthPreset: 'thick',
            fontSizePreset: 'large',
          }),
        ),
      ).toMatchObject({ ok: true });
    });

    it('rejects a node carrying only one of width and height', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(await propose(diagram({ width: 200 }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a node sized outside the bounds', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(await propose(diagram({ width: 5_000, height: 5_000 }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(await propose(diagram({ width: 1, height: 1 }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a raw colour smuggled in place of a palette key', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(await propose(diagram({ fillColor: 'url(#evil)' }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(await propose(diagram({ strokeColor: '#ff0000' }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects an arrow style outside the closed set', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose({
          type: 'diagram',
          artifactJson: {
            type: 'diagram',
            nodes: [
              { id: 'n1', label: 'A', x: 0, y: 0 },
              { id: 'n2', label: 'B', x: 240, y: 0 },
            ],
            edges: [{ from: 'n1', to: 'n2', strokeStyle: 'wavy' }],
          },
          x: 0,
          y: 0,
        }),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });
  });

  // Container grouping is a graph, and a crafted payload can hand us a cycle or
  // a child hanging off a node that cannot hold children. Neither may persist.
  describe('container grouping', () => {
    function grouping(nodes: Record<string, unknown>[]) {
      return { type: 'diagram', artifactJson: { type: 'diagram', nodes, edges: [] }, x: 0, y: 0 };
    }

    const container = { id: 'c1', label: 'Platform', x: 24, y: 24, shape: 'container' };

    beforeEach(() => {
      activeQuestion.mockResolvedValue(questionRef('discussion'));
    });

    it('accepts a node nested in a container', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          grouping([
            container,
            { id: 'n1', label: 'API', x: 40, y: 40, shape: 'box', parentId: 'c1' },
          ]),
        ),
      ).toMatchObject({ ok: true });
    });

    it('rejects a child whose container does not exist', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          grouping([{ id: 'n1', label: 'API', x: 40, y: 40, shape: 'box', parentId: 'ghost' }]),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a child parented to something that cannot hold children', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          grouping([
            { id: 'n1', label: 'API', x: 24, y: 24, shape: 'box' },
            { id: 'n2', label: 'Db', x: 200, y: 24, shape: 'cylinder', parentId: 'n1' },
          ]),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a node parented to itself', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(await propose(grouping([{ ...container, parentId: 'c1' }]))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a nesting cycle of any length', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          grouping([
            { id: 'a', label: 'A', x: 0, y: 0, shape: 'container', parentId: 'c' },
            { id: 'b', label: 'B', x: 0, y: 0, shape: 'container', parentId: 'a' },
            { id: 'c', label: 'C', x: 0, y: 0, shape: 'container', parentId: 'b' },
          ]),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a shape outside the registry', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(grouping([{ id: 'n1', label: 'A', x: 0, y: 0, shape: 'hexagon' }])),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });
  });

  // F16 added a second way to write an artifact. The diagram contract has to
  // hold on edits exactly as it does on creation: the editor is not the only
  // thing that can emit one of these.
  describe('diagram contract on edits', () => {
    function edit(nodes: Record<string, unknown>[], edges: Record<string, unknown>[] = []) {
      return { id: 'p1', artifactJson: { type: 'diagram', nodes, edges } };
    }

    const container = { id: 'c1', label: 'Platform', x: 24, y: 24, shape: 'container' };

    beforeEach(() => {
      activeQuestion.mockResolvedValue(questionRef('discussion'));
    });

    it('rejects an edit whose arrow points at a node that is not there', async () => {
      const { edit: send } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await send(edit([{ id: 'n1', label: 'A', x: 0, y: 0 }], [{ from: 'n1', to: 'ghost' }])),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    });

    it('rejects an edit that duplicates a node id', async () => {
      const { edit: send } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await send(
          edit([
            { id: 'n1', label: 'A', x: 0, y: 0 },
            { id: 'n1', label: 'B', x: 200, y: 0 },
          ]),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    });

    it('rejects an edit that sizes a node outside the bounds', async () => {
      const { edit: send } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await send(edit([{ id: 'n1', label: 'A', x: 0, y: 0, width: 5_000, height: 5_000 }])),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    });

    it('rejects an edit that introduces a container cycle', async () => {
      const { edit: send } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await send(
          edit([
            { id: 'a', label: 'A', x: 0, y: 0, shape: 'container', parentId: 'b' },
            { id: 'b', label: 'B', x: 0, y: 0, shape: 'container', parentId: 'a' },
          ]),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    });

    it('rejects an edit carrying a colour outside the closed palette', async () => {
      const { edit: send } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await send(edit([{ id: 'n1', label: 'A', x: 0, y: 0, fillColor: 'url(#evil)' }])),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
    });

    it('still accepts a legitimate edit', async () => {
      const { edit: send } = register({ user: { id: 'u1' }, sessionId: 's1' });
      const result = await send(
        edit([container, { id: 'n1', label: 'API', x: 40, y: 40, shape: 'box', parentId: 'c1' }]),
      );
      // Ownership and row lookup are F16's concern; the contract check is ours,
      // so anything other than INVALID_PROPOSAL means the artifact passed.
      expect(result.code).not.toBe('INVALID_PROPOSAL');
    });
  });

  it('reports a closed board rather than failing silently', async () => {
    activeQuestion.mockResolvedValue(questionRef('voting'));
    question.mockResolvedValue(questionRef('voting'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'QUESTION_CLOSED' });
  });

  it('reports a session with no open question', async () => {
    activeQuestion.mockResolvedValue(null);
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
    expect(await propose(STICKY)).toMatchObject({ ok: false, code: 'NO_ACTIVE_QUESTION' });
  });

  it('writes with the socket\u2019s user, ignoring any author in the payload', async () => {
    activeQuestion.mockResolvedValue(questionRef('discussion'));
    const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });

    expect(await propose({ ...STICKY, authorId: 'someone-else' })).toMatchObject({ ok: true });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ authorId: 'u1' });
  });

  // The editor cannot produce any of these, but the socket is not the only way
  // a payload arrives, so each one has to die before persistence.
  describe('studio ink and paint order (v4)', () => {
    function studio(artifact: Record<string, unknown>) {
      return {
        type: 'diagram',
        artifactJson: { type: 'diagram', nodes: [], edges: [], ...artifact },
        x: 0,
        y: 0,
      } as Parameters<typeof createProposal>[0]['input'];
    }

    // Packed `[x0, y0, x1, y1]`, matching how the editor serialises a stroke.
    const stroke = (id: string) => ({
      id,
      points: [0, 0, 10, 10],
      strokeColor: 'ink',
      strokeWidthPreset: 'regular',
    });

    beforeEach(() => {
      activeQuestion.mockResolvedValue(questionRef('discussion'));
    });

    it('accepts a sketch drawn alongside shapes', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' }],
            ink: [stroke('ink-1')],
            z: ['ink-1', 'n1'],
          }),
        ),
      ).toMatchObject({ ok: true });
    });

    it('rejects a raw colour smuggled into a stroke', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ ink: [{ ...stroke('ink-1'), strokeColor: '#ff0000' }] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects two strokes sharing an id', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(await propose(studio({ ink: [stroke('ink-1'), stroke('ink-1')] }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a stroke that reuses a node id', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24 }],
            ink: [stroke('n1')],
          }),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a paint order naming something the diagram does not contain', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({ nodes: [{ id: 'n1', label: 'Client', x: 0, y: 0 }], z: ['n1', 'ghost'] }),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a container painted after the node it holds', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            nodes: [
              { id: 'outer', label: 'Group', x: 0, y: 0, shape: 'container' },
              { id: 'inner', label: 'Child', x: 10, y: 10, parentId: 'outer' },
            ],
            z: ['inner', 'outer'],
          }),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });
  });

  // Paths are decoration, but they are still user-authored payload: the editor
  // is not the only way one can arrive.
  describe('studio paths (v4)', () => {
    function studio(artifact: Record<string, unknown>) {
      return {
        type: 'diagram',
        artifactJson: { type: 'diagram', nodes: [], edges: [], ...artifact },
        x: 0,
        y: 0,
      } as Parameters<typeof createProposal>[0]['input'];
    }

    const line = (id: string) => ({
      id,
      anchors: [
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ],
      strokeColor: 'ink',
      strokeWidthPreset: 'regular',
    });

    beforeEach(() => {
      activeQuestion.mockResolvedValue(questionRef('discussion'));
    });

    it('accepts a line drawn alongside shapes', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' }],
            paths: [line('path-1')],
            z: ['path-1', 'n1'],
          }),
        ),
      ).toMatchObject({ ok: true });
    });

    it('accepts a closed path carrying a fill', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            paths: [
              {
                ...line('path-1'),
                anchors: [
                  { x: 0, y: 0 },
                  { x: 40, y: 0 },
                  { x: 40, y: 40 },
                ],
                closed: true,
                fillColor: 'blue',
              },
            ],
          }),
        ),
      ).toMatchObject({ ok: true });
    });

    it('rejects a fill on an open path', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ paths: [{ ...line('path-1'), fillColor: 'blue' }] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a path with a single anchor, which draws nothing', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ paths: [{ ...line('path-1'), anchors: [{ x: 0, y: 0 }] }] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a raw colour smuggled into a path', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ paths: [{ ...line('path-1'), strokeColor: '#ff0000' }] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a path that reuses a node id', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24 }],
            paths: [line('n1')],
          }),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a paint order naming a path the diagram does not contain', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ paths: [line('path-1')], z: ['path-1', 'path-ghost'] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('studio tables (v4)', () => {
    function studio(artifact: Record<string, unknown>) {
      return {
        type: 'diagram',
        artifactJson: { type: 'diagram', nodes: [], edges: [], ...artifact },
        x: 0,
        y: 0,
      } as Parameters<typeof createProposal>[0]['input'];
    }

    const table = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      x: 0,
      y: 0,
      colWidths: [96, 96],
      rowHeights: [32, 32],
      cells: [{}, {}, {}, {}],
      ...overrides,
    });

    beforeEach(() => {
      activeQuestion.mockResolvedValue(questionRef('discussion'));
    });

    it('accepts a well-formed table', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(await propose(studio({ tables: [table('table-1')] }))).toMatchObject({ ok: true });
    });

    it('rejects a grid whose cells do not match its rows and columns', async () => {
      // Every reader would disagree about which cell belongs where.
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ tables: [table('table-1', { cells: [{}, {}, {}] })] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a column narrower than the bounds allow', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(studio({ tables: [table('table-1', { colWidths: [1, 96] })] })),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a raw colour smuggled into a cell', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            tables: [table('table-1', { cells: [{ fill: '#ff0000' }, {}, {}, {}] })],
          }),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a table that reuses a node id', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      expect(
        await propose(
          studio({
            nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24 }],
            tables: [table('n1')],
          }),
        ),
      ).toMatchObject({ ok: false, code: 'INVALID_PROPOSAL' });
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects a grid with more columns than the contract allows', async () => {
      const { propose } = register({ user: { id: 'u1' }, sessionId: 's1' });
      const wide = table('table-1', {
        colWidths: Array.from({ length: 40 }, () => 96),
        rowHeights: [32],
        cells: Array.from({ length: 40 }, () => ({})),
      });
      expect(await propose(studio({ tables: [wide] }))).toMatchObject({
        ok: false,
        code: 'INVALID_PROPOSAL',
      });
      expect(create).not.toHaveBeenCalled();
    });
  });
});
