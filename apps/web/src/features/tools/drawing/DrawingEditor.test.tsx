import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { proposalCreateSchema, type ProposalCreateInput } from '@roundtable/shared/schemas';
import { describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../../toolbar/CreativeToolbar';
import { CreativeStudio } from '../CreativeStudio';
import { CreativeToolsProvider } from '../CreativeToolsProvider';
import { DRAWING_VIEWBOX_HEIGHT, DRAWING_VIEWBOX_WIDTH } from './drawingModel';

function Harness({ propose }: { propose: (input: ProposalCreateInput) => Promise<void> }) {
  return (
    <MemoryRouter initialEntries={['/sessions/demo']}>
      <CreativeToolsProvider isLive proposals={[]} propose={propose}>
        <CreativeToolbar />
        <CreativeStudio />
      </CreativeToolsProvider>
    </MemoryRouter>
  );
}

async function openDrawing() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Draw' }));
  const canvas = screen.getByRole('img', { name: 'Drawing canvas' });
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
  it('opens from the real toolbar and proposes a shared-schema drawing payload', async () => {
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
    expect(await screen.findByRole('heading', { name: 'Drawing proposed' })).toBeInTheDocument();
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

  it('discards the drawing when cancelled', async () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);
    const first = await openDrawing();
    drawStroke(first.canvas);

    await first.user.click(screen.getByRole('button', { name: 'Cancel' }));
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
