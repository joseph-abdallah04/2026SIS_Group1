import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import { proposalCreateSchema, type ProposalCreateInput } from '@roundtable/shared/schemas';
import { describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../../toolbar/CreativeToolbar';
import { CreativeStudio } from '../CreativeStudio';
import { useCreativeTools } from '../CreativeToolsContext';
import { CreativeToolsProvider } from '../CreativeToolsProvider';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_SHAPE_MEDIA_TYPE,
} from './diagramModel';

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

function mockSurface(canvas: Element, surface: { width: number; height: number }) {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: surface.width,
    bottom: surface.height,
    width: surface.width,
    height: surface.height,
    toJSON: () => ({}),
  });
}

async function openDiagram(
  surface = { width: DIAGRAM_CANVAS_WIDTH, height: DIAGRAM_CANVAS_HEIGHT },
) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Diagram$/ }));
  const canvas = screen.getByRole('application', { name: 'Diagram canvas' });
  mockSurface(canvas, surface);
  return { user, canvas };
}

function connectedFixture(): BoardItem {
  return {
    id: 'viewport-parent',
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
      edges: [{ from: 'n1', to: 'n2', label: 'calls' }],
    },
    x: 0,
    y: 0,
    createdAt: '2026-09-03T00:00:00.000Z',
    extendsProposalId: null,
  };
}

// Mirrors what a browser actually delivers to the node: pointerdown/pointerup
// pairs. The node cancels pointerdown for dragging and the canvas takes pointer
// capture, so no native dblclick is ever dispatched there.
function pressNode(
  node: Element,
  canvas: Element,
  {
    pointerId,
    time,
    clientX = 30,
    clientY = 30,
    shiftKey = false,
  }: {
    pointerId: number;
    time: number;
    clientX?: number;
    clientY?: number;
    shiftKey?: boolean;
  },
) {
  const down = createEvent.pointerDown(node, {
    button: 0,
    pointerId,
    clientX,
    clientY,
    shiftKey,
  });
  Object.defineProperty(down, 'timeStamp', { value: time });
  fireEvent(node, down);
  fireEvent.pointerUp(canvas, { pointerId, clientX, clientY });
}

// jsdom has no DragEvent, so testing-library falls back to a plain Event and the
// pointer coordinates in the init are dropped. Attach them to the instance so the
// canvas receives the same shape a browser delivers.
function dropOnCanvas(
  canvas: Element,
  {
    clientX,
    clientY,
    types,
    data,
  }: { clientX: number; clientY: number; types: string[]; data: string },
) {
  const event = createEvent.drop(canvas, {
    dataTransfer: { types, getData: () => data, dropEffect: 'none' },
  });
  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(canvas, event);
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

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(node).toHaveAttribute('transform', 'translate(24, 24)');
    await user.click(screen.getByRole('button', { name: 'Redo diagram change' }));
    expect(node).toHaveAttribute('transform', 'translate(200, 128)');
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

  it('focuses the label editor on a real two-press double-click', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });

    pressNode(node, canvas, { pointerId: 41, time: 1000 });
    pressNode(node, canvas, { pointerId: 42, time: 1180 });

    expect(await screen.findByLabelText('Edit box label')).toHaveFocus();
  });

  it('keeps two slow presses on a node as plain selection', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });

    pressNode(node, canvas, { pointerId: 43, time: 1000 });
    pressNode(node, canvas, { pointerId: 44, time: 1600 });

    expect(screen.queryByLabelText('Edit box label')).not.toBeInTheDocument();
  });

  it('keeps a fast but visibly moved second press as a drag rather than an edit', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });

    pressNode(node, canvas, { pointerId: 47, time: 1000, clientX: 30, clientY: 30 });
    pressNode(node, canvas, { pointerId: 48, time: 1100, clientX: 30, clientY: 90 });

    expect(screen.queryByLabelText('Edit box label')).not.toBeInTheDocument();
  });

  it('does not start an inline edit when the second press lands on another node', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));

    pressNode(screen.getByRole('button', { name: 'Box: Box' }), canvas, {
      pointerId: 45,
      time: 1000,
    });
    pressNode(screen.getByRole('button', { name: 'Container: Container' }), canvas, {
      pointerId: 46,
      time: 1100,
    });

    expect(screen.queryByLabelText('Edit box label')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Edit container label')).not.toBeInTheDocument();
  });

  it('edits a node inline and undoes the whole label change in one step', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Box: Box' }));
    const inlineInput = screen.getByLabelText('Edit box label');

    await user.clear(inlineInput);
    await user.type(inlineInput, 'API Gateway{Enter}');
    expect(screen.getByRole('button', { name: 'Box: API Gateway' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.getByRole('button', { name: 'Box: Box' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redo diagram change' }));
    expect(screen.getByRole('button', { name: 'Box: API Gateway' })).toBeInTheDocument();
  });

  it('cancels an inline label edit with Escape without adding history', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Box: Box' }));
    const inlineInput = screen.getByLabelText('Edit box label');

    await user.clear(inlineInput);
    await user.type(inlineInput, 'Discard me{Escape}');

    expect(screen.getByRole('button', { name: 'Box: Box' })).toBeInTheDocument();
  });

  it('shows connection handles and previews an arrow to the pointer and target', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram({ width: 480, height: 300 });
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    expect(screen.getAllByTestId('connection-handle')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.pointerDown(screen.getAllByTestId('connection-handle')[1]!, {
      button: 0,
      pointerId: 21,
    });

    fireEvent.pointerMove(canvas, { pointerId: 21, clientX: 300, clientY: 150 });
    const preview = screen.getByTestId('connection-preview');
    expect(preview).toHaveAttribute('x2', '600');
    expect(preview).toHaveAttribute('y2', '300');

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Box: Box' }));
    expect(preview.getAttribute('x2')).not.toBe('600');
  });

  it('undoes a node deletion and its cascade-deleted arrow together', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    const parent: BoardItem = {
      id: 'history-parent',
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
    expect(screen.queryByRole('button', { name: /Arrow from/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));

    expect(screen.getByRole('button', { name: 'Box: Client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrow from Client to Server' })).toBeInTheDocument();
  });

  it('keeps a dirty diagram open when discard confirmation is declined', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(confirm).toHaveBeenCalledWith('Discard your unsaved diagram changes?');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('registers beforeunload protection only while the diagram is dirty', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });

  it('blocks submission while a node drag is active', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Box: Box' }), {
      button: 0,
      pointerId: 31,
      clientX: 30,
      clientY: 30,
    });

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish moving the element before proposing.',
    );
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

  it('undoes an arrow label and connection as separate intentional changes', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Box: Box' }));
    const edgeLabel = screen.getByLabelText('Label (optional)');
    await user.type(edgeLabel, 'calls');
    await user.tab();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.getByRole('button', { name: 'Arrow from Container to Box' })).toBeInTheDocument();
    expect(screen.queryByText('calls')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryByRole('button', { name: /Arrow from/ })).not.toBeInTheDocument();
  });

  it('undoes Arrange back to the authored positions', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    const box = screen.getByRole('button', { name: 'Box: Box' });
    const before = box.getAttribute('transform');
    await user.click(screen.getByRole('button', { name: 'Arrange' }));
    expect(box.getAttribute('transform')).not.toBe(before);

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(box).toHaveAttribute('transform', before ?? '');
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

  it('commits an inline label before Ctrl+Enter proposes', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Box: Box' }));
    const inline = screen.getByLabelText('Edit box label');
    await user.clear(inline);
    await user.type(inline, 'Committed label');

    fireEvent.keyDown(inline, { key: 'Enter', ctrlKey: true });

    const payload = propose.mock.calls[0]?.[0];
    expect(payload?.artifactJson.type === 'diagram' && payload.artifactJson.nodes[0]?.label).toBe(
      'Committed label',
    );
  });

  it('does not ask to discard after a successful proposal', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await screen.findByRole('heading', { name: 'Diagram proposed' });
    const backButtons = screen.getAllByRole('button', { name: 'Back to pinboard' });
    await user.click(backButtons.at(-1)!);

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    confirm.mockRestore();
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
    fireEvent.pointerMove(canvas, { pointerId: 8, clientX: 300, clientY: 200 });
    fireEvent.lostPointerCapture(canvas, { pointerId: 8 });
    fireEvent.pointerMove(canvas, { pointerId: 8, clientX: 400, clientY: 300 });

    expect(node).toHaveAttribute('transform', 'translate(296, 192)');
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(node).toHaveAttribute('transform', 'translate(24, 24)');
  });
});

describe('diagram viewport and productivity', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('zooms about the canvas centre and resets back to the whole sheet', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));

    expect(canvas).toHaveAttribute('viewBox', '0 0 960 600');

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(canvas).toHaveAttribute('viewBox', '96 60 768 480');
    expect(screen.getByText('125%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(canvas).toHaveAttribute('viewBox', '0 0 960 600');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('fits the diagram to its content and stops at the zoom ceiling', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));

    await user.click(screen.getByRole('button', { name: 'Fit diagram to view' }));

    expect(canvas).toHaveAttribute('viewBox', '0 0 240 150');
    expect(screen.getByText('400%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  });

  it('pans with Space and drag without touching the diagram', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });
    const before = node.getAttribute('transform');

    fireEvent.keyDown(canvas, { key: ' ' });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 60, clientX: 480, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 60, clientX: 580, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 60, clientX: 580, clientY: 300 });
    fireEvent.keyUp(canvas, { key: ' ' });

    expect(canvas).toHaveAttribute('viewBox', '16 60 768 480');
    expect(node).toHaveAttribute('transform', before!);
  });

  it('places a dragged palette shape under the cursor in the zoomed view', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));

    dropOnCanvas(canvas, {
      clientX: 480,
      clientY: 300,
      types: [DIAGRAM_SHAPE_MEDIA_TYPE],
      data: 'box',
    });

    // Client centre maps to sheet centre (480, 300); the box is centred on it.
    expect(screen.getByRole('button', { name: 'Box: Box' })).toHaveAttribute(
      'transform',
      'translate(424, 272)',
    );
  });

  it('ignores a drop that is not carrying a palette shape', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    dropOnCanvas(canvas, {
      clientX: 480,
      clientY: 300,
      types: ['text/plain'],
      data: 'rm -rf',
    });

    expect(screen.queryByRole('button', { name: /^Box:/ })).not.toBeInTheDocument();
    expect(screen.getByText('0/100 elements')).toBeInTheDocument();
  });

  it('sweeps a marquee across the canvas and aligns what it caught', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 61, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 61, clientX: 400, clientY: 200 });
    expect(screen.getByTestId('selection-marquee')).toHaveAttribute('width', '400');
    fireEvent.pointerUp(canvas, { pointerId: 61, clientX: 400, clientY: 200 });

    expect(screen.queryByTestId('selection-marquee')).not.toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Align bottom edges' }));

    // Box bottom 80 and container bottom 136 both settle on 136.
    expect(screen.getByRole('button', { name: 'Box: Box' })).toHaveAttribute(
      'transform',
      'translate(24, 80)',
    );
    expect(screen.getByRole('button', { name: 'Container: Container' })).toHaveAttribute(
      'transform',
      'translate(168, 24)',
    );
  });

  it('toggles a node in and out of the selection with shift-click', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    const box = screen.getByRole('button', { name: 'Box: Box' });

    expect(screen.getByText('1 selected')).toBeInTheDocument();

    pressNode(box, canvas, { pointerId: 62, time: 1000, shiftKey: true });
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-pressed', 'true');

    pressNode(box, canvas, { pointerId: 63, time: 3000, shiftKey: true });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-pressed', 'false');
  });

  it('drags a multi-selection as one rigid group', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    const box = screen.getByRole('button', { name: 'Box: Box' });
    fireEvent.pointerDown(box, { button: 0, pointerId: 64, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 64, clientX: 110, clientY: 70 });
    fireEvent.pointerUp(canvas, { pointerId: 64, clientX: 110, clientY: 70 });

    expect(box).toHaveAttribute('transform', 'translate(104, 64)');
    expect(screen.getByRole('button', { name: 'Container: Container' })).toHaveAttribute(
      'transform',
      'translate(248, 64)',
    );

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(box).toHaveAttribute('transform', 'translate(24, 24)');
  });

  it('collapses a multi-selection to the node that was clicked without dragging', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    const box = screen.getByRole('button', { name: 'Box: Box' });
    fireEvent.pointerDown(box, { button: 0, pointerId: 66, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 66, clientX: 30, clientY: 30 });

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Container: Container' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('deletes every selected element and its arrows in one undoable step', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={propose()}>
        <ExtendButton proposal={connectedFixture()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    const canvas = screen.getByRole('application', { name: 'Diagram canvas' });

    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'Delete' });

    expect(screen.getByText('0/100 elements')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arrow from/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.getByRole('button', { name: 'Arrow from Client to Server' })).toBeInTheDocument();
  });

  it('duplicates a selection with fresh ids and its internal arrow', async () => {
    const user = userEvent.setup();
    const send = propose();
    render(
      <Harness propose={send}>
        <ExtendButton proposal={connectedFixture()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    const canvas = screen.getByRole('application', { name: 'Diagram canvas' });

    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'd', ctrlKey: true });

    expect(screen.getAllByRole('button', { name: 'Box: Client' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Arrow from Client to Server' })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    expect(artifact?.type).toBe('diagram');
    if (artifact?.type !== 'diagram') return;
    expect(artifact.nodes).toHaveLength(4);
    expect(artifact.edges).toHaveLength(2);
    expect(new Set(artifact.nodes.map((node) => node.id)).size).toBe(4);
  });

  it('leaves the arrow behind when only one of its endpoints is copied', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={propose()}>
        <ExtendButton proposal={connectedFixture()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    const canvas = screen.getByRole('application', { name: 'Diagram canvas' });

    // The first node is selected on open; copy just that one.
    fireEvent.keyDown(canvas, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'v', ctrlKey: true });

    expect(screen.getAllByRole('button', { name: 'Box: Client' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Arrow from/ })).toHaveLength(1);
  });

  it('drops a node exactly where it was released once snapping is off', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Snap to grid' }));
    const node = screen.getByRole('button', { name: 'Box: Box' });

    fireEvent.pointerDown(node, { button: 0, pointerId: 65, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 65, clientX: 103, clientY: 77 });
    fireEvent.pointerUp(canvas, { pointerId: 65, clientX: 103, clientY: 77 });

    // 24 + 73 and 24 + 47, with no rounding onto the 8-unit grid.
    expect(node).toHaveAttribute('transform', 'translate(97, 71)');
  });

  it('hides the grid without changing the diagram', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();
    expect(screen.getByTestId('diagram-grid')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show grid' }));

    expect(screen.queryByTestId('diagram-grid')).not.toBeInTheDocument();
  });
});
