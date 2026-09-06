import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import {
  DIAGRAM_FILL_COLORS,
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_STROKE_COLORS,
} from '@roundtable/shared';
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

describe('diagram resize and style', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  function styledParent(): BoardItem {
    return {
      id: 'v2-parent',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        nodes: [
          // One pre-v2 node and one fully styled v2 node on the same board.
          { id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' },
          {
            id: 'n2',
            label: 'Server',
            x: 300,
            y: 24,
            shape: 'box',
            width: 200,
            height: 96,
            fillColor: 'violet',
            strokeColor: 'violet',
            strokeWidthPreset: 'thick',
            fontSizePreset: 'large',
          },
        ],
        edges: [{ from: 'n1', to: 'n2', strokeColor: 'rose', strokeStyle: 'dashed' }],
      },
      x: 0,
      y: 0,
      createdAt: '2026-09-03T00:00:00.000Z',
      extendsProposalId: null,
    };
  }

  function nodeRect(name: string) {
    return screen
      .getByRole('button', { name })
      .querySelector<SVGRectElement>('rect:not([stroke-dasharray="4 3"])');
  }

  it('resizes a node from its corner as one undoable step', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));

    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 70,
      clientX: 144,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, { pointerId: 70, clientX: 224, clientY: 128 });
    fireEvent.pointerUp(canvas, { pointerId: 70, clientX: 224, clientY: 128 });

    const node = screen.getByRole('button', { name: 'Box: Box' });
    expect(node.querySelector('rect[width="200"][height="104"]')).not.toBeNull();
    expect(node).toHaveAttribute('transform', 'translate(24, 24)');

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(node.querySelector('rect[width="120"][height="56"]')).not.toBeNull();
  });

  it('proposes the resized geometry through the real contract', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));

    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 71,
      clientX: 144,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, { pointerId: 71, clientX: 224, clientY: 128 });
    fireEvent.pointerUp(canvas, { pointerId: 71, clientX: 224, clientY: 128 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]).toMatchObject({ width: 200, height: 104 });
  });

  it('resets a resized node back to its shape default', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    expect(screen.getByRole('button', { name: 'Reset size' })).toBeDisabled();

    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 72,
      clientX: 144,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, { pointerId: 72, clientX: 224, clientY: 128 });
    fireEvent.pointerUp(canvas, { pointerId: 72, clientX: 224, clientY: 128 });
    expect(screen.getByText('200 × 104')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset size' }));

    expect(screen.getByText('120 × 56 (default)')).toBeInTheDocument();
  });

  it('blocks a proposal while a resize is still in flight', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));

    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 73,
      clientX: 144,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, { pointerId: 73, clientX: 224, clientY: 128 });
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish resizing the element before proposing.',
    );
  });

  it('styles the whole selection at once and proposes the palette keys', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    await user.click(screen.getByRole('button', { name: 'Fill blue' }));
    await user.click(screen.getByRole('button', { name: 'Border rose' }));

    expect(nodeRect('Box: Box')).toHaveAttribute('fill', DIAGRAM_FILL_COLORS.blue);
    expect(nodeRect('Container: Container')).toHaveAttribute('fill', DIAGRAM_FILL_COLORS.blue);
    expect(nodeRect('Box: Box')).toHaveAttribute('stroke', DIAGRAM_STROKE_COLORS.rose);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    for (const node of artifact.nodes) {
      expect(node).toMatchObject({ fillColor: 'blue', strokeColor: 'rose' });
    }
  });

  it('marks a swatch active only when the whole selection shares it', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Fill green' }));
    expect(screen.getByRole('button', { name: 'Fill green' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The second node is unstyled, so the shared value disappears.
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    expect(screen.getByRole('button', { name: 'Fill green' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('resets a styled node back to the pre-v2 appearance', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    await user.click(screen.getByRole('button', { name: 'Fill amber' }));
    await user.click(screen.getByRole('button', { name: 'Text size large' }));

    await user.click(screen.getByRole('button', { name: 'Reset element style' }));

    expect(nodeRect('Box: Box')).toHaveAttribute('fill', '#EEF2F4');
    expect(nodeRect('Box: Box')).toHaveAttribute('stroke', '#4D6A74');
    expect(nodeRect('Box: Box')).toHaveAttribute('stroke-width', '1.5');
  });

  it('styles an arrow and keeps its dash geometry in step with its width', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={propose()}>
        <ExtendButton proposal={styledParent()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    const arrow = screen.getByRole('button', { name: 'Arrow from Client to Server' });
    fireEvent.pointerDown(arrow, { button: 0, pointerId: 74 });

    await user.click(screen.getByRole('button', { name: 'Arrow width thick' }));
    await user.click(screen.getByRole('button', { name: 'Arrow style dotted' }));

    // Selected arrows draw in the selection accent; the dash still scales.
    const line = arrow.querySelector('path[stroke-dasharray]');
    expect(line).toHaveAttribute('stroke-dasharray', '0.01 8.75');
    expect(line).toHaveAttribute('stroke-linecap', 'round');
  });

  it('renders an inherited pre-v2 node exactly as it always did', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={propose()}>
        <ExtendButton proposal={styledParent()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    const legacy = nodeRect('Box: Client');
    expect(legacy).toHaveAttribute('width', '120');
    expect(legacy).toHaveAttribute('height', '56');
    expect(legacy).toHaveAttribute('fill', '#EEF2F4');
    expect(legacy).toHaveAttribute('stroke', '#4D6A74');
    expect(legacy).toHaveAttribute('stroke-width', '1.5');
  });

  it('preserves inherited v2 size and style through an extend and re-propose', async () => {
    const user = userEvent.setup();
    const send = propose();
    render(
      <Harness propose={send}>
        <ExtendButton proposal={styledParent()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    const styled = nodeRect('Box: Server');
    expect(styled).toHaveAttribute('width', '200');
    expect(styled).toHaveAttribute('fill', DIAGRAM_FILL_COLORS.violet);
    expect(styled).toHaveAttribute('stroke-width', '3');

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes.find((node) => node.label === 'Server')).toMatchObject({
      width: 200,
      height: 96,
      fillColor: 'violet',
      strokeWidthPreset: 'thick',
      fontSizePreset: 'large',
    });
    // The pre-v2 sibling is re-proposed without acquiring any style fields.
    const legacy = artifact.nodes.find((node) => node.label === 'Client');
    expect(legacy).not.toHaveProperty('fillColor');
    expect(legacy).not.toHaveProperty('width');
    expect(artifact.edges[0]).toMatchObject({ strokeColor: 'rose', strokeStyle: 'dashed' });
  });

  it('wraps a long label into bounded lines instead of overflowing the node', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Box: Box' }));
    const inlineInput = screen.getByLabelText('Edit box label');
    await user.clear(inlineInput);
    await user.type(inlineInput, 'Payment reconciliation{Enter}');

    const label = screen
      .getByRole('button', { name: 'Box: Payment reconciliation' })
      .querySelector('text');
    expect(label?.querySelectorAll('tspan').length).toBeGreaterThan(1);
    expect(label?.getAttribute('textLength')).toBeNull();
  });
});

describe('diagram shapes and container groups', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  /** Container at (24, 24) 184x112 as `n1`, box at (312, 24) as `n2`. */
  async function containerAndBox() {
    const opened = await openDiagram();
    await opened.user.click(screen.getByRole('button', { name: 'Add container' }));
    await opened.user.click(screen.getByRole('button', { name: 'Add box' }));
    return opened;
  }

  function dragNode(
    node: Element,
    canvas: Element,
    { pointerId, from, to }: { pointerId: number; from: [number, number]; to: [number, number] },
  ) {
    fireEvent.pointerDown(node, { button: 0, pointerId, clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(canvas, { pointerId, clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(canvas, { pointerId, clientX: to[0], clientY: to[1] });
  }

  it('offers every registered shape and proposes each one through the real contract', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user } = await openDiagram();

    for (const shape of DIAGRAM_NODE_SHAPE_KEYS) {
      const label = shape === 'diamond' ? 'decision' : shape === 'cylinder' ? 'database' : shape;
      await user.click(screen.getByRole('button', { name: `Add ${label}` }));
    }

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes.map((node) => node.shape)).toEqual([...DIAGRAM_NODE_SHAPE_KEYS]);
  });

  it('renders each primitive with its own outline', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add ellipse' }));
    await user.click(screen.getByRole('button', { name: 'Add decision' }));
    await user.click(screen.getByRole('button', { name: 'Add triangle' }));
    await user.click(screen.getByRole('button', { name: 'Add database' }));

    expect(
      screen.getByRole('button', { name: 'Ellipse: Ellipse' }).querySelector('ellipse'),
    ).not.toBeNull();
    // 128x88 diamond: apex, right vertex, base, left vertex.
    expect(
      screen
        .getByRole('button', { name: 'Decision: Decision' })
        .querySelector('path[d="M64,0 L128,44 L64,88 L0,44 Z"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Triangle: Triangle' })
        .querySelector('path[d="M52,0 L104,88 L0,88 Z"]'),
    ).not.toBeNull();
    // The cylinder needs a second path for the front edge of its top rim.
    expect(
      screen.getByRole('button', { name: 'Database: Database' }).querySelectorAll('path'),
    ).toHaveLength(2);
  });

  it('groups a node dropped into a container and shows the target while dragging', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Box: Box' });

    fireEvent.pointerDown(box, { button: 0, pointerId: 80, clientX: 320, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 80, clientX: 68, clientY: 56 });
    expect(screen.getByTestId('container-drop-target')).toBeInTheDocument();
    fireEvent.pointerUp(canvas, { pointerId: 80, clientX: 68, clientY: 56 });

    expect(screen.queryByTestId('container-drop-target')).not.toBeInTheDocument();
    expect(screen.getByText('Inside Container')).toBeInTheDocument();
  });

  it('ungroups a node dragged back out of its container', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Box: Box' });

    dragNode(box, canvas, { pointerId: 81, from: [320, 30], to: [68, 56] });
    expect(screen.getByText('Inside Container')).toBeInTheDocument();

    dragNode(box, canvas, { pointerId: 82, from: [100, 60], to: [700, 460] });

    expect(screen.queryByText('Inside Container')).not.toBeInTheDocument();
  });

  it('proposes the grouping it was given', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Box: Box' });
    dragNode(box, canvas, { pointerId: 83, from: [320, 30], to: [68, 56] });

    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    const container = artifact.nodes.find((node) => node.shape === 'container');
    expect(artifact.nodes.find((node) => node.shape === 'box')?.parentId).toBe(container?.id);
  });

  it('carries a container’s contents when the container is moved', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Box: Box' });
    dragNode(box, canvas, { pointerId: 84, from: [320, 30], to: [68, 56] });
    const groupedAt = box.getAttribute('transform');

    const container = screen.getByRole('button', { name: 'Container: Container' });
    dragNode(container, canvas, { pointerId: 85, from: [30, 30], to: [230, 230] });

    expect(container).toHaveAttribute('transform', 'translate(224, 224)');
    // The child moved by exactly the same 200x200 the container did.
    const [, childX, childY] = /translate\((\d+), (\d+)\)/.exec(groupedAt!)!;
    expect(box).toHaveAttribute(
      'transform',
      `translate(${Number(childX) + 200}, ${Number(childY) + 200})`,
    );

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(box).toHaveAttribute('transform', groupedAt!);
  });

  it('refuses to nest a container inside its own child', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    await user.click(screen.getByRole('button', { name: 'Add container' }));
    // Containers land at (24, 24) and (312, 24).
    const [outer, inner] = screen.getAllByRole('button', { name: 'Container: Container' });

    // Nest the second container inside the first...
    dragNode(inner!, canvas, { pointerId: 86, from: [320, 30], to: [38, 36] });
    expect(screen.getByText('Inside Container')).toBeInTheDocument();

    // ...then drag the parent so it comes to rest over its own child.
    dragNode(outer!, canvas, { pointerId: 87, from: [30, 30], to: [38, 38] });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const input = send.mock.calls[0]?.[0];
    // A cycle would make the shared write contract reject the whole diagram.
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    const [first, second] = artifact.nodes;
    expect(first).not.toHaveProperty('parentId');
    expect(second?.parentId).toBe(first?.id);
  });

  it('draws a container behind everything it holds', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Box: Box' });
    dragNode(box, canvas, { pointerId: 88, from: [320, 30], to: [68, 56] });

    const drawn = [...canvas.querySelectorAll('g[role="button"]')].map((node) =>
      node.getAttribute('aria-label'),
    );
    expect(drawn.indexOf('Container: Container')).toBeLessThan(drawn.indexOf('Box: Box'));
  });

  it('groups a palette shape dropped straight into a container', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await user.click(screen.getByRole('button', { name: 'Add container' }));

    dropOnCanvas(canvas, {
      clientX: 100,
      clientY: 80,
      types: [DIAGRAM_SHAPE_MEDIA_TYPE],
      data: 'box',
    });

    expect(screen.getByText('Inside Container')).toBeInTheDocument();
  });

  it('pulls contents back inside when the container is made smaller', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Box: Box' });
    dragNode(box, canvas, { pointerId: 89, from: [320, 30], to: [68, 56] });

    // Select the container, then drag its bottom-right handle inwards.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Container: Container' }), {
      button: 0,
      pointerId: 90,
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerUp(canvas, { pointerId: 90, clientX: 30, clientY: 30 });
    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 91,
      clientX: 213,
      clientY: 141,
    });
    fireEvent.pointerMove(canvas, { pointerId: 91, clientX: 129, clientY: 101 });
    fireEvent.pointerUp(canvas, { pointerId: 91, clientX: 129, clientY: 101 });

    const [, x, y] = /translate\((\d+), (\d+)\)/.exec(box.getAttribute('transform')!)!;
    // The child stays within the container's new 104x72 bounds at (24, 24).
    expect(Number(x)).toBeGreaterThanOrEqual(24);
    expect(Number(x)).toBeLessThanOrEqual(24 + 104);
    expect(Number(y)).toBeGreaterThanOrEqual(24);
    expect(Number(y)).toBeLessThanOrEqual(24 + 72);
  });

  describe('deleting a container', () => {
    async function groupedThenDelete() {
      const opened = await containerAndBox();
      const box = screen.getByRole('button', { name: 'Box: Box' });
      dragNode(box, opened.canvas, { pointerId: 92, from: [320, 30], to: [68, 56] });

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Container: Container' }), {
        button: 0,
        pointerId: 93,
        clientX: 30,
        clientY: 30,
      });
      fireEvent.pointerUp(opened.canvas, { pointerId: 93, clientX: 30, clientY: 30 });
      await opened.user.click(screen.getByRole('button', { name: 'Delete selected element' }));
      return opened;
    }

    it('asks before destroying a container that holds something', async () => {
      render(<Harness propose={propose()} />);
      await groupedThenDelete();

      expect(screen.getByRole('alert')).toHaveTextContent('This container holds 1 element');
      // Nothing is removed until the question is answered.
      expect(screen.getByText('2/100 elements')).toBeInTheDocument();
    });

    it('keeps the contents and lifts them out when asked to', async () => {
      render(<Harness propose={propose()} />);
      await groupedThenDelete();

      await userEvent.setup().click(screen.getByRole('button', { name: /Keep contents/ }));

      expect(
        screen.queryByRole('button', { name: 'Container: Container' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Box: Box' })).toBeInTheDocument();
      expect(screen.getByText('1/100 elements')).toBeInTheDocument();
    });

    it('removes the whole group when asked to, in one undo step', async () => {
      render(<Harness propose={propose()} />);
      const { user } = await groupedThenDelete();

      await user.click(screen.getByRole('button', { name: /Delete contents/ }));
      expect(screen.getByText('0/100 elements')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
      expect(screen.getByText('2/100 elements')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Box: Box' })).toBeInTheDocument();
    });

    it('backs out of the question on Cancel without touching the diagram', async () => {
      render(<Harness propose={propose()} />);
      const { user } = await groupedThenDelete();

      await user.click(screen.getByRole('button', { name: 'Cancel deleting the container' }));

      expect(screen.getByText('2/100 elements')).toBeInTheDocument();
    });

    it('deletes an empty container without asking', async () => {
      render(<Harness propose={propose()} />);
      const { user } = await openDiagram();
      await user.click(screen.getByRole('button', { name: 'Add container' }));

      await user.click(screen.getByRole('button', { name: 'Delete selected element' }));

      expect(screen.getByText('0/100 elements')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});

describe('diagram routing and graph-aware arrange', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  function chainFixture(edges: { from: string; to: string }[]): BoardItem {
    return {
      id: 'routing-parent',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        // Deliberately scattered so Arrange has something to improve.
        nodes: [
          { id: 'n1', label: 'Client', x: 600, y: 400, shape: 'box' },
          { id: 'n2', label: 'Api', x: 40, y: 300, shape: 'box' },
          { id: 'n3', label: 'Store', x: 700, y: 40, shape: 'box' },
        ],
        edges,
      },
      x: 0,
      y: 0,
      createdAt: '2026-09-04T00:00:00.000Z',
      extendsProposalId: null,
    };
  }

  async function openFixture(edges: { from: string; to: string }[]) {
    const user = userEvent.setup();
    const send = propose();
    render(
      <Harness propose={send}>
        <ExtendButton proposal={chainFixture(edges)} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    return { user, send };
  }

  function positionOf(name: string): { x: number; y: number } {
    const transform = screen.getByRole('button', { name }).getAttribute('transform')!;
    const [, x, y] = /translate\((-?\d+), (-?\d+)\)/.exec(transform)!;
    return { x: Number(x), y: Number(y) };
  }

  it('arranges a chain along its arrows instead of on a bare grid', async () => {
    const { user } = await openFixture([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Arrange' }));

    // Top to bottom is the default flow.
    expect(positionOf('Box: Client').y).toBeLessThan(positionOf('Box: Api').y);
    expect(positionOf('Box: Api').y).toBeLessThan(positionOf('Box: Store').y);
    // A single chain lines up on one column.
    expect(positionOf('Box: Client').x).toBe(positionOf('Box: Api').x);
  });

  it('switches the flow axis when left to right is chosen', async () => {
    const { user } = await openFixture([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Arrange left to right' }));
    await user.click(screen.getByRole('button', { name: 'Arrange' }));

    expect(positionOf('Box: Client').x).toBeLessThan(positionOf('Box: Api').x);
    expect(positionOf('Box: Api').x).toBeLessThan(positionOf('Box: Store').x);
    expect(positionOf('Box: Client').y).toBe(positionOf('Box: Api').y);
  });

  it('marks the chosen flow direction as pressed', async () => {
    const { user } = await openFixture([{ from: 'n1', to: 'n2' }]);

    expect(screen.getByRole('button', { name: 'Arrange top to bottom' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Arrange left to right' }));

    expect(screen.getByRole('button', { name: 'Arrange left to right' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Arrange top to bottom' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('undoes a whole arrange in one step', async () => {
    const { user } = await openFixture([{ from: 'n1', to: 'n2' }]);
    const before = positionOf('Box: Client');

    await user.click(screen.getByRole('button', { name: 'Arrange' }));
    expect(positionOf('Box: Client')).not.toEqual(before);

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));

    expect(positionOf('Box: Client')).toEqual(before);
  });

  it('bows a reciprocal pair into two separate curves', async () => {
    await openFixture([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n1' },
    ]);

    const forward = screen.getByRole('button', { name: 'Arrow from Client to Api' });
    const back = screen.getByRole('button', { name: 'Arrow from Api to Client' });

    const forwardPath = forward.querySelector('path[marker-end]')!.getAttribute('d')!;
    const backPath = back.querySelector('path[marker-end]')!.getAttribute('d')!;
    expect(forwardPath).toContain('Q');
    expect(backPath).toContain('Q');
    expect(forwardPath).not.toBe(backPath);
  });

  it('leaves a lone arrow straight', async () => {
    await openFixture([{ from: 'n1', to: 'n2' }]);

    const path = screen
      .getByRole('button', { name: 'Arrow from Client to Api' })
      .querySelector('path[marker-end]')!
      .getAttribute('d')!;

    expect(path).toContain(' L');
    expect(path).not.toContain('Q');
  });

  it('gives a bowed arrow a hit target that follows the same curve', async () => {
    await openFixture([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n1' },
    ]);

    const arrow = screen.getByRole('button', { name: 'Arrow from Client to Api' });
    const [target, drawn] = arrow.querySelectorAll('path');
    expect(target?.getAttribute('d')).toBe(drawn?.getAttribute('d'));
    expect(target).toHaveAttribute('stroke', 'transparent');
  });

  it('proposes positions only: arrange never rewrites the arrows', async () => {
    const { user, send } = await openFixture([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Arrange' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.edges).toEqual([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ]);
    expect(artifact.nodes.map((entry) => entry.id)).toEqual(['n1', 'n2', 'n3']);
  });
});
