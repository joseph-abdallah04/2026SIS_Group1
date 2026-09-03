import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import { proposalCreateSchema, type ProposalCreateInput } from '@roundtable/shared/schemas';
import { describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../../toolbar/CreativeToolbar';
import { CreativeStudio } from '../CreativeStudio';
import { useCreativeTools } from '../CreativeToolsContext';
import { CreativeToolsProvider } from '../CreativeToolsProvider';
import { DIAGRAM_CANVAS_HEIGHT, DIAGRAM_CANVAS_WIDTH } from './diagramModel';

function Harness({
  children,
  propose,
}: {
  children?: React.ReactNode;
  propose: (input: ProposalCreateInput) => Promise<void>;
}) {
  return (
    <MemoryRouter initialEntries={['/sessions/demo']}>
      <CreativeToolsProvider isLive proposals={[]} propose={propose}>
        <CreativeToolbar />
        {children}
        <CreativeStudio />
      </CreativeToolsProvider>
    </MemoryRouter>
  );
}

function ExtendButton({ proposal }: { proposal: BoardItem }) {
  const { openEditorForExtend } = useCreativeTools();
  return <button onClick={() => openEditorForExtend(proposal)}>Extend diagram fixture</button>;
}

async function openDiagram() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Diagram$/ }));
  const canvas = screen.getByRole('application', { name: 'Diagram canvas' });
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: DIAGRAM_CANVAS_WIDTH,
    bottom: DIAGRAM_CANVAS_HEIGHT,
    width: DIAGRAM_CANVAS_WIDTH,
    height: DIAGRAM_CANVAS_HEIGHT,
    toJSON: () => ({}),
  });
  return { user, canvas };
}

describe('diagram editor', () => {
  it('creates all three shapes and proposes them through the real contract', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'API');
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const payload = propose.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload) throw new Error('Expected a diagram proposal payload');
    expect(proposalCreateSchema.safeParse(payload).success).toBe(true);
    expect(payload).toMatchObject({
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        edges: [],
        nodes: [
          { label: 'API', shape: 'box' },
          { label: 'Container', shape: 'container' },
          { label: 'Text', shape: 'text' },
        ],
      },
      x: 32,
      y: 32,
    });
    expect(await screen.findByRole('heading', { name: 'Diagram proposed' })).toBeInTheDocument();
  });

  it('blocks an empty diagram before the pinboard write path', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Add at least one element before proposing this diagram.',
    );
  });

  it('drags a node using scaled canvas coordinates and snaps it to the grid', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });

    fireEvent.pointerDown(node, { button: 0, pointerId: 3, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 3, clientX: 206, clientY: 134 });
    fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 206, clientY: 134 });

    expect(node).toHaveAttribute('transform', 'translate(200, 128)');
    expect(canvas).toHaveFocus();
  });

  it('deletes the selected node from the focused canvas', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });
    fireEvent.pointerDown(node, { button: 0, pointerId: 5, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 5, clientX: 30, clientY: 30 });

    fireEvent.keyDown(canvas, { key: 'Delete' });

    expect(screen.queryByRole('button', { name: 'Box: Box' })).not.toBeInTheDocument();
    expect(screen.getByText('0/100 elements')).toBeInTheDocument();
  });

  it('focuses the label editor when a node is double-clicked', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add text' }));

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Box: Box' }));

    expect(await screen.findByDisplayValue('Box')).toHaveFocus();
  });

  it('discards nodes when cancelled', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const first = await openDiagram();
    await first.user.click(screen.getByRole('button', { name: 'Add box' }));
    await first.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await first.user.click(screen.getByRole('button', { name: /^Diagram$/ }));

    expect(screen.getByText('0/100 elements')).toBeInTheDocument();
  });

  it('prefills an extended diagram and preserves its inherited edges', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    const parent: BoardItem = {
      id: 'parent-diagram',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        nodes: [
          { id: 'n1', label: 'Idea', x: 24, y: 24 },
          { id: 'n2', label: 'Decision', x: 160, y: 24, shape: 'container' },
        ],
        edges: [{ from: 'n1', to: 'n2', label: 'becomes' }],
      },
      x: 0,
      y: 0,
      createdAt: '2026-09-03T00:00:00.000Z',
      extendsProposalId: null,
    };

    render(
      <Harness propose={propose}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    expect(screen.getByText("Extending Alice's diagram")).toBeInTheDocument();
    expect(screen.getByText('2/100 elements')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Box: Idea' }));
    await user.type(screen.getByLabelText('Label (optional)'), 'references');
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        extendsProposalId: 'parent-diagram',
        artifactJson: expect.objectContaining({
          edges: [
            { from: 'n1', to: 'n2', label: 'becomes' },
            { from: 'n3', to: 'n1', label: 'references' },
          ],
        }),
      }),
    );
    const payload = propose.mock.calls[0]?.[0];
    expect(
      payload?.artifactJson.type === 'diagram' && payload.artifactJson.nodes[0]?.shape,
    ).toBeUndefined();
    expect(payload?.artifactJson.type === 'diagram' && payload.artifactJson.nodes[1]?.shape).toBe(
      'container',
    );
    expect(payload?.artifactJson.type === 'diagram' && payload.artifactJson.nodes[2]?.shape).toBe(
      'text',
    );
  });

  it('connects two nodes, labels the arrow, and proposes normalized edge data', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Client');
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    await user.clear(screen.getByLabelText('Label'));
    await user.type(screen.getByLabelText('Label'), 'Server');

    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByText('Choose a destination for Server.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Box: Client' }));
    const edgeLabel = screen.getByLabelText('Label (optional)');
    expect(edgeLabel).toHaveFocus();
    await user.type(edgeLabel, '  sends   request  ');
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const payload = propose.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload || payload.artifactJson.type !== 'diagram') {
      throw new Error('Expected a diagram proposal payload');
    }
    expect(proposalCreateSchema.safeParse(payload).success).toBe(true);
    expect(payload.artifactJson.edges).toEqual([{ from: 'n2', to: 'n1', label: 'sends request' }]);
    expect(Math.min(...payload.artifactJson.nodes.map((node) => node.x))).toBe(24);
    expect(Math.min(...payload.artifactJson.nodes.map((node) => node.y))).toBe(24);
  });

  it('deletes a selected arrow without deleting its nodes', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Box: Box' }));

    expect(screen.getByRole('button', { name: 'Arrow from Container to Box' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete selected arrow' }));

    expect(screen.queryByRole('button', { name: /Arrow from/ })).not.toBeInTheDocument();
    expect(screen.getByText('2 elements · 0 arrows')).toBeInTheDocument();
  });

  it('removes attached arrows when their node is deleted', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    const parent: BoardItem = {
      id: 'parent-with-edge',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        nodes: [
          { id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' },
          { id: 'n2', label: 'Server', x: 240, y: 24, shape: 'container' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      },
      x: 0,
      y: 0,
      createdAt: '2026-09-03T00:00:00.000Z',
      extendsProposalId: null,
    };
    render(
      <Harness propose={propose}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    await user.click(screen.getByRole('button', { name: 'Delete selected element' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const payload = propose.mock.calls[0]?.[0];
    expect(payload?.artifactJson.type === 'diagram' && payload.artifactJson.edges).toEqual([]);
    expect(payload?.artifactJson.type === 'diagram' && payload.artifactJson.nodes).toHaveLength(1);
  });

  it('blocks submission until an unfinished connection is completed or cancelled', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish or cancel the arrow before proposing.',
    );

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it('ends a drag safely when pointer capture is lost', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });

    fireEvent.pointerDown(node, { button: 0, pointerId: 8, clientX: 30, clientY: 30 });
    fireEvent.lostPointerCapture(canvas, { pointerId: 8 });
    fireEvent.pointerMove(canvas, { pointerId: 8, clientX: 400, clientY: 300 });

    expect(node).toHaveAttribute('transform', 'translate(24, 24)');
  });
});
