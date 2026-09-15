import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import { proposalCreateSchema, type ProposalCreateInput } from '@roundtable/shared/schemas';
import { describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../../toolbar/CreativeToolbar';
import { useCreativeTools } from '../CreativeToolsContext';
import { CreativeStudio } from '../CreativeStudio';
import { CreativeToolsProvider } from '../CreativeToolsProvider';
import {
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  serializeDrawingSvg,
  strokesToData,
} from './drawingModel';

/**
 * The creative toolbar no longer offers Draw, but the drawing editor is still
 * live: a `?tool=drawing` link opens it, and so does extending or editing a
 * drawing already on the board. All three arrive through `openTool`, which is
 * what this stands in for.
 */
function OpenDrawing() {
  const { openTool } = useCreativeTools();
  return (
    <button type="button" onClick={() => openTool('drawing')}>
      Draw
    </button>
  );
}

function Harness({ propose }: { propose: (input: ProposalCreateInput) => Promise<void> }) {
  return (
    <MemoryRouter initialEntries={['/sessions/demo']}>
      <CreativeToolsProvider
        sessionId="session-1"
        questionId="question-1"
        viewerId={null}
        isLive
        proposals={[]}
        propose={propose}
        editProposal={async () => {}}
      >
        <CreativeToolbar />
        <OpenDrawing />
        <CreativeStudio />
      </CreativeToolsProvider>
    </MemoryRouter>
  );
}

async function openDrawing() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Draw' }));
  const canvas = screen.getByRole('application', { name: 'Drawing canvas' });
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: DRAWING_VIEWBOX_WIDTH,
    bottom: DRAWING_VIEWBOX_HEIGHT,
    width: DRAWING_VIEWBOX_WIDTH,
    height: DRAWING_VIEWBOX_HEIGHT,
    toJSON: () => ({}),
  });
  return { user, canvas };
}

function drawStroke(canvas: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: 80, clientY: 90 });
  fireEvent.pointerMove(canvas, { pointerId, clientX: 180, clientY: 150 });
  fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: 180, clientY: 150 });
}

describe('drawing editor', () => {
  it('is no longer one of the tools the toolbar starts', async () => {
    // Drawing was folded into the studio, which draws freehand on the same
    // canvas as everything else. Only the button went: the editor below still
    // has to work for the drawings already on a board.
    render(<Harness propose={vi.fn(async () => undefined)} />);
    const toolbar = screen.getByRole('navigation', { name: 'Creative tools' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Sticky', 'Studio']);
  });

  it('opens from the drawing entry point and proposes a shared-schema drawing payload', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDrawing();

    await user.click(screen.getByRole('button', { name: 'ocean ink' }));
    await user.click(screen.getByRole('button', { name: '14 pixel pen' }));
    drawStroke(canvas);
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledTimes(1);
    const payload = propose.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) throw new Error('Expected a drawing proposal payload');
    expect(proposalCreateSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({
      type: 'drawing',
      artifactJson: { type: 'drawing' },
      x: 32,
      y: 32,
    });
    if (payload.artifactJson.type !== 'drawing') {
      throw new Error('Expected the drawing editor to emit a drawing artifact');
    }
    expect(payload.artifactJson.svg).toContain('stroke="#4D6A74"');
    expect(payload.artifactJson.svg).toContain('stroke-width="14"');
    // Proposed, so the studio has closed back to the pinboard.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('rejects an empty sketch before calling the pinboard write path', async () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);
    const { user } = await openDrawing();

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Draw something before proposing this sketch.',
    );
  });

  it('supports undo and redo for a complete stroke', async () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDrawing();

    drawStroke(canvas);
    expect(screen.getByText(/1 stroke/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText(/0 strokes/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByText(/1 stroke/)).toBeInTheDocument();
  });

  it('focuses the canvas and supports undo from the drawing surface', async () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);
    const { canvas } = await openDrawing();

    drawStroke(canvas);
    expect(canvas).toHaveFocus();
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

    expect(screen.getByText(/0 strokes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });

  it('preserves the release position when a fast drag emits no move event', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDrawing();

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 4, clientX: 20, clientY: 30 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 4, clientX: 220, clientY: 230 });
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const payload = propose.mock.calls[0]?.[0];
    expect(payload?.artifactJson.type === 'drawing' && payload.artifactJson.svg).toContain(
      'L 220 230',
    );
  });

  it('discards the drawing when the studio is left', async () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);
    const first = await openDrawing();
    drawStroke(first.canvas);

    await first.user.click(screen.getByRole('button', { name: 'Back to pinboard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await first.user.click(screen.getByRole('button', { name: 'Draw' }));

    expect(screen.getByText(/0 strokes/)).toBeInTheDocument();
  });

  it('maps the real pinboard rejection shape to actionable copy', async () => {
    const rejection = Object.assign(new Error('Conflict'), { code: 'QUESTION_CLOSED' });
    const propose = vi.fn(async () => Promise.reject(rejection));
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDrawing();
    drawStroke(canvas);

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This question is no longer accepting proposals.',
    );
  });
});

/** A drawing on the board with its strokes stored, so it can be reopened. */
function drawingOnBoard(id: string, strokeCount: number): BoardItem {
  const strokes = Array.from({ length: strokeCount }, (_, index) => ({
    id: `s${index}`,
    ink: 'ink' as const,
    width: 8 as const,
    points: [
      { x: 60 + index * 40, y: 80 },
      { x: 160 + index * 40, y: 140 },
    ],
  }));
  return {
    id,
    questionId: 'question-1',
    authorId: 'alice',
    authorName: 'Alice',
    type: 'drawing',
    artifactJson: {
      type: 'drawing',
      svg: serializeDrawingSvg(strokes),
      strokes: strokesToData(strokes),
    },
    x: 0,
    y: 0,
    z: 0,
    createdAt: '2026-09-03T00:00:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

type OpenHow = 'extend' | 'reuse' | 'edit';

function OpenOn({ proposal, how }: { proposal: BoardItem; how: OpenHow }) {
  const { openEditorForEdit, openEditorForExtend, openEditorForReuse } = useCreativeTools();
  const open =
    how === 'edit' ? openEditorForEdit : how === 'reuse' ? openEditorForReuse : openEditorForExtend;
  return (
    <button type="button" onClick={() => open(proposal)}>
      {`${how} ${proposal.id}`}
    </button>
  );
}

function BoardHarness({
  propose,
  openers,
}: {
  propose: (input: ProposalCreateInput) => Promise<void>;
  openers: { proposal: BoardItem; how: OpenHow }[];
}) {
  return (
    <MemoryRouter initialEntries={['/sessions/demo']}>
      <CreativeToolsProvider
        sessionId="session-1"
        questionId="question-1"
        viewerId="alice"
        isLive
        proposals={openers.map((opener) => opener.proposal)}
        propose={propose}
        editProposal={async () => {}}
      >
        {openers.map((opener) => (
          <OpenOn key={`${opener.how}-${opener.proposal.id}`} {...opener} />
        ))}
        <CreativeStudio />
      </CreativeToolsProvider>
    </MemoryRouter>
  );
}

function mockCanvas() {
  const canvas = screen.getByRole('application', { name: 'Drawing canvas' });
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: DRAWING_VIEWBOX_WIDTH,
    bottom: DRAWING_VIEWBOX_HEIGHT,
    width: DRAWING_VIEWBOX_WIDTH,
    height: DRAWING_VIEWBOX_HEIGHT,
    toJSON: () => ({}),
  });
  return canvas;
}

describe('extending a drawing', () => {
  it('holds Propose until the drawing differs from its original', () => {
    const propose = vi.fn(async () => undefined);
    render(
      <BoardHarness
        propose={propose}
        openers={[{ proposal: drawingOnBoard('original', 1), how: 'extend' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'extend original' }));
    const canvas = mockCanvas();

    const proposeButton = screen.getByRole('button', { name: 'Propose' });
    expect(proposeButton).toBeDisabled();
    expect(screen.getByText(/Change something to extend this idea\./)).toBeInTheDocument();

    // Ctrl+Enter goes round the button, and is refused the same way.
    fireEvent.submit(canvas.closest('form')!);
    expect(propose).not.toHaveBeenCalled();

    drawStroke(canvas);
    expect(proposeButton).toBeEnabled();

    // Undoing the only change makes it the original again.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(proposeButton).toBeDisabled();
  });

  it('proposes an extension once it has changed, recording its original', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(
      <BoardHarness
        propose={propose}
        openers={[{ proposal: drawingOnBoard('original', 1), how: 'extend' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'extend original' }));
    drawStroke(mockCanvas());
    fireEvent.click(screen.getByRole('button', { name: 'Propose' }));

    await waitFor(() =>
      expect(propose).toHaveBeenCalledWith(
        expect.objectContaining({ extendsProposalId: 'original' }),
      ),
    );
  });

  it('lets a reuse be proposed exactly as it was', () => {
    render(
      <BoardHarness
        propose={vi.fn(async () => undefined)}
        openers={[{ proposal: drawingOnBoard('earlier', 1), how: 'reuse' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'reuse earlier' }));

    expect(screen.getByRole('button', { name: 'Propose' })).toBeEnabled();
  });

  it('leaves editing unaffected', () => {
    render(
      <BoardHarness
        propose={vi.fn(async () => undefined)}
        openers={[{ proposal: drawingOnBoard('mine', 1), how: 'edit' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'edit mine' }));

    expect(screen.getByRole('button', { name: 'Update proposal' })).toBeEnabled();
  });

  // The studio can be minimised with the board live, so another card can be
  // opened while an editor is still up. The canvas has to be that card's, or
  // saving would put one card's work under the other's name.
  it('opens a fresh canvas when another card is opened over an open editor', () => {
    render(
      <BoardHarness
        propose={vi.fn(async () => undefined)}
        openers={[
          { proposal: drawingOnBoard('one-stroke', 1), how: 'extend' },
          { proposal: drawingOnBoard('three-strokes', 3), how: 'edit' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'extend one-stroke' }));
    expect(screen.getByText(/^1 stroke ·/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'edit three-strokes' }));
    expect(screen.getByText(/^3 strokes ·/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit drawing' })).toBeInTheDocument();
  });

  // Opening resets the submission, and a reset mid-send would release the lock
  // that stops a second send.
  it('ignores another card being opened while a proposal is on its way', async () => {
    const propose = vi.fn(() => new Promise<void>(() => {}));
    render(
      <BoardHarness
        propose={propose}
        openers={[
          { proposal: drawingOnBoard('original', 1), how: 'extend' },
          { proposal: drawingOnBoard('other', 3), how: 'edit' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'extend original' }));
    drawStroke(mockCanvas());
    fireEvent.click(screen.getByRole('button', { name: 'Propose' }));
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'edit other' }));
    expect(screen.getByRole('heading', { name: 'Extend drawing' })).toBeInTheDocument();
  });
});
