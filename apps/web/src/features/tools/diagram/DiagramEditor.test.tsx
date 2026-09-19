import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import {
  DIAGRAM_FILL_COLORS,
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_STROKE_COLORS,
  diagramNodeSize,
  effectiveDiagramNodeSize,
  diagramNodeLabelLayout,
} from '@roundtable/shared';
import { proposalCreateSchema, type ProposalCreateInput } from '@roundtable/shared/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../../toolbar/CreativeToolbar';
import { CreativeStudio } from '../CreativeStudio';
import { useCreativeTools } from '../CreativeToolsContext';
import { CreativeToolsProvider } from '../CreativeToolsProvider';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_GRID,
  DIAGRAM_NODE_HEIGHT,
  DIAGRAM_NODE_WIDTH,
  DIAGRAM_SHAPE_LABELS,
  DIAGRAM_SHAPE_MEDIA_TYPE,
} from './diagramModel';

/**
 * Where the next palette shape is dropped, and the pointer that drops it. The
 * palette hands you a shape to place rather than placing one, so the tests step
 * across the canvas the way the old free-position search used to.
 */
const NODE_GAP = 24;
let placedShapes = 0;
beforeEach(() => {
  placedShapes = 0;
});

/** The slot `findFreeNodePosition` used to hand out for the nth element. */
function nextShapeSlot() {
  const columnStep = DIAGRAM_NODE_WIDTH + NODE_GAP;
  const rowStep = DIAGRAM_NODE_HEIGHT + NODE_GAP;
  const columns = Math.max(1, Math.floor(DIAGRAM_CANVAS_WIDTH / columnStep));
  return {
    x: (placedShapes % columns) * columnStep + NODE_GAP,
    y: Math.floor(placedShapes / columns) * rowStep + NODE_GAP,
  };
}

/**
 * Clicks something that lives in one of the tool rail's sub-toolbars — the shape
 * palette, the eraser, a starter frame. Opens the menu first if it is shut; the
 * menu stays open between picks, and a press on the canvas closes it again.
 *
 * Picking a shape only picks it up, so this presses the canvas afterwards to put
 * it down — one call still means one element on the board.
 */
/**
 * A proposal that went through closes the studio, back to the pinboard, the way
 * the sticky popup closes. Nothing is left open to say so.
 */
async function proposedAndClosed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

async function clickInRailMenu(
  user: ReturnType<typeof userEvent.setup>,
  menu: string,
  name: string,
) {
  const trigger = screen.getByRole('button', { name: menu });
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
  await user.click(screen.getByRole('button', { name }));

  // A table and a starter frame are picked up too, and dropped in the middle of
  // the canvas.
  if (menu === 'Templates' || menu === 'Table') {
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });
    const at = { clientX: DIAGRAM_CANVAS_WIDTH / 2, clientY: DIAGRAM_CANVAS_HEIGHT / 2 };
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 8900, ...at });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 8900, ...at });
    return;
  }
  if (!name.startsWith('Add ')) return;

  const shape =
    DIAGRAM_NODE_SHAPE_KEYS.find(
      (key) => `Add ${DIAGRAM_SHAPE_LABELS[key].toLowerCase()}` === name,
    ) ?? 'box';
  const size = diagramNodeSize(shape);
  const canvas = screen.getByRole('application', { name: 'Studio canvas' });
  const slot = nextShapeSlot();
  placedShapes += 1;

  // The ghost is held around the cursor, so the press lands on the centre of
  // where the element should end up.
  const at = { clientX: slot.x + size.width / 2, clientY: slot.y + size.height / 2 };
  const pointerId = 9000 + placedShapes;
  fireEvent.pointerDown(canvas, { button: 0, pointerId, ...at });
  fireEvent.pointerUp(canvas, { button: 0, pointerId, ...at });
}

/**
 * Places a text element the way the tool does: arm it, press where it should
 * go, then type. An empty one is dropped, so every caller gives it text.
 */
async function placeText(
  user: ReturnType<typeof userEvent.setup>,
  canvas: Element,
  pointerId: number,
  at: [number, number],
  text: string,
) {
  await user.click(screen.getByRole('button', { name: 'Text' }));
  fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: at[0], clientY: at[1] });
  fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: at[0], clientY: at[1] });
  const input = await screen.findByLabelText('Edit text label');
  await user.type(input, text);
  fireEvent.blur(input);
}

/** Types into an element's label the way the canvas does: double-press it. */
async function typeNodeLabel(
  user: ReturnType<typeof userEvent.setup>,
  canvas: Element,
  name: string,
  pointerId: number,
  text: string,
) {
  const node = screen.getByRole('button', { name });
  pressNode(node, canvas, { pointerId, time: pointerId * 10 });
  pressNode(node, canvas, { pointerId: pointerId + 1, time: pointerId * 10 + 180 });
  const input = await screen.findByLabelText(/^Edit .* label$/);
  await user.clear(input);
  await user.type(input, text);
  fireEvent.blur(input);
}

/** One freehand stroke across the canvas. */
function drawStrokeOn(
  canvas: Element,
  pointerId: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: from.x, clientY: from.y });
  fireEvent.pointerMove(canvas, { pointerId, clientX: (from.x + to.x) / 2, clientY: to.y });
  fireEvent.pointerMove(canvas, { pointerId, clientX: to.x, clientY: to.y });
  fireEvent.pointerUp(canvas, { pointerId, clientX: to.x, clientY: to.y });
}

/** Two quick presses on a cell open it, the way the canvas detects them. */
function doublePressCell(cell: Element, canvas: Element, pointerId: number) {
  fireEvent.pointerDown(cell, { button: 0, pointerId, clientX: 400, clientY: 290 });
  fireEvent.pointerUp(canvas, { pointerId, clientX: 400, clientY: 290 });
  fireEvent.pointerDown(cell, { button: 0, pointerId: pointerId + 1, clientX: 400, clientY: 290 });
  fireEvent.pointerUp(canvas, { pointerId: pointerId + 1, clientX: 400, clientY: 290 });
}

/** A property's own choices live behind its button on the bar. */
async function openBarPanel(user: ReturnType<typeof userEvent.setup>, name: string) {
  const trigger = screen.getByRole('button', { name });
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
}

/**
 * The bar keeps two panels of its own: a table's rows and columns, and an
 * arrow's settings. Everything else the old sidebar held is reached on the
 * canvas instead — a label by double-pressing, a size by its corner handles.
 */
/**
 * Open the bar's own panel, if the selection has one.
 *
 * It only ever had two, and both have since gone: a table's rows and columns
 * moved onto the table, and an edge's settings became the arrow's own controls
 * in the bar. Kept as a no-op rather than deleted from a dozen call sites,
 * and narrowed to the bar so it cannot reach a tool palette that happens to
 * hold a button of the same name — which is exactly what it did to the shapes
 * palette's Arrow tile once that palette started staying open.
 */
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  const bar = screen.queryByRole('toolbar', { name: 'Selection properties' });
  if (!bar) return;
  for (const name of ['Rows and columns', 'Arrow']) {
    const trigger = within(bar).queryByRole('button', { name });
    if (!trigger) continue;
    if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
    return;
  }
}

/** Arranging moved onto the rail, in with the other canvas-wide settings. */
async function openArrangeMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: 'Arrange' });
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
}

async function arrangeDiagram(user: ReturnType<typeof userEvent.setup>) {
  await openArrangeMenu(user);
  await user.click(screen.getByRole('button', { name: 'Arrange the diagram' }));
}

function Harness({
  children,
  propose,
  questionId = 'question-1',
}: {
  children?: React.ReactNode;
  propose: (input: ProposalCreateInput) => Promise<void>;
  /** Drafts are kept per question, so a test can open the tool on another. */
  questionId?: string;
}) {
  return (
    <MemoryRouter initialEntries={['/sessions/demo']}>
      <CreativeToolsProvider
        sessionId="session-1"
        questionId={questionId}
        viewerId={null}
        isLive
        proposals={[]}
        propose={propose}
        editProposal={async () => {}}
      >
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

function EditButton({ proposal }: { proposal: BoardItem }) {
  const { openEditorForEdit } = useCreativeTools();
  return <button onClick={() => openEditorForEdit(proposal)}>Edit diagram fixture</button>;
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

/**
 * Two quick presses on the same spot.
 *
 * The DOM's `dblclick` never arrives on this canvas — taking pointer capture
 * retargets the follow-up events — so the editor detects a double press itself
 * and a test has to produce one the same way a user does.
 */
function doublePress(target: Element, canvas: Element, pointerId: number, x: number, y: number) {
  for (const id of [pointerId, pointerId + 1]) {
    fireEvent.pointerDown(target, { button: 0, pointerId: id, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas, { pointerId: id, clientX: x, clientY: y });
  }
}

async function openDiagram(
  surface = { width: DIAGRAM_CANVAS_WIDTH, height: DIAGRAM_CANVAS_HEIGHT },
) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Studio$/ }));
  const canvas = screen.getByRole('application', { name: 'Studio canvas' });
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
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
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
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 31, 'API');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await placeText(user, canvas, 21, [500, 400], 'Note');
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
          // Placed and left unlabelled: a shape with nothing typed into it is
          // still a drawing, and proposing no longer insists on a label.
          { label: '', shape: 'container' },
          { label: 'Note', shape: 'text' },
        ],
      },
      x: 32,
      y: 32,
    });
    await proposedAndClosed();
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
      'Add an element or draw something before proposing.',
    );
  });

  it('drags a node using scaled canvas coordinates and snaps it to the grid', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    fireEvent.pointerDown(node, { button: 0, pointerId: 5, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 5, clientX: 30, clientY: 30 });

    fireEvent.keyDown(canvas, { key: 'Delete' });

    expect(
      screen.queryByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
  });

  it('focuses the label editor on a real two-press double-click', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');

    pressNode(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }), canvas, {
      pointerId: 45,
      time: 1000,
    });
    pressNode(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' }), canvas, {
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));
    const inlineInput = screen.getByLabelText('Edit box label');

    await user.clear(inlineInput);
    await user.type(inlineInput, 'API Gateway{Enter}');
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: API Gateway' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Redo diagram change' }));
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: API Gateway' }),
    ).toBeInTheDocument();
  });

  it('cancels an inline label edit with Escape without adding history', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));
    const inlineInput = screen.getByLabelText('Edit box label');

    await user.clear(inlineInput);
    await user.type(inlineInput, 'Discard me{Escape}');

    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
  });

  it('shows connection handles and previews an arrow to the pointer and target', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram({ width: 480, height: 300 });
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    expect(screen.getAllByTestId('connection-handle')).toHaveLength(4);
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    fireEvent.pointerDown(screen.getAllByTestId('connection-handle')[1]!, {
      button: 0,
      pointerId: 21,
    });

    fireEvent.pointerMove(canvas, { pointerId: 21, clientX: 300, clientY: 150 });
    const preview = screen.getByTestId('connection-preview');
    expect(preview).toHaveAttribute('x2', '600');
    expect(preview).toHaveAttribute('y2', '300');

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));
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
      z: 0,
      editedAt: null,
      extendsProposalId: null,
      extendsFrom: null,
      reactions: [],
    };
    render(
      <Harness propose={propose}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Client' }));
    await user.click(screen.getByRole('button', { name: 'Delete selection' }));
    expect(screen.queryByRole('button', { name: /Arrow from/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));

    expect(screen.getByRole('button', { name: 'Rounded rectangle: Client' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrow from Client to Server' })).toBeInTheDocument();
  });

  // An edit rewrites a proposal already on the board, and the button says so.
  it('offers to update the proposal being edited rather than propose it again', async () => {
    const user = userEvent.setup();
    const proposal: BoardItem = {
      id: 'edited-diagram',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        nodes: [{ id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' }],
        edges: [],
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
    render(
      <Harness propose={vi.fn(async () => undefined)}>
        <EditButton proposal={proposal} />
        <ExtendButton proposal={proposal} />
      </Harness>,
    );

    await user.click(screen.getByRole('button', { name: 'Edit diagram fixture' }));
    const update = screen.getByRole('button', { name: 'Update proposal' });
    expect(update).toHaveAttribute('title', 'Update proposal (Ctrl+Enter)');
    expect(screen.queryByRole('button', { name: 'Propose' })).toBeNull();

    // Extending makes a new proposal, so it still proposes.
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    expect(await screen.findByRole('button', { name: 'Propose' })).toBeInTheDocument();
  });

  // Clearing is one step Undo brings back, so it does not ask first, and it
  // leaves the studio open: leaving is the back arrow.
  it('clears the canvas in one step that Undo brings back, and stays open', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    await openDiagram();
    expect(screen.getByRole('button', { name: 'Clear canvas' })).toBeDisabled();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    await user.click(screen.getByRole('button', { name: 'Clear canvas' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Clear canvas' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));

    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('has no Cancel beside Propose', async () => {
    render(<Harness propose={vi.fn(async () => undefined)} />);
    await openDiagram();

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose' })).toBeInTheDocument();
  });

  it('keeps a closed canvas rather than asking about it', async () => {
    // Closing is no longer destructive: the draft is kept, so the old question
    // — discard your unsaved changes? — had no truthful answer left.
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));
    expect(confirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Studio$/ }));
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
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

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }), {
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

  // An empty canvas is not kept as a draft, so clearing and then leaving is how
  // a canvas is thrown away.
  it('throws a canvas away when it is cleared and then left', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const first = await openDiagram();
    await clickInRailMenu(first.user, 'Shapes', 'Add rounded rectangle');
    await first.user.click(screen.getByRole('button', { name: 'Clear canvas' }));
    await first.user.click(screen.getByRole('button', { name: 'Back to pinboard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await first.user.click(screen.getByRole('button', { name: /^Studio$/ }));

    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
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
      z: 0,
      editedAt: null,
      extendsProposalId: null,
      extendsFrom: null,
      reactions: [],
    };

    render(
      <Harness propose={propose}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    expect(screen.getByText("Extending Alice's diagram")).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /rectangle:/ })).toHaveLength(2);
    await clickInRailMenu(user, 'Shapes', 'Add ellipse');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }));
    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.type(screen.getByRole('textbox', { name: 'Arrow label' }), 'references');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        extendsProposalId: 'parent-diagram',
        artifactJson: expect.objectContaining({
          // The inherited edge is carried through untouched. The new connection
          // is an arrow: nothing writes an edge any more.
          edges: [{ from: 'n1', to: 'n2', label: 'becomes' }],
          arrows: [
            expect.objectContaining({
              from: expect.objectContaining({ elementId: 'n3' }),
              to: expect.objectContaining({ elementId: 'n1' }),
              label: 'references',
            }),
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
      'ellipse',
    );
  });

  it('connects two nodes with an arrow bound to both of them', async () => {
    // Connect used to write an `edge`. It writes the studio's own arrow now —
    // the same thing the arrow tool draws — so what it makes can be restyled,
    // capped, bent and labelled. Edges are still read; none are written.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 33, 'Client');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await typeNodeLabel(user, canvas, 'Dotted rectangle: Unlabelled', 35, 'Server');

    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByText('Choose a destination for Server.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Client' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const payload = propose.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    if (!payload || payload.artifactJson.type !== 'diagram') {
      throw new Error('Expected a diagram proposal payload');
    }
    expect(proposalCreateSchema.safeParse(payload).success).toBe(true);
    expect(payload.artifactJson.edges).toEqual([]);

    const arrows = payload.artifactJson.arrows ?? [];
    expect(arrows).toHaveLength(1);
    // Bound at both ends, so it follows the two shapes exactly as an edge did.
    expect(arrows[0]?.from.elementId).toBe('n2');
    expect(arrows[0]?.to.elementId).toBe('n1');
    expect(Math.min(...payload.artifactJson.nodes.map((node) => node.x))).toBe(24);
    expect(Math.min(...payload.artifactJson.nodes.map((node) => node.y))).toBe(24);
  });

  it('hands the new arrow to the bar, with the arrow controls on it', async () => {
    // The edge had a panel of its own for the one thing it could not be given
    // on the canvas: a name. An arrow needs no such panel — everything it has
    // is in the bar, so that panel is gone.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));

    expect(screen.getByRole('button', { name: 'Start point' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Line shape' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End point' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Label (optional)')).toBeNull();
  });

  it('undoes a label and the connection itself as separate changes', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));

    await user.click(screen.getByRole('button', { name: 'Add text' }));
    await user.type(screen.getByRole('textbox', { name: 'Arrow label' }), 'calls');
    await user.keyboard('{Enter}');
    expect(screen.getByText('calls')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryByText('calls')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-arrow')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryByTestId('studio-arrow')).toBeNull();
  });

  it('undoes Arrange back to the authored positions', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    const before = box.getAttribute('transform');
    await arrangeDiagram(user);
    expect(box.getAttribute('transform')).not.toBe(before);

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(box).toHaveAttribute('transform', before ?? '');
  });

  it('deletes a connection without deleting the shapes it joined', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));

    expect(screen.getByTestId('studio-arrow')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete selection' }));

    expect(screen.queryByTestId('studio-arrow')).toBeNull();
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
      z: 0,
      editedAt: null,
      extendsProposalId: null,
      extendsFrom: null,
      reactions: [],
    };
    render(
      <Harness propose={propose}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Client' }));
    await user.click(screen.getByRole('button', { name: 'Delete selection' }));
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add ellipse');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish or cancel the arrow before proposing.',
    );

    await user.keyboard('{Escape}');
    await openMore(user);
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    expect(canvas).toHaveAttribute('viewBox', '0 0 960 600');

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    // The viewBox is the zoom level; the percentage that used to echo it back
    // was the least-reached thing in the busiest corner.
    expect(canvas).toHaveAttribute('viewBox', '96 60 768 480');

    await user.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(canvas).toHaveAttribute('viewBox', '0 0 960 600');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('pans with Space and drag without touching the diagram', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
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
    expect(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' })).toHaveAttribute(
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
    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
  });

  it('sweeps a marquee across the canvas and aligns what it caught', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 61, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(canvas, { pointerId: 61, clientX: 400, clientY: 200 });
    expect(screen.getByTestId('selection-marquee')).toHaveAttribute('width', '400');
    fireEvent.pointerUp(canvas, { pointerId: 61, clientX: 400, clientY: 200 });

    expect(screen.queryByTestId('selection-marquee')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Align' }));
    await user.click(screen.getByRole('button', { name: 'Align bottom' }));

    // Box bottom 80 and container bottom 136 both settle on 136.
    expect(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' })).toHaveAttribute(
      'transform',
      'translate(24, 80)',
    );
    expect(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' })).toHaveAttribute(
      'transform',
      'translate(168, 24)',
    );
  });

  it('aligns arrows along with everything else it swept up', async () => {
    // The sweep measures arrows and the bar offers alignment for them, so the
    // commit has to move them too. It did not: every other kind shifted and the
    // arrows stayed exactly where they were, which reads as alignment being
    // broken rather than as arrows being exempt from it.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    // Two free-ended arrows at different heights, and nothing else selected:
    // an arrow-only alignment was a silent no-op.
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: /^Arrow$/ }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 640, clientX: 60, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 640, clientX: 200, clientY: 340 });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 641, clientX: 60, clientY: 420 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 641, clientX: 200, clientY: 500 });

    await user.click(screen.getByRole('button', { name: /^Select$/ }));
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    const before = screen.getAllByTestId('studio-arrow').map((arrow) => arrow.getAttribute('d'));

    await user.click(screen.getByRole('button', { name: 'Align' }));
    await user.click(screen.getByRole('button', { name: 'Align left' }));

    const after = screen.getAllByTestId('studio-arrow').map((arrow) => arrow.getAttribute('d'));
    expect(after).toHaveLength(before.length);
    // At least one arrow has to have moved; aligning left cannot leave every
    // one of them where it was.
    expect(after).not.toEqual(before);
  });

  it('drops a selected arrow when any other kind is picked up', async () => {
    // Arrows were added to the selection but missed by the three "select just
    // this" helpers, so only picking a *different arrow* ever cleared one. A
    // shape, a line or a table left it selected alongside, and the properties
    // bar went on offering arrow controls for it.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    // A shape to pick up afterwards, placed rather than merely armed.
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 659, clientX: 500, clientY: 150 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 659, clientX: 500, clientY: 150 });

    // The move is what takes the arrow past the travel threshold; without one
    // it stays a draft and is never committed.
    await clickInRailMenu(user, 'Shapes', 'Arrow');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 660, clientX: 60, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 660, clientX: 200, clientY: 340 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 660, clientX: 200, clientY: 340 });
    await user.click(screen.getByRole('button', { name: /^Select$/ }));

    const arrow = screen.getByTestId('studio-arrow-hit');
    fireEvent.pointerDown(arrow, { button: 0, pointerId: 661 });
    fireEvent.pointerUp(canvas, { pointerId: 661 });
    // Endpoint handles only appear on a selected arrow, so they stand in for
    // "this arrow is selected" throughout.
    expect(
      screen.getByRole('button', { name: 'Move the start of this arrow' }),
    ).toBeInTheDocument();

    const shape = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    fireEvent.pointerDown(shape, { button: 0, pointerId: 662 });
    fireEvent.pointerUp(canvas, { pointerId: 662 });

    expect(
      screen.queryByRole('button', { name: 'Move the start of this arrow' }),
    ).not.toBeInTheDocument();

    // And the same again for a path, which clears the selection through its own
    // helper rather than through the node one.
    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 663, clientX: 100, clientY: 480 });
    fireEvent.pointerMove(canvas, { pointerId: 663, clientX: 400, clientY: 480 });
    fireEvent.pointerUp(canvas, { pointerId: 663, clientX: 400, clientY: 480 });
    await user.click(screen.getByRole('button', { name: /^Select$/ }));

    // Well clear of the earlier press on this same arrow: two presses at one
    // spot read as the double-press that opens the label for typing.
    fireEvent.pointerDown(screen.getByTestId('studio-arrow-hit'), {
      button: 0,
      pointerId: 664,
      clientX: 180,
      clientY: 330,
    });
    fireEvent.pointerUp(canvas, { pointerId: 664, clientX: 180, clientY: 330 });
    expect(
      screen.getByRole('button', { name: 'Move the start of this arrow' }),
    ).toBeInTheDocument();

    const line = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(line, { button: 0, pointerId: 665, clientX: 250, clientY: 480 });
    fireEvent.pointerUp(canvas, { pointerId: 665, clientX: 250, clientY: 480 });

    expect(
      screen.queryByRole('button', { name: 'Move the start of this arrow' }),
    ).not.toBeInTheDocument();
  });

  it('edits a label in the element’s own formatting, with no box around it', async () => {
    // The editor used to be a bordered white field at a fixed 11px, so editing
    // formatted text showed it unformatted and the original was still visible
    // around a field too small to cover it.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 910, 'Idea');
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }));

    await user.click(screen.getByRole('button', { name: 'Format text' }));
    await user.click(screen.getByRole('button', { name: 'large text' }));

    const node = screen.getByRole('button', { name: 'Rounded rectangle: Idea' });
    doublePress(node, canvas, 911, 84, 52);

    const field = screen.getByRole('textbox', { name: 'Edit box label' });
    // The element's own size and weight, not a form field's.
    expect(field).toHaveStyle({ fontSize: '22px' });
    expect(field.className).toContain('bg-transparent');
    expect(field.className).toContain('border-0');
    // Nothing of the old label is left showing behind the field.
    expect(node.querySelector('text')).toBeNull();
  });

  it('breaks an arrow label only where it was asked to, and hides it while editing', async () => {
    // An arrow has no box to wrap inside, so it only breaks on a newline. It
    // used to render as one unwrapped line, which ran a long label off the end
    // of its own arrow.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Arrow');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 920, clientX: 60, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 920, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 920, clientX: 300, clientY: 300 });
    await user.click(screen.getByRole('button', { name: 'Leave this arrow pointing at nothing' }));

    await user.click(screen.getByRole('button', { name: /^Select$/ }));
    fireEvent.pointerDown(screen.getByTestId('studio-arrow-hit'), {
      button: 0,
      pointerId: 921,
      clientX: 180,
      clientY: 300,
    });
    fireEvent.pointerUp(canvas, { pointerId: 921, clientX: 180, clientY: 300 });
    await user.click(screen.getByRole('button', { name: 'Add text' }));

    const field = screen.getByRole('textbox', { name: 'Arrow label' });
    // Nothing of the label is painted underneath the field being typed into.
    expect(screen.queryByTestId('studio-arrow')?.parentElement?.querySelector('text')).toBeNull();

    await user.type(field, 'first{Shift>}{Enter}{/Shift}second');
    fireEvent.blur(field);

    // Two lines, because two were asked for — one tspan each.
    const label = document.querySelector('[data-testid="studio-arrow"]')?.parentElement;
    expect(label?.querySelectorAll('tspan')).toHaveLength(2);
  });

  it('wraps a textbox onto a new line and grows to hold it', async () => {
    // Textboxes wrap and grow; a shape still truncates, because a shape has a
    // form of its own to keep.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 912, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 912, clientX: 300, clientY: 300 });

    const field = screen.getByRole('textbox', { name: 'Edit text label' });
    await user.type(field, 'The quick brown fox jumps over the lazy dog and keeps on running');
    fireEvent.blur(field);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    const textbox = artifact.nodes[0]!;
    // Taller than the 40 a textbox is placed at, because the words needed it.
    expect(textbox.height).toBeGreaterThan(40);
    // And nothing was thrown away to make it fit.
    expect(textbox.label).toContain('running');
  });

  it('offers a shape at the loose end of an arrow, and undoes both together', async () => {
    // Dropping an arrow on nothing is a finished arrow, not a half-made one.
    // The picker is an offer on top of that, not a question that has to be
    // answered before the arrow counts.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Arrow');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 900, clientX: 60, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 900, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 900, clientX: 300, clientY: 300 });

    expect(screen.getByTestId('arrow-shape-picker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End with ellipse' }));

    // One entry for both, so Undo does not leave an arrow bound to a shape that
    // is no longer there.
    expect(screen.getByRole('button', { name: 'Ellipse: Unlabelled' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryByRole('button', { name: 'Ellipse: Unlabelled' })).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-arrow')).toBeInTheDocument();
  });

  it('runs an arrow from a connection handle into empty space', async () => {
    // A connection used to need a second shape to already exist: pressing bare
    // canvas did nothing at all, so there was no way to point at nothing.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    fireEvent.pointerDown(screen.getAllByTestId('connection-handle')[0]!, {
      button: 0,
      pointerId: 904,
    });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 905, clientX: 400, clientY: 400 });

    expect(screen.getByTestId('arrow-shape-picker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'End with decision' }));

    expect(screen.getByRole('button', { name: 'Decision: Unlabelled' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.arrows).toHaveLength(1);
    // Bound at both ends: the source shape, and the one the picker just made.
    expect(artifact.arrows![0]!.from.elementId).toBeTruthy();
    expect(artifact.arrows![0]!.to.elementId).toBeTruthy();
    expect(proposalCreateSchema.safeParse(send.mock.calls[0]![0]).success).toBe(true);
  });

  it('leaves an arrow pointing at nothing when the picker is dismissed', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Arrow');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 902, clientX: 60, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 902, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 902, clientX: 300, clientY: 300 });

    await user.click(screen.getByRole('button', { name: 'Leave this arrow pointing at nothing' }));
    expect(screen.queryByTestId('arrow-shape-picker')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.arrows).toHaveLength(1);
    // Free at the far end: no shape had to exist for the arrow to be valid.
    expect(artifact.arrows![0]!.to.elementId).toBeUndefined();
    expect(artifact.nodes).toHaveLength(0);
  });

  it('toggles a node in and out of the selection with shift-click', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

    pressNode(box, canvas, { pointerId: 62, time: 1000, shiftKey: true });
    expect(box).toHaveAttribute('aria-pressed', 'true');

    pressNode(box, canvas, { pointerId: 63, time: 3000, shiftKey: true });
    expect(box).toHaveAttribute('aria-pressed', 'false');
  });

  it('drags a multi-selection as one rigid group', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    fireEvent.pointerDown(box, { button: 0, pointerId: 64, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 64, clientX: 110, clientY: 70 });
    fireEvent.pointerUp(canvas, { pointerId: 64, clientX: 110, clientY: 70 });

    expect(box).toHaveAttribute('transform', 'translate(104, 64)');
    expect(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' })).toHaveAttribute(
      'transform',
      'translate(248, 64)',
    );

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(box).toHaveAttribute('transform', 'translate(24, 24)');
  });

  it('collapses a multi-selection to the node that was clicked without dragging', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    fireEvent.pointerDown(box, { button: 0, pointerId: 66, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 66, clientX: 30, clientY: 30 });

    expect(box).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' })).toHaveAttribute(
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
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });

    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'Delete' });

    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
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
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });

    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'd', ctrlKey: true });

    expect(screen.getAllByRole('button', { name: 'Rounded rectangle: Client' })).toHaveLength(2);
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
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });

    // Nothing is selected on open, so pick the one endpoint to copy.
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Client' }));
    fireEvent.keyDown(canvas, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'v', ctrlKey: true });

    expect(screen.getAllByRole('button', { name: 'Rounded rectangle: Client' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Arrow from/ })).toHaveLength(1);
  });

  it('drops a node exactly where it was released once snapping is off', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Snap to grid' }));
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

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
      z: 0,
      editedAt: null,
      extendsProposalId: null,
      extendsFrom: null,
      reactions: [],
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 70,
      clientX: 144,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, { pointerId: 70, clientX: 224, clientY: 128 });
    fireEvent.pointerUp(canvas, { pointerId: 70, clientX: 224, clientY: 128 });

    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    expect(node.querySelector('rect[width="200"][height="104"]')).not.toBeNull();
    expect(node).toHaveAttribute('transform', 'translate(24, 24)');

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(node.querySelector('rect[width="120"][height="56"]')).not.toBeNull();
  });

  /**
   * The default-placed shape is 120x56 at (24, 24), so it turns about (84, 52)
   * and the zone outside its top-left corner covers the quadrant up and left of
   * (24, 24). Pressing that corner is a bearing of about -155 degrees from the
   * centre; (50, 3) is about -125, so the pointer sweeps roughly 30.
   */
  function rotateDefaultShape(canvas: Element, pointerId: number, shiftKey = false) {
    fireEvent.pointerDown(screen.getByTestId('rotate-zone-nw'), {
      button: 0,
      pointerId,
      clientX: 24,
      clientY: 24,
    });
    fireEvent.pointerMove(canvas, { pointerId, clientX: 50, clientY: 3, shiftKey });
    fireEvent.pointerUp(canvas, { pointerId, clientX: 50, clientY: 3, shiftKey });
  }

  it('turns a shape in five-degree steps and undoes the whole turn at once', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    rotateDefaultShape(canvas, 90);

    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    // Turned about its own centre, so the translate that places it is untouched.
    expect(node).toHaveAttribute('transform', 'translate(24, 24) rotate(30 60 28)');

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(node).toHaveAttribute('transform', 'translate(24, 24)');
  });

  it('offers a rotate zone outside every corner, behind the resize handles', async () => {
    // Turning is grabbed from outside a corner rather than from a grip on a
    // stem. The zones sit under the resize handles in paint order, so the
    // corner itself still resizes and only the ring beyond it turns.
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      expect(screen.getByTestId(`rotate-zone-${corner}`)).toBeInTheDocument();
      const zone = screen.getByTestId(`rotate-zone-${corner}`);
      const handle = screen.getByTestId(`resize-handle-${corner}`);
      // `compareDocumentPosition` says the handle comes after the zone, which
      // is what puts it on top in SVG.
      expect(zone.compareDocumentPosition(handle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('snaps the turn to 45 degrees while shift is held', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    // The same 30-degree sweep, which rounds up to the nearest 45 instead.
    rotateDefaultShape(canvas, 91, true);

    expect(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' })).toHaveAttribute(
      'transform',
      'translate(24, 24) rotate(45 60 28)',
    );
  });

  it('proposes a turned shape through the real contract', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    rotateDefaultShape(canvas, 92);
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]!.rotation).toBe(30);
    expect(proposalCreateSchema.safeParse(send.mock.calls[0]![0]).success).toBe(true);
  });

  it('leaves no rotation key on a shape that is turned back to square', async () => {
    // Absent has to keep meaning "never turned", so a shape returned to zero is
    // indistinguishable from one authored before rotation existed.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    rotateDefaultShape(canvas, 93);
    // Straight back: the same sweep in reverse, from -125 round to -155.
    fireEvent.pointerDown(screen.getByTestId('rotate-zone-nw'), {
      button: 0,
      pointerId: 94,
      clientX: 50,
      clientY: 3,
    });
    fireEvent.pointerMove(canvas, { pointerId: 94, clientX: 24, clientY: 24 });
    fireEvent.pointerUp(canvas, { pointerId: 94, clientX: 24, clientY: 24 });

    expect(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' })).toHaveAttribute(
      'transform',
      'translate(24, 24)',
    );

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]).not.toHaveProperty('rotation');
  });

  /** Arms the shape tool without the auto-place `clickInRailMenu` does. */
  async function armShapeTool(user: ReturnType<typeof userEvent.setup>) {
    const trigger = screen.getByRole('button', { name: 'Shapes' });
    if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Add rounded rectangle' }));
  }

  it('drags out a shape at the size it was dragged, previewing as it grows', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await armShapeTool(user);

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 96, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 96, clientX: 400, clientY: 320 });

    // The preview is the rectangle being dragged, not the default footprint.
    const ghost = screen.getByTestId('placement-ghost');
    expect(ghost.querySelector('rect[width="200"][height="120"]')).not.toBeNull();

    fireEvent.pointerUp(canvas, { pointerId: 96, clientX: 400, clientY: 320 });

    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    expect(node).toHaveAttribute('transform', 'translate(200, 200)');
    expect(node.querySelector('rect[width="200"][height="120"]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]).toMatchObject({ width: 200, height: 120 });
  });

  it('constrains a dragged-out shape to a square while shift is held', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await armShapeTool(user);

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 97, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 97, clientX: 400, clientY: 320, shiftKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 97, clientX: 400, clientY: 320, shiftKey: true });

    // The longer side wins, so the 200x120 drag becomes 200x200.
    expect(
      screen
        .getByRole('button', { name: 'Rounded rectangle: Unlabelled' })
        .querySelector('rect[width="200"][height="200"]'),
    ).not.toBeNull();
  });

  it('still places the default size when the press never travels', async () => {
    // Click-to-place is how every shape was made before drag-to-size, and it has
    // to keep working for anyone who does not think to drag.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await armShapeTool(user);

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 98, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 98, clientX: 200, clientY: 200 });

    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    expect(node.querySelector('rect[width="120"][height="56"]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    // A default-sized shape carries no stored size at all, exactly as before.
    expect(artifact.nodes[0]).not.toHaveProperty('width');
  });

  it('does not offer a rotate grip on a table', async () => {
    // A turned table's cells would stop lining up with the rows and columns
    // people read them by, so tables get the frame without the grip.
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Table', '3 by 3 table');

    // A press on a cell outside cell mode picks the whole table up.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Cell row 1 column 1' }), {
      button: 0,
      pointerId: 95,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerUp(canvas, { pointerId: 95, clientX: 60, clientY: 60 });

    expect(screen.getByTestId('selection-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('rotate-zone-nw')).not.toBeInTheDocument();
  });

  it('proposes the resized geometry through the real contract', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    fireEvent.pointerDown(screen.getByTestId('resize-handle-se'), {
      button: 0,
      pointerId: 72,
      clientX: 144,
      clientY: 80,
    });
    fireEvent.pointerMove(canvas, { pointerId: 72, clientX: 224, clientY: 128 });
    fireEvent.pointerUp(canvas, { pointerId: 72, clientX: 224, clientY: 128 });
    const outlineWidth = () => {
      const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
      return node.querySelector('rect[rx="8"]')?.getAttribute('width');
    };
    expect(outlineWidth()).toBe('200');

    // Undo is the way back: the numeric size fields went with the sidebar.
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(outlineWidth()).toBe('120');
  });

  it('blocks a proposal while a resize is still in flight', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

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

  it('actually makes a shape transparent, and survives the real contract', async () => {
    // The old clear button deleted the key, and an absent fill means "never
    // styled" — which resolves to the shape's legacy grey. So "No fill" painted
    // a box grey and read as broken. Transparent is now a colour you pick.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    await openMore(user);
    await openBarPanel(user, 'Fill');
    await user.click(screen.getByRole('button', { name: 'transparent fill' }));

    const rect = nodeRect('Rounded rectangle: Unlabelled');
    expect(rect).toHaveAttribute('fill', 'transparent');
    // Still paintable, so it still catches a press: `none` would make the shape
    // unselectable everywhere except its border.
    expect(rect).not.toHaveAttribute('fill', 'none');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]!.fillColor).toBe('transparent');
  });

  it('leaves an unstyled shape on its legacy fill rather than making it clear', async () => {
    // The other half of the same rule: absent still means "never styled", so
    // every diagram authored before transparent existed renders as it always did.
    const send = propose();
    render(<Harness propose={send} />);
    const { user } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    expect(nodeRect('Rounded rectangle: Unlabelled')).toHaveAttribute('fill', '#EEF2F4');
  });

  it('styles the whole selection at once and proposes the palette keys', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    await openMore(user);
    await openBarPanel(user, 'Fill');
    await user.click(screen.getByRole('button', { name: 'blue fill' }));
    await openBarPanel(user, 'Line colour');
    await user.click(screen.getByRole('button', { name: 'rose line' }));

    expect(nodeRect('Rounded rectangle: Unlabelled')).toHaveAttribute(
      'fill',
      DIAGRAM_FILL_COLORS.blue,
    );
    expect(nodeRect('Dotted rectangle: Unlabelled')).toHaveAttribute(
      'fill',
      DIAGRAM_FILL_COLORS.blue,
    );
    expect(nodeRect('Rounded rectangle: Unlabelled')).toHaveAttribute(
      'stroke',
      DIAGRAM_STROKE_COLORS.rose,
    );

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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await openMore(user);
    await openBarPanel(user, 'Fill');
    await openBarPanel(user, 'Fill');
    await user.click(screen.getByRole('button', { name: 'green fill' }));
    await openMore(user);
    await openBarPanel(user, 'Fill');
    expect(screen.getByRole('button', { name: 'green fill' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The second node is unstyled, so the shared value disappears.
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

    await openMore(user);
    await openBarPanel(user, 'Fill');
    expect(screen.getByRole('button', { name: 'green fill' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
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

    // An inherited edge is still selectable and still restyled — through the
    // bar's own line controls now that its private panel has gone.
    await user.click(screen.getByRole('button', { name: 'Line width' }));
    await user.click(screen.getByRole('button', { name: 'Thick width' }));
    // Choosing one closes the menu, so the line type needs it opened again.
    await user.click(screen.getByRole('button', { name: 'Line width' }));
    await user.click(screen.getByRole('button', { name: 'Dotted style' }));

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

    const legacy = nodeRect('Rounded rectangle: Client');
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

    const styled = nodeRect('Rounded rectangle: Server');
    expect(styled).toHaveAttribute('width', '200');
    expect(styled).toHaveAttribute('fill', DIAGRAM_FILL_COLORS.violet);
    expect(styled).toHaveAttribute('stroke-width', '3');

    // An extension has to differ from its original before it can be proposed.
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));
    const inlineInput = screen.getByLabelText('Edit box label');
    await user.clear(inlineInput);
    await user.type(inlineInput, 'Payment reconciliation{Enter}');

    const label = screen
      .getByRole('button', { name: 'Rounded rectangle: Payment reconciliation' })
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
    await clickInRailMenu(opened.user, 'Shapes', 'Add dotted rectangle');
    await clickInRailMenu(opened.user, 'Shapes', 'Add rounded rectangle');
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
    const { user, canvas } = await openDiagram();

    for (const shape of DIAGRAM_NODE_SHAPE_KEYS) {
      // Text has its own tool — a ghost placed by pressing the canvas — so it
      // is not repeated in the shape palette.
      if (shape === 'text') {
        await placeText(user, canvas, 61, [500, 400], 'Note');
        continue;
      }
      await clickInRailMenu(user, 'Shapes', `Add ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`);
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
    await clickInRailMenu(user, 'Shapes', 'Add ellipse');
    await clickInRailMenu(user, 'Shapes', 'Add decision');
    await clickInRailMenu(user, 'Shapes', 'Add triangle');
    await clickInRailMenu(user, 'Shapes', 'Add database');

    expect(
      screen.getByRole('button', { name: 'Ellipse: Unlabelled' }).querySelector('ellipse'),
    ).not.toBeNull();
    // 128x88 diamond: apex, right vertex, base, left vertex.
    expect(
      screen
        .getByRole('button', { name: 'Decision: Unlabelled' })
        .querySelector('path[d="M64,0 L128,44 L64,88 L0,44 Z"]'),
    ).not.toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Triangle: Unlabelled' })
        .querySelector('path[d="M52,0 L104,88 L0,88 Z"]'),
    ).not.toBeNull();
    // The cylinder needs a second path for the front edge of its top rim.
    expect(
      screen.getByRole('button', { name: 'Database: Unlabelled' }).querySelectorAll('path'),
    ).toHaveLength(2);
  });

  it('groups a node dropped into a container and shows the target while dragging', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

    fireEvent.pointerDown(box, { button: 0, pointerId: 80, clientX: 320, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 80, clientX: 68, clientY: 56 });
    expect(screen.getByTestId('container-drop-target')).toBeInTheDocument();
    fireEvent.pointerUp(canvas, { pointerId: 80, clientX: 68, clientY: 56 });

    expect(screen.queryByTestId('container-drop-target')).not.toBeInTheDocument();
  });

  it('ungroups a node dragged back out of its container', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });

    dragNode(box, canvas, { pointerId: 81, from: [320, 30], to: [68, 56] });

    dragNode(box, canvas, { pointerId: 82, from: [100, 60], to: [700, 460] });

    expect(screen.queryByText('Inside a container')).not.toBeInTheDocument();
  });

  it('proposes the grouping it was given', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
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
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    dragNode(box, canvas, { pointerId: 84, from: [320, 30], to: [68, 56] });
    const groupedAt = box.getAttribute('transform');

    const container = screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' });
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
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    // Containers land at (24, 24) and (312, 24).
    const [outer, inner] = screen.getAllByRole('button', { name: 'Dotted rectangle: Unlabelled' });

    // Nest the second container inside the first...
    dragNode(inner!, canvas, { pointerId: 86, from: [320, 30], to: [38, 36] });

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
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    dragNode(box, canvas, { pointerId: 88, from: [320, 30], to: [68, 56] });

    const drawn = [...canvas.querySelectorAll('g[role="button"]')].map((node) =>
      node.getAttribute('aria-label'),
    );
    expect(drawn.indexOf('Dotted rectangle: Unlabelled')).toBeLessThan(
      drawn.indexOf('Rounded rectangle: Unlabelled'),
    );
  });

  it('groups a palette shape dropped straight into a container', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');

    dropOnCanvas(canvas, {
      clientX: 100,
      clientY: 80,
      types: [DIAGRAM_SHAPE_MEDIA_TYPE],
      data: 'box',
    });
  });

  it('pulls contents back inside when the container is made smaller', async () => {
    render(<Harness propose={propose()} />);
    const { canvas } = await containerAndBox();
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    dragNode(box, canvas, { pointerId: 89, from: [320, 30], to: [68, 56] });

    // Select the container, then drag its bottom-right handle inwards.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' }), {
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
      const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
      dragNode(box, opened.canvas, { pointerId: 92, from: [320, 30], to: [68, 56] });

      fireEvent.pointerDown(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' }), {
        button: 0,
        pointerId: 93,
        clientX: 30,
        clientY: 30,
      });
      fireEvent.pointerUp(opened.canvas, { pointerId: 93, clientX: 30, clientY: 30 });
      await openMore(opened.user);
      await opened.user.click(screen.getByRole('button', { name: 'Delete selection' }));
      return opened;
    }

    it('asks before destroying a container that holds something', async () => {
      render(<Harness propose={propose()} />);
      await groupedThenDelete();

      expect(screen.getByRole('alert')).toHaveTextContent('This container holds 1 element');
      // Nothing is removed until the question is answered.
      expect(screen.getAllByRole('button', { name: /rectangle:/ })).toHaveLength(2);
    });

    it('keeps the contents and lifts them out when asked to', async () => {
      render(<Harness propose={propose()} />);
      await groupedThenDelete();

      await userEvent.setup().click(screen.getByRole('button', { name: /Keep contents/ }));

      expect(
        screen.queryByRole('button', { name: 'Dotted rectangle: Unlabelled' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /rectangle:/ })).toHaveLength(1);
    });

    it('removes the whole group when asked to, in one undo step', async () => {
      render(<Harness propose={propose()} />);
      const { user } = await groupedThenDelete();

      await user.click(screen.getByRole('button', { name: /Delete contents/ }));
      expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
      expect(screen.getAllByRole('button', { name: /rectangle:/ })).toHaveLength(2);
      expect(
        screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
      ).toBeInTheDocument();
    });

    it('backs out of the question on Cancel without touching the diagram', async () => {
      render(<Harness propose={propose()} />);
      const { user } = await groupedThenDelete();

      await user.click(screen.getByRole('button', { name: 'Cancel deleting the container' }));

      expect(screen.getAllByRole('button', { name: /rectangle:/ })).toHaveLength(2);
    });

    it('deletes an empty container without asking', async () => {
      render(<Harness propose={propose()} />);
      const { user } = await openDiagram();
      await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');

      await openMore(user);
      await user.click(screen.getByRole('button', { name: 'Delete selection' }));

      expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
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
      z: 0,
      editedAt: null,
      extendsProposalId: null,
      extendsFrom: null,
      reactions: [],
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

    await arrangeDiagram(user);

    // Top to bottom is the default flow.
    expect(positionOf('Rounded rectangle: Client').y).toBeLessThan(
      positionOf('Rounded rectangle: Api').y,
    );
    expect(positionOf('Rounded rectangle: Api').y).toBeLessThan(
      positionOf('Rounded rectangle: Store').y,
    );
    // A single chain lines up on one column.
    expect(positionOf('Rounded rectangle: Client').x).toBe(positionOf('Rounded rectangle: Api').x);
  });

  it('switches the flow axis when left to right is chosen', async () => {
    const { user } = await openFixture([
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
    ]);

    await openArrangeMenu(user);
    await user.click(screen.getByRole('button', { name: 'Arrange left to right' }));
    await arrangeDiagram(user);

    expect(positionOf('Rounded rectangle: Client').x).toBeLessThan(
      positionOf('Rounded rectangle: Api').x,
    );
    expect(positionOf('Rounded rectangle: Api').x).toBeLessThan(
      positionOf('Rounded rectangle: Store').x,
    );
    expect(positionOf('Rounded rectangle: Client').y).toBe(positionOf('Rounded rectangle: Api').y);
  });

  it('marks the chosen flow direction as pressed', async () => {
    const { user } = await openFixture([{ from: 'n1', to: 'n2' }]);

    await openArrangeMenu(user);
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
    const before = positionOf('Rounded rectangle: Client');

    await arrangeDiagram(user);
    expect(positionOf('Rounded rectangle: Client')).not.toEqual(before);

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));

    expect(positionOf('Rounded rectangle: Client')).toEqual(before);
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

    await arrangeDiagram(user);
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

describe('studio canvas', () => {
  function drawStroke(
    canvas: Element,
    pointerId: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: from.x, clientY: from.y });
    fireEvent.pointerMove(canvas, { pointerId, clientX: (from.x + to.x) / 2, clientY: to.y });
    fireEvent.pointerMove(canvas, { pointerId, clientX: to.x, clientY: to.y });
    fireEvent.pointerUp(canvas, { pointerId, clientX: to.x, clientY: to.y });
  }

  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  it('draws freehand on the same canvas as the shapes and proposes both together', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStroke(canvas, 90, { x: 300, y: 200 }, { x: 400, y: 260 });

    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    // One artifact carrying both, which is the whole point of the studio.
    expect(artifact.nodes).toHaveLength(1);
    expect(artifact.ink).toHaveLength(1);
    // Whatever is proposed has to satisfy the real write contract.
    expect(proposalCreateSchema.safeParse(propose.mock.calls[0]![0]).success).toBe(true);
  });

  it('proposes a sketch that has no shapes at all', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStroke(canvas, 91, { x: 200, y: 200 }, { x: 320, y: 300 });
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    await proposedAndClosed();
    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.nodes).toHaveLength(0);
    expect(artifact.ink).toHaveLength(1);
  });

  it('undoes a stroke without disturbing the shapes', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStroke(canvas, 92, { x: 300, y: 200 }, { x: 400, y: 260 });
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryAllByTestId('ink-stroke')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Redo diagram change' }));
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);
  });

  it('takes out every stroke an eraser sweep touches in one undo step', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStroke(canvas, 93, { x: 200, y: 200 }, { x: 260, y: 200 });
    drawStroke(canvas, 94, { x: 500, y: 400 }, { x: 560, y: 400 });
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(2);

    await clickInRailMenu(user, 'Freehand', 'Erase');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 95, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 95, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(canvas, { pointerId: 95, clientX: 500, clientY: 400 });

    expect(screen.queryAllByTestId('ink-stroke')).toHaveLength(0);

    // The whole sweep is one intention, however many strokes it removed.
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(2);
  });

  it('keeps the ink when a node is dragged', async () => {
    // Every pre-v4 edit describes itself purely in nodes and edges. If one of
    // them replaced the snapshot rather than merging into it, a single drag
    // would silently delete the sketch.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStroke(canvas, 96, { x: 300, y: 200 }, { x: 400, y: 260 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    fireEvent.pointerDown(node, { button: 0, pointerId: 97, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(canvas, { pointerId: 97, clientX: 206, clientY: 134 });
    fireEvent.pointerUp(canvas, { pointerId: 97, clientX: 206, clientY: 134 });

    expect(node).toHaveAttribute('transform', 'translate(200, 128)');
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);
  });

  it('sends a shape behind the ink and proposes the order it was given', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStroke(canvas, 98, { x: 300, y: 200 }, { x: 400, y: 260 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }), {
      button: 0,
      pointerId: 100,
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerUp(canvas, { pointerId: 100, clientX: 30, clientY: 30 });
    await user.click(screen.getByRole('button', { name: 'Send selection to back' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    const order = artifact.z!;
    // The node is named before the stroke, so it paints underneath it.
    expect(order.indexOf(artifact.nodes[0]!.id)).toBeLessThan(order.indexOf(artifact.ink![0]!.id));
  });

  it('commits a stroke whose pointer capture was lost mid-gesture', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 99, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 99, clientX: 300, clientY: 260 });
    fireEvent.lostPointerCapture(canvas, { pointerId: 99 });

    // pointerup never arrives, and the stroke must not be lost with it.
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);
  });

  it('undoes a template with Ctrl+Z without needing the canvas clicked first', async () => {
    // Applying a template moves focus onto the canvas deliberately. Without
    // that, focus is left on a button inside the rail's popover — outside the
    // form — and the form's Ctrl+Z handler never sees the keystroke.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Templates', 'Retro');
    expect(screen.getByRole('button', { name: 'Dotted rectangle: Went well' })).toBeInTheDocument();
    expect(canvas).toHaveFocus();

    await user.keyboard('{Control>}z{/Control}');

    expect(screen.queryByRole('button', { name: 'Dotted rectangle: Went well' })).toBeNull();
  });

  it('adds a starter frame to the canvas rather than replacing what is there', async () => {
    // The frames used to be offered only on an empty canvas, which made
    // replacing the board safe. They now sit on the rail, always reachable, so
    // applying one has to be additive — otherwise a stray click wipes the work.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Templates', 'Timeline');

    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rounded rectangle: Now' })).toBeInTheDocument();
  });

  it('carries ink and paint order into an extended studio canvas', async () => {
    // Prefilling only the shapes would silently drop half of a studio artifact,
    // and the author of the extension would never see what went missing.
    const user = userEvent.setup();
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    const parent: BoardItem = {
      id: 'parent-studio',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        nodes: [{ id: 'n1', label: 'Idea', x: 24, y: 24 }],
        edges: [],
        ink: [{ id: 'ink-1', points: [40, 40, 120, 90], strokeColor: 'ink' }],
        z: ['ink-1', 'n1'],
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

    render(
      <Harness propose={propose}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    // The inherited stroke is on the canvas, not just in the payload.
    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);

    // An extension has to differ from its original before it can be proposed.
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.ink).toHaveLength(1);
    expect(artifact.ink![0]!.strokeColor).toBe('ink');
    // The order the parent was arranged in survives the copy.
    expect(artifact.z!.indexOf('ink-1')).toBeLessThan(artifact.z!.indexOf('n1'));
  });
});

describe('studio pen and line', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  function clickAt(canvas: Element, pointerId: number, x: number, y: number, shiftKey = false) {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: x, clientY: y, shiftKey });
    fireEvent.pointerUp(canvas, { pointerId, clientX: x, clientY: y, shiftKey });
  }

  it('places anchors with the pen and proposes the path on Enter', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 200, 100, 100);
    clickAt(canvas, 201, 300, 100);
    clickAt(canvas, 202, 300, 300);

    // The draft is on the canvas before it is committed.
    expect(screen.getByTestId('path-draft')).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('path-draft')).toBeNull();
    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.paths).toHaveLength(1);
    expect(artifact.paths![0]!.anchors).toHaveLength(3);
    expect(artifact.paths![0]!.closed).toBeUndefined();
    expect(proposalCreateSchema.safeParse(propose.mock.calls[0]![0]).success).toBe(true);
  });

  it('finishes the path on Escape without closing the editor', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 210, 100, 100);
    clickAt(canvas, 211, 260, 180);
    await user.keyboard('{Escape}');

    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);
    // Escape ended the path, not the studio.
    expect(canvas).toBeInTheDocument();
  });

  it('takes back the last point with Backspace while the pen is mid-path', async () => {
    // The committed-path editor binds Backspace to removing an anchor, but a
    // draft is not a path yet and had no step back at all: a mis-placed point
    // could only be fixed by finishing the path and starting over.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 820, 100, 100);
    clickAt(canvas, 821, 300, 100);
    clickAt(canvas, 822, 300, 300);

    // The third point goes back, then the path is finished with the two left.
    await user.keyboard('{Backspace}');
    await user.keyboard('{Enter}');

    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.paths![0]!.anchors).toHaveLength(2);
  });

  it('puts the pen down entirely when every point is taken back', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 830, 100, 100);
    expect(screen.getByTestId('path-draft')).toBeInTheDocument();

    await user.keyboard('{Backspace}');
    // Nothing is left to rubber-band from, so the draft goes rather than
    // trailing from a point that has just been removed.
    expect(screen.queryByTestId('path-draft')).toBeNull();
    expect(screen.queryAllByTestId('studio-path')).toHaveLength(0);
  });

  it('hands the canvas back in Select when Escape ends a line', async () => {
    // A finished line leaves the tool armed, because lines are drawn several in
    // a row. Escape means "I am done", so it is the one finish that does not.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 840, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 840, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 840, clientX: 300, clientY: 200 });

    // A second line, left mid-draft, is what Escape then ends.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 841, clientX: 100, clientY: 400 });
    fireEvent.pointerMove(canvas, { pointerId: 841, clientX: 300, clientY: 400 });
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: /^Select$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('closes the path when the pen returns to its first anchor', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 220, 100, 100);
    clickAt(canvas, 221, 300, 100);
    clickAt(canvas, 222, 300, 300);
    clickAt(canvas, 223, 100, 100);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.paths![0]!.closed).toBe(true);
    expect(artifact.paths![0]!.anchors).toHaveLength(3);
  });

  it('draws one straight line per drag with the line tool', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 230, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 230, clientX: 400, clientY: 260 });
    fireEvent.pointerUp(canvas, { pointerId: 230, clientX: 400, clientY: 260 });

    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.paths![0]!.anchors).toHaveLength(2);
  });

  it('holds a line to true horizontal while shift is down', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 240, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 240, clientX: 400, clientY: 216, shiftKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 240, clientX: 400, clientY: 216, shiftKey: true });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const [start, end] = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!.anchors;
    // The 16px of vertical drift is snapped away entirely.
    expect(end!.y).toBe(start!.y);
    expect(end!.x).toBeGreaterThan(start!.x);
  });

  it('curves an anchor when the pen is dragged rather than clicked', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 250, 100, 200);
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 251, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 251, clientX: 340, clientY: 140 });
    fireEvent.pointerUp(canvas, { pointerId: 251, clientX: 340, clientY: 140 });
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const anchors = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!.anchors;
    const dragged = anchors.at(-1)!;
    expect(dragged.out).toBeDefined();
    // Smooth, so the incoming handle mirrors the outgoing one.
    expect(dragged.in).toEqual({ x: -dragged.out!.x, y: -dragged.out!.y });
  });

  it('refuses to propose over a path still being drawn', async () => {
    // Uncommitted work must never be dropped silently by a submit.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 260, 100, 100);
    clickAt(canvas, 261, 260, 180);
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Finish the path with Enter or Esc before proposing.',
    );
  });

  it('undoes a finished path in one step, leaving the shapes alone', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 270, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 270, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(canvas, { pointerId: 270, clientX: 500, clientY: 400 });
    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryAllByTestId('studio-path')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
  });
});

describe('studio path editing', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  /** Draw one line, then come back to the select tool with it selected. */
  async function drawAndSelectLine(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    pointerId: number,
  ) {
    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId, clientX: 400, clientY: 200 });
    await user.click(screen.getByRole('button', { name: 'Select' }));
    const outline = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(outline, {
      button: 0,
      pointerId: pointerId + 1,
      clientX: 250,
      clientY: 200,
    });
    fireEvent.pointerUp(canvas, { pointerId: pointerId + 1, clientX: 250, clientY: 200 });
    // A click selects the line whole; going inside it to reach the points is a
    // second, deliberate gesture.
    doublePress(outline, canvas, pointerId + 2, 250, 200);
  }

  it('selects a path and shows a handle for every point on it', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 300);

    expect(screen.getByRole('button', { name: 'Point 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Point 2 of 2' })).toBeInTheDocument();
  });

  it('moves a point and proposes it where it was dropped', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 310);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Point 2 of 2' }), {
      button: 0,
      pointerId: 315,
      clientX: 400,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 315, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(canvas, { pointerId: 315, clientX: 500, clientY: 400 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const anchors = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!.anchors;
    expect(anchors[1]!.y).toBeGreaterThan(anchors[0]!.y);
  });

  it('undoes a point move in one step', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 320);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Point 2 of 2' }), {
      button: 0,
      pointerId: 325,
      clientX: 400,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 325, clientX: 500, clientY: 400 });
    fireEvent.pointerUp(canvas, { pointerId: 325, clientX: 500, clientY: 400 });

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    // The whole drag is one intention, and the line survives it.
    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);
  });

  it('turns a corner into a curve and back with a double-click', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 330);
    doublePress(screen.getByRole('button', { name: 'Point 1 of 2' }), canvas, 335, 100, 200);
    expect(screen.getByRole('button', { name: 'Curve handle out of point 1' })).toBeInTheDocument();

    doublePress(screen.getByRole('button', { name: 'Point 1 of 2' }), canvas, 337, 100, 200);
    expect(screen.queryByRole('button', { name: 'Curve handle out of point 1' })).toBeNull();
  });

  it('drags a curve handle and mirrors it through the point', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 340);
    doublePress(screen.getByRole('button', { name: 'Point 1 of 2' }), canvas, 342, 100, 200);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Curve handle out of point 1' }), {
      button: 0,
      pointerId: 345,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 345, clientX: 220, clientY: 120 });
    fireEvent.pointerUp(canvas, { pointerId: 345, clientX: 220, clientY: 120 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const anchor = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!.anchors[0]!;
    expect(anchor.out).toBeDefined();
    expect(anchor.in).toEqual({ x: -anchor.out!.x, y: -anchor.out!.y });
  });

  it('breaks the tangent when the handle is dragged with Alt held', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 350);
    doublePress(screen.getByRole('button', { name: 'Point 1 of 2' }), canvas, 342, 100, 200);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Curve handle out of point 1' }), {
      button: 0,
      pointerId: 355,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 355, clientX: 220, clientY: 120, altKey: true });
    fireEvent.pointerUp(canvas, { pointerId: 355, clientX: 220, clientY: 120, altKey: true });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const anchor = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!.anchors[0]!;
    // A cusp: the two sides no longer mirror each other.
    expect(anchor.in).not.toEqual({ x: -anchor.out!.x, y: -anchor.out!.y });
  });

  it('deletes a whole line that is too short to lose a point', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawAndSelectLine(user, canvas, 360);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Point 1 of 2' }), {
      button: 0,
      pointerId: 365,
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerUp(canvas, { pointerId: 365, clientX: 100, clientY: 200 });
    await user.keyboard('{Delete}');

    expect(screen.queryAllByTestId('studio-path')).toHaveLength(0);
  });
});

describe('studio tables', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  /** Pick a size, drop a table on the canvas, and land back on the select tool. */
  /**
   * Choosing a size in the picker places the table at once — unselected, so the
   * first thing you can do is move it. Working *in* it takes a double press,
   * which most of these tests want, so the helper does it.
   */
  async function placeTable(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    pointerId: number,
    size = '3 by 3 table',
  ) {
    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: size }));
    // Picking a size picks the table up; the press puts it down.
    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: pointerId + 500,
      clientX: 480,
      clientY: 300,
    });
    fireEvent.pointerUp(canvas, {
      button: 0,
      pointerId: pointerId + 500,
      clientX: 480,
      clientY: 300,
    });
    doublePress(
      screen.getByRole('button', { name: 'Cell row 1 column 1' }),
      canvas,
      pointerId,
      400,
      290,
    );
  }

  it('offers its row and column controls without being opened first', async () => {
    // They live on the table, so they are there from the moment it is: no
    // selecting it, no going inside it, no menu that could come up empty.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '3 by 3 table' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 920, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 920, clientX: 480, clientY: 300 });

    expect(screen.getByRole('button', { name: 'Add a row' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a column' })).toBeInTheDocument();
  });

  it('places a table of the chosen size and proposes its grid', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 400, '2 by 4 table');
    expect(screen.getByRole('button', { name: 'Cell row 1 column 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.rowHeights).toHaveLength(2);
    expect(table.colWidths).toHaveLength(4);
    expect(table.cells).toHaveLength(8);
    expect(proposalCreateSchema.safeParse(propose.mock.calls[0]![0]).success).toBe(true);
  });

  it('proposes a canvas holding nothing but a table', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 405);
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    await proposedAndClosed();
    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.nodes).toHaveLength(0);
    expect(artifact.tables).toHaveLength(1);
  });

  it('types into the selected cell and moves on with Tab', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 410);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await user.keyboard('Q');
    // Typing opens the cell for editing with that character already in it.
    const input = screen.getByRole('textbox', { name: 'Cell row 1 column 1' });
    await user.clear(input);
    await user.type(input, 'Question{Tab}');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.cells[0]!.text).toBe('Question');
  });

  it('opens a cell for editing on Enter and commits it on Enter again', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 415);
    await user.click(screen.getByRole('button', { name: 'Cell row 2 column 2' }));
    await user.keyboard('{Enter}');

    const input = screen.getByRole('textbox', { name: 'Cell row 2 column 2' });
    await user.type(input, 'Middle{Enter}');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    // Row 2, column 2 of a 3x3 grid is index 4.
    expect(table.cells[4]!.text).toBe('Middle');
  });

  it('keeps the first character when a cell is filled by typing', async () => {
    // Typing put the character in the box and then selected it, so the next
    // keystroke overwrote it: "Time" arrived as "ime".
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 960, '2 by 2 table');
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await user.keyboard('Time');

    expect(screen.getByRole('textbox', { name: 'Cell row 1 column 1' })).toHaveValue('Time');
  });

  it('still replaces the contents when a cell is opened with Enter', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 965, '2 by 2 table');
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await user.keyboard('Old');
    await user.keyboard('{Enter}');

    // Enter commits and moves down. Steer back with the keyboard rather than a
    // click, which would pair with the earlier press as a double press.
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Enter}');
    await user.keyboard('New');

    // Opening to edit selects what is there, so typing replaces it.
    expect(screen.getByRole('textbox', { name: 'Cell row 1 column 1' })).toHaveValue('New');
  });

  it('abandons an edit on Escape and keeps what was there', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 420);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await user.keyboard('{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'Cell row 1 column 1' }), 'draft{Escape}');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.cells[0]!.text).toBeUndefined();
  });

  it('adds and removes rows on the table itself', async () => {
    // Rows are added where the pointer says, not from a menu: hovering a
    // boundary offers the "+" that belongs to it, and the body of a row offers
    // the "−" that takes that row away.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 425);

    await user.hover(screen.getByLabelText('Add a row'));
    await user.click(screen.getByRole('button', { name: 'Add a row' }));
    expect(screen.getByRole('button', { name: 'Cell row 4 column 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete row 1' }));
    expect(screen.queryByRole('button', { name: 'Cell row 4 column 1' })).toBeNull();
  });

  it('inserts a row where the pointer is rather than at the end', async () => {
    // The whole point of moving this onto the table: a menu could only ever act
    // on the last row, or on whichever cell happened to be selected.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 427);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await user.keyboard('top');
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: 'Insert a row above row 1' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.rowHeights).toHaveLength(4);
    // The new row landed above the typed one, which moved down a row.
    expect(table.cells[0]?.text).toBeUndefined();
    expect(table.cells[3]?.text).toBe('top');
  });

  it('keeps the last row, since a table without one is not a table', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 428, '1 by 1 table');
    expect(screen.queryByLabelText('Delete row 1')).toBeNull();
  });

  it('adds a column and keeps every row the same length', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 430);
    await user.hover(screen.getByLabelText('Add a column'));
    await user.click(screen.getByRole('button', { name: 'Add a column' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.colWidths).toHaveLength(4);
    expect(table.cells).toHaveLength(table.rowHeights.length * table.colWidths.length);
  });

  it('fills a shift-selected block of cells in one go', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 435);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Cell row 2 column 2' }), {
      button: 0,
      pointerId: 436,
      shiftKey: true,
    });
    await openMore(user);
    await openBarPanel(user, 'Cell fill');
    await user.click(screen.getByRole('button', { name: 'blue cell fill' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    // A 2x2 block of a 3-wide grid: indices 0, 1, 3, 4.
    expect(table.cells[0]!.fill).toBe('blue');
    expect(table.cells[4]!.fill).toBe('blue');
    expect(table.cells[2]!.fill).toBeUndefined();
  });

  it('resizes a column by dragging its boundary, in one undo step', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 440);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));

    // A 3x3 table of 96-wide columns lands centred on the 960x600 sheet, so it
    // starts at x=336 and the first column's boundary sits at x=432.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Resize column 1' }), {
      button: 0,
      pointerId: 445,
      clientX: 432,
      clientY: 300,
    });
    fireEvent.pointerMove(canvas, { pointerId: 445, clientX: 520, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 445, clientX: 520, clientY: 300 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.colWidths[0]).toBeGreaterThan(96);
    expect(table.colWidths[1]).toBe(96);
  });

  it('undoes a whole table in one step', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await placeTable(user, canvas, 450);
    expect(screen.getByRole('button', { name: 'Cell row 1 column 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryByRole('button', { name: 'Cell row 1 column 1' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
  });
});

describe('studio element moving', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  it('drags a whole line by its body without reshaping it', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 500, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 500, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 500, clientX: 300, clientY: 200 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const outline = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(outline, { button: 0, pointerId: 505, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 505, clientX: 260, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 505, clientX: 260, clientY: 300 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const anchors = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!.anchors;
    // Both ends moved by the same amount: the shape is rigid, not stretched.
    expect(anchors[1]!.x - anchors[0]!.x).toBe(200);
    expect(anchors[0]!.y).toBe(anchors[1]!.y);
  });

  it('keeps a single click on a line as a selection, not an edit', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 510, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 510, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 510, clientX: 300, clientY: 200 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const outline = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(outline, { button: 0, pointerId: 515, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 515, clientX: 200, clientY: 200 });

    // Selected whole: no points on show until the line is entered.
    expect(screen.queryByRole('button', { name: 'Point 1 of 2' })).toBeNull();
    doublePress(outline, canvas, 517, 200, 200);
    expect(screen.getByRole('button', { name: 'Point 1 of 2' })).toBeInTheDocument();
  });

  it('drags a whole table from any cell before it is entered', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7101, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7101, clientX: 480, clientY: 300 });
    // Click away so the freshly-placed table is no longer in cell mode.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 520, clientX: 40, clientY: 40 });
    fireEvent.pointerUp(canvas, { pointerId: 520, clientX: 40, clientY: 40 });

    const cell = screen.getByRole('button', { name: 'Cell row 1 column 1' });
    fireEvent.pointerDown(cell, { button: 0, pointerId: 525, clientX: 400, clientY: 290 });
    fireEvent.pointerMove(canvas, { pointerId: 525, clientX: 440, clientY: 340 });
    fireEvent.pointerUp(canvas, { pointerId: 525, clientX: 440, clientY: 340 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    // The grid is intact and nothing was typed into it — it only moved.
    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.cells).toHaveLength(4);
    expect(table.cells.every((entry) => entry.text === undefined)).toBe(true);
  });

  it('places a table where the press that follows the size lands', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 3 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7102, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7102, clientX: 480, clientY: 300 });

    expect(screen.getByRole('button', { name: 'Cell row 2 column 3' })).toBeInTheDocument();
    // It lands unselected, so nothing is offered for it until it is entered.
    expect(screen.queryByRole('toolbar', { name: 'Selection properties' })).toBeNull();
  });
});

describe('studio pen feedback and styling', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  function clickAt(canvas: Element, pointerId: number, x: number, y: number) {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas, { pointerId, clientX: x, clientY: y });
  }

  it('marks the first point once the pen is close enough to close the shape', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 530, 100, 100);
    clickAt(canvas, 531, 300, 100);
    clickAt(canvas, 532, 300, 300);

    // Hovering elsewhere says nothing.
    fireEvent.pointerMove(canvas, { pointerId: 533, clientX: 200, clientY: 200 });
    expect(screen.queryByTestId('path-close-target')).toBeNull();

    fireEvent.pointerMove(canvas, { pointerId: 533, clientX: 102, clientY: 102 });
    expect(screen.getByTestId('path-close-target')).toBeInTheDocument();
  });

  it('draws with the line colour and thickness the pen was set to', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    await user.click(screen.getByRole('button', { name: 'rose line' }));
    await user.click(screen.getByRole('button', { name: 'Thick line' }));
    clickAt(canvas, 540, 100, 100);
    clickAt(canvas, 541, 300, 200);
    await user.keyboard('{Enter}');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const path = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!;
    expect(path.strokeColor).toBe('rose');
    expect(path.strokeWidthPreset).toBe('thick');
  });

  it('fills a shape the pen closed', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    await user.click(screen.getByRole('button', { name: 'green line' }));
    await user.click(screen.getByRole('button', { name: 'Fill the shape' }));
    clickAt(canvas, 550, 100, 100);
    clickAt(canvas, 551, 300, 100);
    clickAt(canvas, 552, 300, 300);
    clickAt(canvas, 553, 100, 100);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const path = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!;
    expect(path.closed).toBe(true);
    expect(path.fillColor).toBe('green');
  });

  it('restyles a line that is already on the canvas', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 560, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 560, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 560, clientX: 300, clientY: 200 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const outline = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(outline, { button: 0, pointerId: 565, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 565, clientX: 200, clientY: 200 });
    await openBarPanel(user, 'Line colour');
    await user.click(screen.getByRole('button', { name: 'amber line' }));
    await openBarPanel(user, 'Line width');
    await user.click(screen.getByRole('button', { name: 'Dashed style' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const path = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!;
    expect(path.strokeColor).toBe('amber');
    expect(path.strokeStyle).toBe('dashed');
  });

  it('turns a point into a curve from the inspector', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 570, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 570, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 570, clientX: 300, clientY: 200 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const outline = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(outline, { button: 0, pointerId: 575, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 575, clientX: 200, clientY: 200 });
    doublePress(outline, canvas, 577, 200, 200);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Point 1 of 2' }), {
      button: 0,
      pointerId: 576,
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerUp(canvas, { pointerId: 576, clientX: 100, clientY: 200 });

    await user.click(screen.getByRole('button', { name: 'Make curve' }));
    expect(screen.getByRole('button', { name: 'Curve handle out of point 1' })).toBeInTheDocument();
    // And back again, from the same control.
    await user.click(screen.getByRole('button', { name: 'Make corner' }));
    expect(screen.queryByRole('button', { name: 'Curve handle out of point 1' })).toBeNull();
  });
});

describe('studio table cell text', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  it('styles the selected cells with a size, a weight and a colour', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7103, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7103, clientX: 480, clientY: 300 });
    doublePress(screen.getByRole('button', { name: 'Cell row 1 column 1' }), canvas, 770, 400, 290);

    await openBarPanel(user, 'Format text');
    await user.click(screen.getByRole('button', { name: 'large text' }));
    await user.click(screen.getByRole('button', { name: 'Bold cell text' }));
    await user.click(screen.getByRole('button', { name: 'rose cell text' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const cell = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!.cells[0]!;
    expect(cell.fontSizePreset).toBe('large');
    expect(cell.bold).toBe(true);
    expect(cell.color).toBe('rose');
  });
});

describe('studio multi-selection', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  /** A box, a stroke, a line and a table, spread across the sheet. */
  async function drawEverything(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    base: number,
  ) {
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: base, clientX: 300, clientY: 380 });
    fireEvent.pointerMove(canvas, { pointerId: base, clientX: 360, clientY: 420 });
    fireEvent.pointerUp(canvas, { pointerId: base, clientX: 360, clientY: 420 });

    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId: base + 1, clientX: 500, clientY: 380 });
    fireEvent.pointerMove(canvas, { pointerId: base + 1, clientX: 600, clientY: 440 });
    fireEvent.pointerUp(canvas, { pointerId: base + 1, clientX: 600, clientY: 440 });

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7104, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7104, clientX: 480, clientY: 300 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    // Leave the freshly placed table's cell mode.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: base + 2, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: base + 2, clientX: 20, clientY: 20 });
  }

  it('sweeps up ink, a line and a table along with the shapes', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await drawEverything(user, canvas, 600);

    // Sweep the whole sheet, then delete everything it caught.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 610, clientX: 2, clientY: 2 });
    fireEvent.pointerMove(canvas, { pointerId: 610, clientX: 950, clientY: 590 });
    fireEvent.pointerUp(canvas, { pointerId: 610, clientX: 950, clientY: 590 });
    await user.keyboard('{Delete}');

    expect(screen.queryAllByTestId('ink-stroke')).toHaveLength(0);
    expect(screen.queryAllByTestId('studio-path')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Cell row 1 column 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rounded rectangle: Unlabelled' })).toBeNull();
  });

  it('moves a swept selection of every kind as one group', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await drawEverything(user, canvas, 620);

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 630, clientX: 2, clientY: 2 });
    fireEvent.pointerMove(canvas, { pointerId: 630, clientX: 950, clientY: 590 });
    fireEvent.pointerUp(canvas, { pointerId: 630, clientX: 950, clientY: 590 });

    // Grab the line, which is in the selection, and drag the lot.
    const outline = screen.getByRole('button', { name: 'Path with 2 points' });
    fireEvent.pointerDown(outline, { button: 0, pointerId: 635, clientX: 550, clientY: 410 });
    fireEvent.pointerMove(canvas, { pointerId: 635, clientX: 570, clientY: 440 });
    fireEvent.pointerUp(canvas, { pointerId: 635, clientX: 570, clientY: 440 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    // Everything is still there: a group move moves, it does not destroy.
    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    expect(artifact.nodes).toHaveLength(1);
    expect(artifact.ink).toHaveLength(1);
    expect(artifact.paths).toHaveLength(1);
    expect(artifact.tables).toHaveLength(1);
  });

  it('moves the whole mixed selection when it is grabbed by the shape', async () => {
    // Grabbing a shape used to start the shape-only drag, so the ink, the line
    // and the table stayed behind while the shape walked off without them.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await drawEverything(user, canvas, 660);

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 670, clientX: 2, clientY: 2 });
    fireEvent.pointerMove(canvas, { pointerId: 670, clientX: 950, clientY: 590 });
    fireEvent.pointerUp(canvas, { pointerId: 670, clientX: 950, clientY: 590 });

    const strokeBefore = screen.getByTestId('ink-stroke').getAttribute('d');
    const pathBefore = screen.getByRole('button', { name: 'Path with 2 points' }).getAttribute('d');

    const shape = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    const shapeBefore = shape.getAttribute('transform');
    fireEvent.pointerDown(shape, { button: 0, pointerId: 675, clientX: 200, clientY: 160 });
    fireEvent.pointerMove(canvas, { pointerId: 675, clientX: 264, clientY: 224 });
    fireEvent.pointerUp(canvas, { pointerId: 675, clientX: 264, clientY: 224 });

    expect(shape.getAttribute('transform')).not.toBe(shapeBefore);
    expect(screen.getByTestId('ink-stroke').getAttribute('d')).not.toBe(strokeBefore);
    expect(screen.getByRole('button', { name: 'Path with 2 points' }).getAttribute('d')).not.toBe(
      pathBefore,
    );
  });

  it('takes everything with Ctrl+A, including the studio elements', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await drawEverything(user, canvas, 640);

    await user.keyboard('{Control>}a{/Control}');
    await user.keyboard('{Delete}');

    expect(screen.queryAllByTestId('ink-stroke')).toHaveLength(0);
    expect(screen.queryAllByTestId('studio-path')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Cell row 1 column 1' })).toBeNull();
  });

  it('clears the selection on Escape', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();
    await drawEverything(user, canvas, 650);

    await user.keyboard('{Control>}a{/Control}');
    await user.keyboard('{Escape}');
    await user.keyboard('{Delete}');

    // Escape dropped the selection, so Delete had nothing to take.
    expect(screen.getAllByTestId('studio-path')).toHaveLength(1);
  });

  it('selects and moves a single stroke of ink directly', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 660, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 660, clientX: 400, clientY: 340 });
    fireEvent.pointerUp(canvas, { pointerId: 660, clientX: 400, clientY: 340 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const hit = screen.getByRole('button', { name: 'Freehand stroke' });
    fireEvent.pointerDown(hit, { button: 0, pointerId: 665, clientX: 350, clientY: 320 });
    fireEvent.pointerMove(canvas, { pointerId: 665, clientX: 380, clientY: 360 });
    fireEvent.pointerUp(canvas, { pointerId: 665, clientX: 380, clientY: 360 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    // Still one stroke, and it kept its shape while being carried.
    const ink = diagramArtifactOf(propose.mock.calls[0]![0]).ink!;
    expect(ink).toHaveLength(1);
    expect(ink[0]!.points.length).toBeGreaterThan(2);
  });

  it('deletes a single stroke without reaching for the eraser', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 670, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 670, clientX: 400, clientY: 340 });
    fireEvent.pointerUp(canvas, { pointerId: 670, clientX: 400, clientY: 340 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Freehand stroke' }), {
      button: 0,
      pointerId: 675,
      clientX: 350,
      clientY: 320,
    });
    fireEvent.pointerUp(canvas, { pointerId: 675, clientX: 350, clientY: 320 });
    await user.keyboard('{Delete}');

    expect(screen.queryAllByTestId('ink-stroke')).toHaveLength(0);
  });

  it('enters a table on a double press, not a single one', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7105, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7105, clientX: 480, clientY: 300 });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 680, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 680, clientX: 20, clientY: 20 });

    const cell = screen.getByRole('button', { name: 'Cell row 1 column 1' });
    fireEvent.pointerDown(cell, { button: 0, pointerId: 685, clientX: 400, clientY: 290 });
    fireEvent.pointerUp(canvas, { pointerId: 685, clientX: 400, clientY: 290 });
    // Selected whole. Typing is not cell input yet, because no cell is in hand
    // — which is the difference between selecting a table and working in one.
    await user.keyboard('x');
    expect(screen.queryByRole('textbox', { name: 'Cell row 1 column 1' })).toBeNull();

    doublePress(cell, canvas, 690, 400, 290);
    await user.keyboard('x');
    expect(screen.getByRole('textbox', { name: 'Cell row 1 column 1' })).toBeInTheDocument();
  });
});

describe('studio clipboard and snapping', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  async function drawLine(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    pointerId: number,
    y = 200,
  ) {
    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: 100, clientY: y });
    fireEvent.pointerMove(canvas, { pointerId, clientX: 300, clientY: y });
    fireEvent.pointerUp(canvas, { pointerId, clientX: 300, clientY: y });
    await user.click(screen.getByRole('button', { name: 'Select' }));
  }

  /** Select without dragging. Coordinates differ per caller so two presses on
   *  the same spot are never mistaken for a double press. */
  function selectPath(canvas: Element, pointerId: number, y = 200) {
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId,
      clientX: 200,
      clientY: y,
    });
    fireEvent.pointerUp(canvas, { pointerId, clientX: 200, clientY: y });
  }

  it('duplicates a selected line', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 700);
    selectPath(canvas, 705);
    await user.keyboard('{Control>}d{/Control}');

    expect(screen.getAllByTestId('studio-path')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const paths = diagramArtifactOf(propose.mock.calls[0]![0]).paths!;
    expect(paths).toHaveLength(2);
    // Two independent elements, not one referenced twice.
    expect(paths[0]!.id).not.toBe(paths[1]!.id);
    expect(paths[1]!.anchors[0]!.x).not.toBe(paths[0]!.anchors[0]!.x);
  });

  it('copies and pastes a table with its contents', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7106, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7106, clientX: 480, clientY: 300 });
    doublePress(screen.getByRole('button', { name: 'Cell row 1 column 1' }), canvas, 705, 400, 290);
    await user.keyboard('{Enter}');
    // Enter commits; Escape would abandon it, which is a different test.
    await user.type(screen.getByRole('textbox', { name: 'Cell row 1 column 1' }), 'Idea{Enter}');

    // Leave cell mode, then take the table whole.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 710, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 710, clientX: 20, clientY: 20 });
    const cell = screen.getByRole('button', { name: 'Cell row 1 column 1' });
    fireEvent.pointerDown(cell, { button: 0, pointerId: 715, clientX: 400, clientY: 290 });
    fireEvent.pointerUp(canvas, { pointerId: 715, clientX: 400, clientY: 290 });

    await user.keyboard('{Control>}c{/Control}');
    await user.keyboard('{Control>}v{/Control}');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const tables = diagramArtifactOf(propose.mock.calls[0]![0]).tables!;
    expect(tables).toHaveLength(2);
    // The copy carries what was typed into the original.
    expect(tables[1]!.cells[0]!.text).toBe('Idea');
    expect(tables[1]!.id).not.toBe(tables[0]!.id);
  });

  it('duplicates a stroke of ink', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 720, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 720, clientX: 380, clientY: 340 });
    fireEvent.pointerUp(canvas, { pointerId: 720, clientX: 380, clientY: 340 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Freehand stroke' }), {
      button: 0,
      pointerId: 725,
      clientX: 340,
      clientY: 320,
    });
    fireEvent.pointerUp(canvas, { pointerId: 725, clientX: 340, clientY: 320 });
    await user.keyboard('{Control>}d{/Control}');

    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(2);
  });

  it('refuses to paste when nothing has been copied', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    // Pasting an empty clipboard does nothing rather than complaining.
    await user.keyboard('{Control>}v{/Control}');
    expect(screen.getAllByRole('button', { name: /^Rounded rectangle:/ })).toHaveLength(1);
  });

  /**
   * Read the line straight off the canvas.
   *
   * Proposing normalises the whole artifact into the preview frame, which would
   * mask a three-unit difference entirely — so snapping has to be judged on what
   * is drawn, not on what is proposed.
   */
  function drawnPath() {
    return screen.getAllByTestId('studio-path')[0]!.getAttribute('d');
  }

  it('lands a dragged line on the grid', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 730, 200);
    expect(drawnPath()).toBe('M 100 200 L 300 200');

    // One press selects and begins the drag, so there is no earlier press on the
    // same spot for the double-press detector to pair this one with.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 740,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 740, clientX: 203, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 740, clientX: 203, clientY: 200 });

    // The three-unit nudge is pulled on to the next 8-unit grid line.
    expect(drawnPath()).toBe('M 104 200 L 304 200');
  });

  it('turns a drawn line about the centre of its own points', async () => {
    // A path has no box of its own the way a shape does, so it turns about the
    // centre of the box its anchors describe — 100..300 across, flat at y 200.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 790, 200);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 800,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(canvas, { pointerId: 800, clientX: 200, clientY: 200 });

    // Grabbed outside the line's left end, which is due west of its centre.
    fireEvent.pointerDown(screen.getByTestId('rotate-zone-nw'), {
      button: 0,
      pointerId: 801,
      clientX: 100,
      clientY: 200,
    });
    // Due south of the centre: a quarter turn anticlockwise, stored as 270.
    fireEvent.pointerMove(canvas, { pointerId: 801, clientX: 200, clientY: 300 });
    fireEvent.pointerUp(canvas, { pointerId: 801, clientX: 200, clientY: 300 });

    const group = screen.getAllByTestId('studio-path')[0]!.closest('g');
    expect(group).toHaveAttribute('transform', 'rotate(270 200 200)');
    // The anchors themselves are untouched: the turn is drawn, not baked in.
    expect(drawnPath()).toBe('M 100 200 L 300 200');
  });

  it('will not let an arrow-key nudge walk a line off the sheet', async () => {
    // Only nodes were held inside the canvas. Ink, paths, tables and arrows were
    // offset raw, so holding an arrow key walked a drawing off the sheet a step
    // at a time and left it somewhere it could never be selected again.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 770, 200);
    expect(drawnPath()).toBe('M 100 200 L 300 200');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 780,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(canvas, { pointerId: 780, clientX: 200, clientY: 200 });

    // Far more presses than it takes to reach the edge: 100 units at 8 a step.
    for (let press = 0; press < 25; press += 1) {
      fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    }
    expect(drawnPath()).toBe('M 0 200 L 200 200');

    // And the same going up, where the line starts only 200 units from the top.
    for (let press = 0; press < 40; press += 1) {
      fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    }
    expect(drawnPath()).toBe('M 0 0 L 200 0');
  });

  it('leaves a drag exactly where the pointer put it once snapping is off', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 750, 200);
    await user.click(screen.getByRole('button', { name: 'Snap to grid' }));

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 760,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 760, clientX: 203, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 760, clientX: 203, clientY: 200 });

    // Exactly the three units dragged, left off the grid.
    expect(drawnPath()).toBe('M 103 200 L 303 200');
  });
});

describe('studio drag fidelity and selection', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  function drawnPath() {
    return screen.getAllByTestId('studio-path')[0]!.getAttribute('d');
  }

  async function drawLine(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    pointerId: number,
  ) {
    // Drawn on grid lines (104 and 304 are both multiples of 8) so these tests
    // measure how a drag tracks, not the one-off pull onto the grid that any
    // off-grid element gets on its first move.
    await clickInRailMenu(user, 'Shapes', 'Line');
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: 104, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId, clientX: 304, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId, clientX: 304, clientY: 200 });
    // The hit target only exists for the select tool.
    await user.click(screen.getByRole('button', { name: 'Select' }));
  }

  it('keeps a dragged line under the pointer over many small moves', async () => {
    // The drag used to be incremental: it applied a snapped delta each frame but
    // advanced its reference by the raw pointer delta, so the grid rounding
    // accumulated and the artwork walked away from the cursor. Sixteen one-unit
    // moves is where that drift became obvious.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 800);
    expect(drawnPath()).toBe('M 104 200 L 304 200');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 805,
      clientX: 200,
      clientY: 200,
    });
    for (let step = 1; step <= 16; step += 1) {
      fireEvent.pointerMove(canvas, { pointerId: 805, clientX: 200 + step, clientY: 200 });
    }
    fireEvent.pointerUp(canvas, { pointerId: 805, clientX: 216, clientY: 200 });

    // Sixteen units of travel is exactly two grid steps, not more.
    expect(drawnPath()).toBe('M 120 200 L 320 200');
  });

  it('tracks the pointer back again when a drag reverses', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 810);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 815,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(canvas, { pointerId: 815, clientX: 260, clientY: 200 });
    fireEvent.pointerMove(canvas, { pointerId: 815, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 815, clientX: 200, clientY: 200 });

    // Back where it started, because the move is measured from the drag's origin.
    expect(drawnPath()).toBe('M 104 200 L 304 200');
  });

  it('drops a selected stroke when a shape is picked up', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 820, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 820, clientX: 380, clientY: 340 });
    fireEvent.pointerUp(canvas, { pointerId: 820, clientX: 380, clientY: 340 });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Freehand stroke' }), {
      button: 0,
      pointerId: 825,
      clientX: 340,
      clientY: 320,
    });
    fireEvent.pointerUp(canvas, { pointerId: 825, clientX: 340, clientY: 320 });

    // Now pick up a shape. The stroke must stop being selected, or the next
    // Delete would take both.
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }), {
      button: 0,
      pointerId: 830,
      clientX: 30,
      clientY: 30,
    });
    fireEvent.pointerUp(canvas, { pointerId: 830, clientX: 30, clientY: 30 });
    await user.keyboard('{Delete}');

    expect(screen.getAllByTestId('ink-stroke')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Rounded rectangle: Unlabelled' })).toBeNull();
  });

  it('drops the selection when a new element is drawn', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawLine(user, canvas, 835);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 2 points' }), {
      button: 0,
      pointerId: 840,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerUp(canvas, { pointerId: 840, clientX: 200, clientY: 200 });

    // Drawing a second line clears the first one's selection.
    await drawLine(user, canvas, 845);
    await user.keyboard('{Delete}');
    expect(screen.getAllByTestId('studio-path')).toHaveLength(2);
  });

  it('places a table unselected, so the first press moves it', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    // Picking a size picks the table up; this press puts it down.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7107, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7107, clientX: 480, clientY: 300 });

    // One press-and-drag both selects the new table and moves it.
    const cell = screen.getByRole('button', { name: 'Cell row 1 column 1' });
    fireEvent.pointerDown(cell, { button: 0, pointerId: 850, clientX: 400, clientY: 290 });
    fireEvent.pointerMove(canvas, { pointerId: 850, clientX: 432, clientY: 322 });
    fireEvent.pointerUp(canvas, { pointerId: 850, clientX: 432, clientY: 322 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    // Moved, and nothing was typed into it on the way.
    expect(table.cells.every((cellData) => cellData.text === undefined)).toBe(true);
  });

  it('shift-clicks a second stroke into the selection', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    for (const [id, x] of [
      [860, 200],
      [861, 500],
    ] as const) {
      fireEvent.pointerDown(canvas, { button: 0, pointerId: id, clientX: x, clientY: 300 });
      fireEvent.pointerMove(canvas, { pointerId: id, clientX: x + 60, clientY: 340 });
      fireEvent.pointerUp(canvas, { pointerId: id, clientX: x + 60, clientY: 340 });
    }

    await user.click(screen.getByRole('button', { name: 'Select' }));
    const strokes = screen.getAllByRole('button', { name: 'Freehand stroke' });
    fireEvent.pointerDown(strokes[0]!, { button: 0, pointerId: 865, clientX: 230, clientY: 320 });
    fireEvent.pointerUp(canvas, { pointerId: 865, clientX: 230, clientY: 320 });
    fireEvent.pointerDown(strokes[1]!, {
      button: 0,
      pointerId: 866,
      clientX: 530,
      clientY: 320,
      shiftKey: true,
    });
    fireEvent.pointerUp(canvas, { pointerId: 866, clientX: 530, clientY: 320 });

    await user.keyboard('{Delete}');
    // Both went, so shift added the second rather than replacing the first.
    expect(screen.queryAllByTestId('ink-stroke')).toHaveLength(0);
  });
});

describe('studio pen finishing', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  function clickAt(canvas: Element, pointerId: number, x: number, y: number) {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas, { pointerId, clientX: x, clientY: y });
  }

  async function drawTriangle(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    base: number,
  ) {
    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, base, 104, 104);
    clickAt(canvas, base + 1, 304, 104);
    clickAt(canvas, base + 2, 304, 304);
  }

  it('hands the finished shape back selected and on the select tool', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawTriangle(user, canvas, 900);
    clickAt(canvas, 903, 104, 104);

    // Back on the select tool with the shape in hand, so it can be moved at once.
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Path with 3 points' })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Path with 3 points' }), {
      button: 0,
      pointerId: 905,
      clientX: 200,
      clientY: 150,
    });
    fireEvent.pointerMove(canvas, { pointerId: 905, clientX: 232, clientY: 182 });
    fireEvent.pointerUp(canvas, { pointerId: 905, clientX: 232, clientY: 182 });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const path = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!;
    expect(path.closed).toBe(true);
    expect(path.anchors).toHaveLength(3);
  });

  it('curves the closing segment when the first point is pressed and dragged', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawTriangle(user, canvas, 910);

    // Press the first point and drag before letting go: the shape should close
    // along a curve rather than sealing the moment it is touched.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 915, clientX: 104, clientY: 104 });
    fireEvent.pointerMove(canvas, { pointerId: 915, clientX: 64, clientY: 164 });
    // Still open while the pointer is down.
    expect(screen.getByTestId('path-draft')).toBeInTheDocument();
    fireEvent.pointerUp(canvas, { pointerId: 915, clientX: 64, clientY: 164 });

    expect(screen.queryByTestId('path-draft')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const path = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!;
    expect(path.closed).toBe(true);
    // The first anchor now carries handles, so the closing run is a curve.
    expect(path.anchors[0]!.out).toBeDefined();
    expect(path.anchors[0]!.in).toEqual({
      x: -path.anchors[0]!.out!.x,
      y: -path.anchors[0]!.out!.y,
    });
  });

  it('still closes on a plain click, with no curve', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawTriangle(user, canvas, 920);
    clickAt(canvas, 923, 104, 104);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const path = diagramArtifactOf(propose.mock.calls[0]![0]).paths![0]!;
    expect(path.closed).toBe(true);
    expect(path.anchors[0]!.out).toBeUndefined();
  });

  it('makes a filled shape grabbable anywhere inside it', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    await user.click(screen.getByRole('button', { name: 'Fill the shape' }));
    clickAt(canvas, 930, 104, 104);
    clickAt(canvas, 931, 304, 104);
    clickAt(canvas, 932, 304, 304);
    clickAt(canvas, 933, 104, 104);

    // The hit target covers the interior, not only the outline.
    const target = screen.getByRole('button', { name: 'Path with 3 points' });
    expect(target).toHaveAttribute('fill', 'transparent');
    expect(target).toHaveAttribute('pointer-events', 'all');
  });

  it('leaves an unfilled outline clickable only along its line', async () => {
    // Otherwise a click inside an empty shape would be swallowed by it instead
    // of reaching whatever sits behind.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await drawTriangle(user, canvas, 940);
    clickAt(canvas, 943, 104, 104);

    const target = screen.getByRole('button', { name: 'Path with 3 points' });
    expect(target).toHaveAttribute('fill', 'none');
    expect(target).toHaveAttribute('pointer-events', 'stroke');
  });
});

describe('studio sub-toolbars in the editor', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('hands the canvas back to the select tool once something is placed', async () => {
    // Arming the pen and then placing a shape used to leave the pen armed, so
    // the next press on the canvas started drawing instead of selecting.
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lights the drawing tool the palette has armed', async () => {
    // These three stay armed after they draw, so the palette has to say which
    // one is in hand. The state was correct all along and invisible: the active
    // colours were appended to a class list that already carried the idle ones,
    // so Tailwind emitted both and the idle ones won.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    const line = screen.getByRole('button', { name: 'Line' });
    const elbow = screen.getByRole('button', { name: 'Elbowed arrow' });
    // Tokens, not substrings: the idle state carries `hover:border-rt-primary`.
    const lit = (el: HTMLElement) => el.classList.contains('border-rt-primary');
    const idle = (el: HTMLElement) => el.classList.contains('border-rt-tertiary');
    expect(lit(line)).toBe(false);

    await user.click(line);
    expect(line).toHaveAttribute('aria-pressed', 'true');
    expect(lit(line)).toBe(true);
    // The idle colours are gone rather than merely outranked.
    expect(idle(line)).toBe(false);

    await user.click(elbow);
    expect(lit(elbow)).toBe(true);
    expect(lit(line)).toBe(false);
  });

  it('keeps the shape palette open across placements', async () => {
    // A palette of things to place is used more than once. Closing it on every
    // placement meant a trip back to the rail for each shape; it stays up now,
    // and a press somewhere that is not the canvas still dismisses it.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    expect(screen.getByRole('button', { name: 'Shapes' })).toHaveAttribute('aria-expanded', 'true');

    // A different shape, straight from the palette that is already open.
    await clickInRailMenu(user, 'Shapes', 'Add ellipse');
    expect(screen.getByRole('button', { name: 'Shapes' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Rounded rectangle:/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ellipse:/ })).toBeInTheDocument();
  });

  it('closes the starter frames once one has been applied', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Templates', 'Retro');

    expect(screen.getByRole('button', { name: 'Templates' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Dotted rectangle: Went well' })).toBeInTheDocument();
  });

  it('closes the table picker once a table has been placed', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Table', '2 by 3 table');

    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Cell row 1 column 1' })).toBeInTheDocument();
  });

  it('offers six ink colours in one column', async () => {
    // Six is what a narrow strip holds and about as many as anyone scans before
    // picking; the rest of the contract's palette stays out of the tool.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    await user.click(screen.getByRole('button', { name: /^Studio$/ }));
    await user.click(screen.getByRole('button', { name: 'Freehand' }));

    const colours = screen.getByRole('group', { name: 'ink colour' });
    expect([...colours.querySelectorAll('button')]).toHaveLength(6);
    // Black is on the list: it is the one people reach for by default.
    expect(screen.getByRole('button', { name: 'ink ink' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'slate ink' })).toBeNull();
  });
});

describe('elements are created empty', () => {
  it('places a shape with no label and hints at typing while it is selected', async () => {
    // Pre-filling the label with the shape's name meant selecting that text
    // before typing anything of your own.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    expect(node.querySelector('text')).toHaveTextContent('Add text');

    // The hint belongs to the selection; on an unselected element it would read
    // as content rather than an invitation.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 7, clientX: 900, clientY: 560 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 7, clientX: 900, clientY: 560 });
    expect(node.querySelector('text')).toHaveAttribute('opacity', '0');
  });

  it('proposes an unlabelled shape through the real contract', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add ellipse');
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    const input = propose.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
  });
});

describe('the text tool', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('follows the cursor with a preview before anything is placed', async () => {
    // The ghost is the point of the tool: it says where the text will land
    // while there is still time to move it.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.queryByTestId('placement-ghost')).toBeNull();

    fireEvent.pointerMove(canvas, { pointerId: 80, clientX: 400, clientY: 300 });
    const ghost = screen.getByTestId('placement-ghost');
    expect(ghost).toHaveTextContent('Add text');
    const before = ghost.getAttribute('transform');

    fireEvent.pointerMove(canvas, { pointerId: 80, clientX: 600, clientY: 300 });
    expect(screen.getByTestId('placement-ghost').getAttribute('transform')).not.toBe(before);
  });

  it('places the element where it was pressed and opens it for typing', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 81, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 81, clientX: 400, clientY: 300 });

    // Typing starts straight away: no second click to get into the box.
    expect(await screen.findByLabelText('Edit text label')).toHaveFocus();
    // ...and the tool is spent, so the next press selects rather than places.
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('placement-ghost')).toBeNull();
  });

  it('drops an element that was left empty', async () => {
    // An invisible box that can only be found by hunting for it is worse than
    // no box at all.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 82, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 82, clientX: 400, clientY: 300 });
    fireEvent.blur(await screen.findByLabelText('Edit text label'));

    expect(screen.queryByRole('button', { name: 'Text: Unlabelled' })).toBeNull();
    // Nothing was placed, so there is nothing to undo either.
    expect(screen.getByRole('button', { name: 'Undo diagram change' })).toBeDisabled();
  });

  it('keeps one that was typed into, as a single undo step', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await placeText(user, canvas, 83, [400, 300], 'Risk');
    expect(screen.getByRole('button', { name: 'Text: Risk' })).toBeInTheDocument();

    // Placing it and typing into it were one gesture, so they undo as one.
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.queryByRole('button', { name: 'Text: Risk' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Text: Unlabelled' })).toBeNull();
  });

  it('removes an existing text element once its text is cleared', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await placeText(user, canvas, 84, [400, 300], 'Risk');
    const node = screen.getByRole('button', { name: 'Text: Risk' });
    pressNode(node, canvas, { pointerId: 85, time: 2000 });
    pressNode(node, canvas, { pointerId: 86, time: 2180 });

    const input = await screen.findByLabelText('Edit text label');
    await user.clear(input);
    fireEvent.blur(input);

    expect(screen.queryByRole('button', { name: 'Text: Risk' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Text: Unlabelled' })).toBeNull();
  });

  it('places over a shape rather than editing it, since a shape has its own label', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const shape = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    const box = shape.getBoundingClientRect();

    await placeText(user, canvas, 87, [box.left + 10, box.top + 10], 'On top');

    expect(screen.getByRole('button', { name: 'Text: On top' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
  });
});

describe('placing a shape from the palette', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('picks the shape up rather than dropping it somewhere', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    await user.click(screen.getByRole('button', { name: 'Add ellipse' }));

    // Nothing is on the board yet, and the palette stays lit while it is held.
    expect(screen.queryByRole('button', { name: 'Ellipse: Unlabelled' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Shapes' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.pointerMove(canvas, { pointerId: 70, clientX: 400, clientY: 300 });
    expect(screen.getByTestId('placement-ghost')).toBeInTheDocument();
  });

  it('places it centred on the press, then hands the canvas back', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    await user.click(screen.getByRole('button', { name: 'Add ellipse' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 71, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 71, clientX: 400, clientY: 300 });

    // Centred on the press, then pulled onto the grid like any other placement.
    const size = diagramNodeSize('ellipse');
    const onGrid = (value: number) => Math.round(value / DIAGRAM_GRID) * DIAGRAM_GRID;
    expect(screen.getByRole('button', { name: 'Ellipse: Unlabelled' })).toHaveAttribute(
      'transform',
      `translate(${onGrid(400 - size.width / 2)}, ${onGrid(300 - size.height / 2)})`,
    );
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('placement-ghost')).toBeNull();
  });
});

describe('tool shortcuts on the canvas', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('arms a tool from its letter', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    canvas.focus();
    await user.keyboard('p');
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('v');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('types into a table cell rather than switching tools', async () => {
    // The collision this guard exists for: a selected cell takes plain letters,
    // and "Table" begins with the table tool's own shortcut.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 950, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 950, clientX: 480, clientY: 300 });
    doublePressCell(screen.getByRole('button', { name: 'Cell row 1 column 1' }), canvas, 951);

    await user.keyboard('Time');
    expect(screen.getByRole('textbox', { name: 'Cell row 1 column 1' })).toHaveValue('Time');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('types into a label rather than switching tools', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    pressNode(node, canvas, { pointerId: 960, time: 3000 });
    pressNode(node, canvas, { pointerId: 961, time: 3180 });

    const input = await screen.findByLabelText('Edit box label');
    await user.type(input, 'Blueprint');
    expect(input).toHaveValue('Blueprint');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves a half-drawn shape alone', async () => {
    // Mid-pen, P would abandon the anchors already placed. Enter and Escape are
    // the way out of a shape, not the tool's own letter.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 970, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 970, clientX: 200, clientY: 200 });

    canvas.focus();
    await user.keyboard('v');
    expect(screen.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves Ctrl combinations to the canvas', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    canvas.focus();
    // Ctrl+V is paste, and paste with an empty clipboard leaves the board alone.
    await user.keyboard('{Control>}v{/Control}');
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('keeping an unfinished canvas', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  /** Closes the studio the way the header does, and opens it again. */
  async function reopen(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));
    await user.click(screen.getByRole('button', { name: /^Studio$/ }));
  }

  it('brings the canvas back after the tool is closed and reopened', async () => {
    // Everything here lives in memory until it is proposed, and a canvas is
    // minutes of work. Closing the tool used to lose all of it.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 81, 'Kept');
    await reopen(user);

    expect(screen.getByRole('button', { name: 'Rounded rectangle: Kept' })).toBeInTheDocument();
  });

  it('brings back the sketch and the tables too, not only the shapes', async () => {
    // Keeping half a canvas would be its own way of losing work.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    drawStrokeOn(canvas, 810, { x: 200, y: 200 }, { x: 300, y: 260 });
    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 812, clientX: 480, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 812, clientX: 480, clientY: 300 });

    await reopen(user);

    expect(screen.getByTestId('ink-stroke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell row 1 column 1' })).toBeInTheDocument();
  });

  it('lets go of it once the work is on the board', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    await user.click(screen.getByRole('button', { name: /^Studio$/ }));
    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
  });

  it('lets go of it when the canvas is emptied again', async () => {
    // Undoing back to nothing is not an unfinished canvas, so there is nothing
    // to come back to.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    await reopen(user);

    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
  });

  it('keeps a draft out of the way of a different question', async () => {
    // Kept per session and per question: a canvas started on one is not offered
    // on the next.
    const user = userEvent.setup();
    render(<Harness propose={propose()} questionId="question-2" />);
    await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));

    cleanup();
    render(<Harness propose={propose()} questionId="question-9" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /^Studio$/ }));
    expect(screen.queryAllByRole('button', { name: /rectangle:/ })).toHaveLength(0);
  });
});

describe('the edge of the sheet', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('keeps a stroke on the sheet however far outside it the pointer goes', async () => {
    // The canvas reaches the window now, so a press can land well off the
    // drawing surface. Nothing may be made out there.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 990, clientX: -400, clientY: -300 });
    fireEvent.pointerMove(canvas, { pointerId: 990, clientX: 2000, clientY: 1800 });
    fireEvent.pointerUp(canvas, { pointerId: 990, clientX: 2000, clientY: 1800 });

    const stroke = screen.getByTestId('ink-stroke').getAttribute('d') ?? '';
    const numbers = [...stroke.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    expect(numbers.length).toBeGreaterThan(0);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(DIAGRAM_CANVAS_WIDTH);
  });

  it('shows room around the sheet on a surface wider than it', async () => {
    // The view takes the difference in shape rather than letterboxing it, so a
    // wide window shows space either side of the sheet instead of dead margin.
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram({ width: 1600, height: 600 });
    // The surface is mocked after the first paint. A real browser reports a
    // change of this kind through the window, so the test says so too — the
    // editor no longer re-measures on every render, which was an update loop
    // waiting to happen rather than a way of noticing a resize.
    fireEvent(window, new Event('resize'));

    const [x, , width] = (canvas.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect(width).toBeGreaterThan(DIAGRAM_CANVAS_WIDTH);
    // Centred on the sheet: the same amount of room on each side.
    expect(x).toBeLessThan(0);
    expect(x! + width!).toBeGreaterThan(DIAGRAM_CANVAS_WIDTH);
  });

  it('still refuses to make anything in that room', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram({ width: 1600, height: 600 });

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    // Well into the surround, left of the sheet's own edge.
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 997, clientX: 10, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 997, clientX: 40, clientY: 320 });
    fireEvent.pointerUp(canvas, { pointerId: 997, clientX: 40, clientY: 320 });

    const stroke = screen.getByTestId('ink-stroke').getAttribute('d') ?? '';
    const numbers = [...stroke.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
  });

  it('draws the sheet, so its edge is visible on a full-bleed canvas', async () => {
    render(<Harness propose={propose()} />);
    await openDiagram();
    expect(screen.getByTestId('diagram-sheet')).toHaveAttribute(
      'width',
      String(DIAGRAM_CANVAS_WIDTH),
    );
  });
});

describe('what a press means with a tool armed', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('draws over a shape rather than selecting it', async () => {
    // A press with the brush is the start of a mark, not a change of selection,
    // wherever on the board it happens to land.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const shape = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    await user.click(screen.getByRole('button', { name: 'Freehand' }));

    fireEvent.pointerDown(shape, { button: 0, pointerId: 991, clientX: 200, clientY: 160 });
    fireEvent.pointerMove(canvas, { pointerId: 991, clientX: 260, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 991, clientX: 260, clientY: 200 });

    expect(screen.getByTestId('ink-stroke')).toBeInTheDocument();
    expect(shape).toHaveAttribute('aria-pressed', 'false');
  });

  it('takes the first pen anchor on top of a shape', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    const shape = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    await user.click(screen.getByRole('button', { name: 'Pen' }));

    fireEvent.pointerDown(shape, { button: 0, pointerId: 993, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(canvas, { pointerId: 993, clientX: 200, clientY: 160 });

    expect(screen.getByTestId('path-draft')).toBeInTheDocument();
    expect(shape).toHaveAttribute('aria-pressed', 'false');
  });

  it('still selects it once the select tool is back', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    await user.click(screen.getByRole('button', { name: 'Select' }));

    const shape = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    fireEvent.pointerDown(shape, { button: 0, pointerId: 995, clientX: 200, clientY: 160 });
    fireEvent.pointerUp(canvas, { pointerId: 995, clientX: 200, clientY: 160 });
    expect(shape).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('putting down what is being carried', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it.each([
    [
      'a shape',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Shapes' }));
        await user.click(screen.getByRole('button', { name: 'Add ellipse' }));
      },
    ],
    [
      'a text element',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Text' }));
      },
    ],
    [
      'a table',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Table' }));
        await user.click(screen.getByRole('button', { name: '2 by 2 table' }));
      },
    ],
    [
      'a starter frame',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: 'Templates' }));
        await user.click(screen.getByRole('button', { name: 'Retro' }));
      },
    ],
  ])('drops %s on Escape and hands the canvas back', async (_name, arm) => {
    // Escape is how anyone backs out of anything. Carrying something is the
    // outermost thing to be in the middle of, so it is the first thing put down.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await arm(user);
    fireEvent.pointerMove(canvas, { pointerId: 980, clientX: 400, clientY: 300 });
    expect(screen.getByTestId('placement-ghost')).toBeInTheDocument();

    // Deliberately not focusing the canvas first: arming a tool leaves focus on
    // the rail button that armed it, which is where Escape is actually pressed.
    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('placement-ghost')).toBeNull();
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('places nothing on the way out', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Shapes' }));
    await user.click(screen.getByRole('button', { name: 'Add ellipse' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Ellipse: Unlabelled' })).toBeNull();
  });
});

describe('formatting text', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('gives a shape the same text settings a table has', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 91, 'Idea');
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }));

    await user.click(screen.getByRole('button', { name: 'Format text' }));
    expect(screen.getByRole('button', { name: 'large text' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Bold cell text' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Align left' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'rose cell text' })).toBeEnabled();
  });

  it("styles a shape's label and proposes it through the real contract", async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { canvas } = await openDiagram();
    const user = userEvent.setup();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 95, 'Idea');
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }));

    await user.click(screen.getByRole('button', { name: 'Format text' }));
    await user.click(screen.getByRole('button', { name: 'Bold cell text' }));
    await user.click(screen.getByRole('button', { name: 'Align left' }));
    await user.click(screen.getByRole('button', { name: 'rose cell text' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]).toMatchObject({
      labelBold: true,
      labelAlign: 'left',
      labelColor: 'rose',
    });
  });

  it('unbolds a label that is already bold', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 97, 'Idea');
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }));

    await user.click(screen.getByRole('button', { name: 'Format text' }));
    const boldButton = screen.getByRole('button', { name: 'Bold cell text' });
    await user.click(boldButton);
    expect(boldButton).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Bold cell text' }));
    expect(screen.getByRole('button', { name: 'Bold cell text' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('proposes the extra-large size through the real contract', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { canvas } = await openDiagram();
    const user = userEvent.setup();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await typeNodeLabel(user, canvas, 'Rounded rectangle: Unlabelled', 93, 'Idea');
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }));
    await user.click(screen.getByRole('button', { name: 'Format text' }));
    await user.click(screen.getByRole('button', { name: 'xlarge text' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const input = send.mock.calls[0]?.[0];
    expect(proposalCreateSchema.safeParse(input).success).toBe(true);
    const artifact = input?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.nodes[0]?.fontSizePreset).toBe('xlarge');
  });
});

describe('what paints on top', () => {
  function diagramArtifactOf(input: ProposalCreateInput) {
    const artifact = input.artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    return artifact;
  }

  function clickAt(canvas: Element, pointerId: number, x: number, y: number) {
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas, { pointerId, clientX: x, clientY: y });
  }

  it('puts a newly placed element above everything already there', async () => {
    // Without an explicit order the legacy one applies, and it paints every node
    // beneath every path — so text dropped onto a pen shape vanished behind it.
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    clickAt(canvas, 300, 200, 200);
    clickAt(canvas, 301, 400, 200);
    clickAt(canvas, 302, 400, 360);
    clickAt(canvas, 303, 200, 200);

    await placeText(user, canvas, 304, [300, 260], 'On top');

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await proposedAndClosed();

    const artifact = diagramArtifactOf(propose.mock.calls[0]![0]);
    const textNode = artifact.nodes.find((node) => node.shape === 'text');
    expect(textNode).toBeDefined();
    expect(artifact.z?.at(-1)).toBe(textNode!.id);
  });
});

describe('picking things up before putting them down', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('does nothing on a stray press while the table tool is merely armed', async () => {
    // Arming the tool used to be enough, so a click meant to deselect something
    // dropped a table instead.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 40, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 40, clientX: 400, clientY: 300 });

    expect(screen.queryByRole('button', { name: 'Cell row 1 column 1' })).toBeNull();
    expect(screen.queryByTestId('placement-ghost')).toBeNull();
  });

  it('previews a table once a size is picked, and places it on the press', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.click(screen.getByRole('button', { name: '2 by 3 table' }));

    fireEvent.pointerMove(canvas, { pointerId: 41, clientX: 400, clientY: 300 });
    expect(screen.getByTestId('placement-ghost')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cell row 1 column 1' })).toBeNull();

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 41, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 41, clientX: 400, clientY: 300 });
    expect(screen.getByRole('button', { name: 'Cell row 2 column 3' })).toBeInTheDocument();
    expect(screen.queryByTestId('placement-ghost')).toBeNull();
  });

  it('needs Place for a size larger than the picker offers', async () => {
    // Typing a number is not a decision to put a table down; pressing Place is.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Table' }));
    await user.clear(screen.getByRole('spinbutton', { name: 'Rows' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Rows' }), '9');

    fireEvent.pointerMove(canvas, { pointerId: 42, clientX: 400, clientY: 300 });
    expect(screen.queryByTestId('placement-ghost')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Place/ }));
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 43, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 43, clientX: 400, clientY: 300 });

    expect(screen.getByRole('button', { name: 'Cell row 9 column 1' })).toBeInTheDocument();
  });

  it('carries a starter frame to where it is dropped', async () => {
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Templates' }));
    await user.click(screen.getByRole('button', { name: 'Retro' }));
    expect(screen.queryByRole('button', { name: 'Dotted rectangle: Went well' })).toBeNull();

    fireEvent.pointerMove(canvas, { pointerId: 44, clientX: 400, clientY: 300 });
    expect(screen.getByTestId('placement-ghost')).toBeInTheDocument();

    fireEvent.pointerDown(canvas, { button: 0, pointerId: 44, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 44, clientX: 400, clientY: 300 });
    expect(screen.getByRole('button', { name: 'Dotted rectangle: Went well' })).toBeInTheDocument();
  });

  it('greys out ink width and colour while the eraser is on', async () => {
    // The eraser takes neither, so offering them would suggest it did.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Freehand' }));
    expect(screen.getByRole('button', { name: 'ink ink' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Erase' }));
    expect(screen.getByRole('button', { name: 'ink ink' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thick pen' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Brush' }));
    expect(screen.getByRole('button', { name: 'ink ink' })).toBeEnabled();
  });

  it('puts the pen settings away once a shape is finished', async () => {
    // Drawing keeps them open; finishing the shape hands the canvas back to
    // Select, and the settings go with the tool.
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram();

    await user.click(screen.getByRole('button', { name: 'Pen' }));
    const press = (pointerId: number, x: number, y: number) => {
      fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: x, clientY: y });
      fireEvent.pointerUp(canvas, { pointerId, clientX: x, clientY: y });
    };

    const pen = screen.getByRole('button', { name: 'Pen' });
    press(50, 200, 200);
    press(51, 400, 200);
    // Still drawing, so the settings are still to hand.
    expect(pen).toHaveAttribute('aria-expanded', 'true');

    press(52, 400, 360);
    press(53, 200, 200);
    expect(screen.getByRole('button', { name: 'Path with 3 points' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
    expect(pen).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('studio extend and reopen', () => {
  function oneBox(): BoardItem {
    return {
      id: 'one-box',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      // As every proposal is stored: tucked into the sheet's top-left corner.
      artifactJson: {
        type: 'diagram',
        nodes: [{ id: 'n1', label: 'Idea', x: 24, y: 24, shape: 'box' }],
        edges: [],
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

  it('opens an extended proposal centred on the canvas, not in its corner', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={vi.fn(async () => undefined)}>
        <ExtendButton proposal={oneBox()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    // The box, whatever size its label gives it, centred on the 960x600 sheet.
    const artifact = oneBox().artifactJson;
    if (artifact.type !== 'diagram') throw new Error('expected a diagram artifact');
    const size = effectiveDiagramNodeSize(artifact.nodes[0]!);
    expect(screen.getByRole('button', { name: 'Rounded rectangle: Idea' })).toHaveAttribute(
      'transform',
      `translate(${Math.round((DIAGRAM_CANVAS_WIDTH - size.width) / 2)}, ${Math.round(
        (DIAGRAM_CANVAS_HEIGHT - size.height) / 2,
      )})`,
    );
  });

  it('holds Propose until the extension differs, then proposes it as an extension', async () => {
    const user = userEvent.setup();
    const send = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(
      <Harness propose={send}>
        <ExtendButton proposal={oneBox()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    const proposeButton = screen.getByRole('button', { name: 'Propose' });
    expect(proposeButton).toBeDisabled();
    expect(screen.getByText('Change something to extend this idea.')).toBeInTheDocument();

    // Ctrl+Enter goes round the button, and is refused the same way.
    fireEvent.submit(screen.getByRole('application', { name: 'Studio canvas' }).closest('form')!);
    expect(send).not.toHaveBeenCalled();

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    expect(proposeButton).toBeEnabled();
    await user.click(proposeButton);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ extendsProposalId: 'one-box' }));
  });

  it('holds Propose again once the change is undone', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={vi.fn(async () => undefined)}>
        <ExtendButton proposal={oneBox()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));

    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    expect(screen.getByRole('button', { name: 'Propose' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(screen.getByRole('button', { name: 'Propose' })).toBeDisabled();
  });

  function twoBoxes(): BoardItem {
    const item = oneBox();
    return {
      ...item,
      id: 'two-boxes',
      artifactJson: {
        type: 'diagram',
        nodes: [
          { id: 'n1', label: 'Idea', x: 24, y: 24, shape: 'box' },
          { id: 'n2', label: 'Plan', x: 240, y: 24, shape: 'box' },
        ],
        edges: [],
      },
    };
  }

  // Proposing tucks the artwork back into the sheet's corner, so moving
  // everything together stores exactly the original. That is not a change.
  it('does not count moving everything together as a change', async () => {
    const user = userEvent.setup();
    const send = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(
      <Harness propose={send}>
        <ExtendButton proposal={twoBoxes()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });
    mockSurface(canvas, { width: DIAGRAM_CANVAS_WIDTH, height: DIAGRAM_CANVAS_HEIGHT });
    const idea = screen.getByRole('button', { name: 'Rounded rectangle: Idea' });
    const before = idea.getAttribute('transform');

    fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    // It really moved on the canvas…
    expect(idea.getAttribute('transform')).not.toBe(before);
    // …but what would be stored has not, so the extension is still a clone.
    expect(screen.getByRole('button', { name: 'Propose' })).toBeDisabled();
    fireEvent.submit(canvas.closest('form')!);
    expect(send).not.toHaveBeenCalled();
  });

  it('counts moving one element relative to another as a change', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={vi.fn(async () => undefined)}>
        <ExtendButton proposal={twoBoxes()} />
      </Harness>,
    );
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });
    mockSurface(canvas, { width: DIAGRAM_CANVAS_WIDTH, height: DIAGRAM_CANVAS_HEIGHT });

    pressNode(screen.getByRole('button', { name: 'Rounded rectangle: Idea' }), canvas, {
      pointerId: 901,
      time: 1000,
    });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    expect(screen.getByRole('button', { name: 'Propose' })).toBeEnabled();
  });
});

/**
 * Fixes for the review of the studio block.
 *
 * Each of these encodes a rule rather than a value: a control that did the
 * opposite of what its own comment claimed, or a gesture that left something
 * behind. They are grouped because they were found together, not because they
 * share a code path.
 */
describe('studio review fixes', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  /** A proposal carrying an inherited edge, which is what an extend starts from. */
  function edgeParent(): BoardItem {
    return {
      id: 'review-parent',
      questionId: 'question-1',
      authorId: 'alice',
      authorName: 'Alice',
      type: 'diagram',
      artifactJson: {
        type: 'diagram',
        nodes: [
          { id: 'n1', label: 'Client', x: 24, y: 24, shape: 'box' },
          { id: 'n2', label: 'Server', x: 300, y: 24, shape: 'box' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      },
      x: 0,
      y: 0,
      createdAt: '2026-09-03T00:00:00.000Z',
    } as BoardItem;
  }

  /** Draws an arrow into empty space, leaving the offer open at its end. */
  async function drawLooseArrow(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    pointerId: number,
  ) {
    await clickInRailMenu(user, 'Shapes', 'Arrow');
    fireEvent.pointerDown(canvas, { button: 0, pointerId, clientX: 60, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, pointerId, clientX: 300, clientY: 300 });
  }

  /**
   * The `foreignObject` an inline editor is drawn in.
   *
   * Walked by hand rather than with `closest`, which does not match an SVG tag
   * name from inside the HTML subtree in jsdom.
   */
  function editorFrame(field: Element): Element {
    let node: Element | null = field;
    while (node && node.tagName.toLowerCase() !== 'foreignobject') node = node.parentElement;
    if (!node) throw new Error('the editor is not inside a foreignObject');
    return node;
  }

  async function selectLooseArrow(
    user: ReturnType<typeof userEvent.setup>,
    canvas: Element,
    pointerId: number,
  ) {
    await user.click(screen.getByRole('button', { name: /^Select$/ }));
    fireEvent.pointerDown(screen.getByTestId('studio-arrow-hit'), {
      button: 0,
      pointerId,
      clientX: 180,
      clientY: 300,
    });
    fireEvent.pointerUp(canvas, { pointerId, clientX: 180, clientY: 300 });
  }

  it('throws an arrow label away on Escape, and keeps it on blur', async () => {
    // Escape only closed the editor, and closing it unmounted the field, whose
    // own blur then committed the very text Escape had just abandoned.
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();

    await drawLooseArrow(user, canvas, 940);
    await user.click(screen.getByRole('button', { name: 'Leave this arrow pointing at nothing' }));
    await selectLooseArrow(user, canvas, 941);

    await user.click(screen.getByRole('button', { name: 'Add text' }));
    const field = screen.getByRole('textbox', { name: 'Arrow label' });
    await user.type(field, 'discard me');
    fireEvent.keyDown(field, { key: 'Escape' });

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    // The arrow had no label to begin with, so abandoning leaves it with none.
    expect(artifact.arrows![0]!.label).toBeUndefined();
  });

  it('still commits an arrow label when the field simply loses focus', async () => {
    const send = propose();
    render(<Harness propose={send} />);
    const { user, canvas } = await openDiagram();

    await drawLooseArrow(user, canvas, 953);
    await user.click(screen.getByRole('button', { name: 'Leave this arrow pointing at nothing' }));
    await selectLooseArrow(user, canvas, 954);

    await user.click(screen.getByRole('button', { name: 'Add text' }));
    const field = screen.getByRole('textbox', { name: 'Arrow label' });
    await user.type(field, 'keep me');
    fireEvent.blur(field);

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    const artifact = send.mock.calls[0]?.[0]?.artifactJson;
    if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
    expect(artifact.arrows![0]!.label).toBe('keep me');
  });

  it('grows the arrow label field as lines are added to it', async () => {
    // rows and the box around it were read off the stored label, so a line
    // added with Shift-Enter was clipped away until the edit was committed.
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();

    await drawLooseArrow(user, canvas, 943);
    await user.click(screen.getByRole('button', { name: 'Leave this arrow pointing at nothing' }));
    await selectLooseArrow(user, canvas, 944);
    await user.click(screen.getByRole('button', { name: 'Add text' }));

    const field = screen.getByRole('textbox', { name: 'Arrow label' });
    const before = Number(editorFrame(field).getAttribute('height'));
    await user.type(field, 'first{Shift>}{Enter}{/Shift}second');
    const after = Number(editorFrame(field).getAttribute('height'));

    expect(after).toBeGreaterThan(before);
  });

  it('gives a long label room to be read while it is being typed', async () => {
    // The field grows with the text, but the frame around it did not, and SVG
    // clips: the start of a long label, the end of it, and the caret being
    // typed at were all hidden, with no scrollbar to find them.
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    doublePress(node, canvas, 945, 84, 52);
    const field = screen.getByRole('textbox', { name: 'Edit box label' });
    await user.type(field, 'The quick brown fox jumps over the lazy dog and keeps running on');

    const frame = editorFrame(field);
    expect(Number(frame.getAttribute('height'))).toBeGreaterThan(56);
    // Centred on the shape, so it overhangs evenly rather than off one edge.
    expect(Number(frame.getAttribute('y'))).toBeLessThan(0);
  });

  it('drops a selected arrow when an inherited edge is picked', async () => {
    // renderEdge cleared only the nodes, so picking an edge on an extended
    // proposal left an arrow, a stroke, a path or a table lit up beside it.
    render(
      <Harness propose={propose()}>
        <ExtendButton proposal={edgeParent()} />
      </Harness>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Extend diagram fixture' }));
    const canvas = screen.getByRole('application', { name: 'Studio canvas' });
    mockSurface(canvas, { width: DIAGRAM_CANVAS_WIDTH, height: DIAGRAM_CANVAS_HEIGHT });

    // Whether this arrow binds to something or ends in space does not matter
    // here; what matters is that it is selected when the edge is pressed.
    await drawLooseArrow(user, canvas, 946);
    await selectLooseArrow(user, canvas, 947);
    expect(
      screen.getByRole('button', { name: 'Move the start of this arrow' }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Arrow from Client to Server' }), {
      button: 0,
      pointerId: 948,
    });

    expect(
      screen.queryByRole('button', { name: 'Move the start of this arrow' }),
    ).not.toBeInTheDocument();
  });

  it('creates nothing when the arrow behind the shape offer has been undone', async () => {
    // The binding quietly found no arrow and the shape was committed anyway, so
    // undoing the arrow and then taking the offer put an orphan on the canvas
    // and threw the redo away.
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();

    await drawLooseArrow(user, canvas, 949);
    expect(screen.getByTestId('arrow-shape-picker')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    // Undo is one of the things that puts the offer down.
    expect(screen.queryByTestId('arrow-shape-picker')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('studio-arrow')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Ellipse: Unlabelled' })).not.toBeInTheDocument();
  });

  it('puts the shape offer down when the canvas is used for anything else', async () => {
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();

    await drawLooseArrow(user, canvas, 950);
    expect(screen.getByTestId('arrow-shape-picker')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Select$/ }));
    expect(screen.queryByTestId('arrow-shape-picker')).not.toBeInTheDocument();
  });

  it('will not let an arrow be painted out of existence', async () => {
    // An arrow is its stroke, like a pen path: a transparent one vanishes while
    // its 18-unit hit band goes on swallowing presses.
    render(<Harness propose={propose()} />);
    const { user, canvas } = await openDiagram();

    await drawLooseArrow(user, canvas, 951);
    await user.click(screen.getByRole('button', { name: 'Leave this arrow pointing at nothing' }));
    await selectLooseArrow(user, canvas, 952);

    await openBarPanel(user, 'Line colour');
    expect(screen.getByRole('button', { name: 'rose line' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'transparent line' })).not.toBeInTheDocument();
  });
});

describe('turning without a pointer', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('turns the selection with the bracket keys, coarser with shift', () => {
    // Rotation was reachable only by dragging a corner, so a keyboard user
    // could not turn anything — or straighten something that arrived turned in
    // someone else's proposal.
    render(<Harness propose={propose()} />);
    return openDiagram().then(async ({ user, canvas }) => {
      await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

      fireEvent.keyDown(canvas, { key: ']' });
      const node = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
      expect(node).toHaveAttribute('transform', 'translate(24, 24) rotate(5 60 28)');

      fireEvent.keyDown(canvas, { key: ']', shiftKey: true });
      expect(node).toHaveAttribute('transform', 'translate(24, 24) rotate(50 60 28)');

      fireEvent.keyDown(canvas, { key: '[', shiftKey: true });
      fireEvent.keyDown(canvas, { key: '[' });
      // Back to square, which drops the key rather than storing a zero.
      expect(node).toHaveAttribute('transform', 'translate(24, 24)');
    });
  });

  it('does not offer to turn a container, by either route', () => {
    // A container is a group: turning the frame without the shapes inside it
    // reads as broken, and its drop test and clamp both assume a square box.
    render(<Harness propose={propose()} />);
    return openDiagram().then(async ({ user, canvas }) => {
      await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');

      expect(screen.queryByTestId('rotate-zone-nw')).not.toBeInTheDocument();

      fireEvent.keyDown(canvas, { key: ']' });
      expect(screen.getByRole('button', { name: 'Dotted rectangle: Unlabelled' })).toHaveAttribute(
        'transform',
        'translate(24, 24)',
      );
    });
  });
});

describe('studio robustness fixes', () => {
  function propose() {
    return vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
  }

  it('refuses to propose over a turn that is still in hand', () => {
    // Every gesture previews into the snapshot the submit reads, so proposing
    // part-way through one serialises a half-finished state. Four were guarded
    // and the rest were not.
    render(<Harness propose={propose()} />);
    return openDiagram().then(async ({ user, canvas }) => {
      await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

      fireEvent.pointerDown(screen.getByTestId('rotate-zone-nw'), {
        button: 0,
        pointerId: 960,
        clientX: 24,
        clientY: 24,
      });
      fireEvent.pointerMove(canvas, { pointerId: 960, clientX: 50, clientY: 3 });
      await user.click(screen.getByRole('button', { name: 'Propose' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Finish turning the element before proposing.',
      );
    });
  });

  it('refuses to propose over a shape that is still being dragged out', () => {
    render(<Harness propose={propose()} />);
    return openDiagram().then(async ({ user, canvas }) => {
      const trigger = screen.getByRole('button', { name: 'Shapes' });
      if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
      await user.click(screen.getByRole('button', { name: 'Add rounded rectangle' }));

      fireEvent.pointerDown(canvas, { button: 0, pointerId: 961, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(canvas, { pointerId: 961, clientX: 400, clientY: 320 });
      await user.click(screen.getByRole('button', { name: 'Propose' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Finish drawing the shape before proposing.',
      );
    });
  });

  it('will not paint a shape out of existence entirely', () => {
    // Invisible but still clickable, with no way back but an undo the user has
    // no reason to know they need.
    const send = propose();
    render(<Harness propose={send} />);
    return openDiagram().then(async ({ user, canvas }) => {
      await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
      fireEvent.keyDown(canvas, { key: 'a', ctrlKey: true });

      await openMore(user);
      await openBarPanel(user, 'Line colour');
      await user.click(screen.getByRole('button', { name: 'transparent line' }));
      await openMore(user);
      await openBarPanel(user, 'Fill');
      await user.click(screen.getByRole('button', { name: 'transparent fill' }));

      await user.click(screen.getByRole('button', { name: 'Propose' }));
      const artifact = send.mock.calls[0]?.[0]?.artifactJson;
      if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
      const node = artifact.nodes[0]!;
      // The fill was the later choice, so it wins and the outline comes back.
      expect(node.fillColor).toBe('transparent');
      expect(node.strokeColor).toBeUndefined();
    });
  });

  it('resizes a textbox when its text size changes, not only when it is typed', () => {
    const send = propose();
    render(<Harness propose={send} />);
    return openDiagram().then(async ({ user, canvas }) => {
      await user.click(screen.getByRole('button', { name: 'Text' }));
      fireEvent.pointerDown(canvas, { button: 0, pointerId: 962, clientX: 300, clientY: 300 });
      fireEvent.pointerUp(canvas, { pointerId: 962, clientX: 300, clientY: 300 });

      const field = screen.getByRole('textbox', { name: 'Edit text label' });
      await user.type(field, 'a few words that will wrap onto more than one line');
      fireEvent.blur(field);

      await user.click(screen.getByRole('button', { name: /^Text: / }));
      await user.click(screen.getByRole('button', { name: 'Format text' }));
      await user.click(screen.getByRole('button', { name: 'xlarge text' }));

      await user.click(screen.getByRole('button', { name: 'Propose' }));
      const artifact = send.mock.calls[0]?.[0]?.artifactJson;
      if (artifact?.type !== 'diagram') throw new Error('expected a diagram artifact');
      const layout = diagramNodeLabelLayout(artifact.nodes[0]!);
      // Every line it lays out fits inside the height it stored.
      expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(
        artifact.nodes[0]!.height!,
      );
    });
  });
});
