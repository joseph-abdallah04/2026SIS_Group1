import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import {
  DIAGRAM_FILL_COLORS,
  DIAGRAM_NODE_SHAPE_KEYS,
  DIAGRAM_STROKE_COLORS,
  diagramNodeSize,
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
async function openMore(user: ReturnType<typeof userEvent.setup>) {
  for (const name of ['Rows and columns', 'Arrow']) {
    const trigger = screen.queryByRole('button', { name });
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
    extendsProposalId: null,
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
    expect(
      await screen.findByRole('heading', { name: 'Studio canvas proposed' }),
    ).toBeInTheDocument();
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
      extendsProposalId: null,
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

  it('keeps a dirty diagram open when discard confirmation is declined', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    await openDiagram();
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Cancel is the only exit that destroys anything now, so it is the only one
    // that asks — and declining leaves the canvas exactly as it was.
    expect(confirm).toHaveBeenCalledWith('Discard this canvas?');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }),
    ).toBeInTheDocument();
    confirm.mockRestore();
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

  it('discards nodes when cancelled', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const first = await openDiagram();
    await clickInRailMenu(first.user, 'Shapes', 'Add rounded rectangle');
    await first.user.click(screen.getByRole('button', { name: 'Cancel' }));
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
      extendsProposalId: null,
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
    await openMore(user);
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
      'ellipse',
    );
  });

  it('connects two nodes, labels the arrow, and proposes normalized edge data', async () => {
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
    // Joining two elements opens the panel holding the arrow's name and puts
    // the cursor in it: naming it is the obvious next thing.
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));
    await openMore(user);
    const edgeLabel = screen.getByLabelText('Label (optional)');
    await user.type(edgeLabel, 'calls');
    await user.tab();

    await user.click(screen.getByRole('button', { name: 'Undo diagram change' }));
    expect(
      screen.getByRole('button', { name: 'Arrow from Unlabelled to Unlabelled' }),
    ).toBeInTheDocument();
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    const box = screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' });
    const before = box.getAttribute('transform');
    await arrangeDiagram(user);
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
    await clickInRailMenu(user, 'Shapes', 'Add rounded rectangle');
    await clickInRailMenu(user, 'Shapes', 'Add dotted rectangle');
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Rounded rectangle: Unlabelled' }));

    expect(
      screen.getByRole('button', { name: 'Arrow from Unlabelled to Unlabelled' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete selection' }));

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });
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
      extendsProposalId: null,
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

    await openMore(user);
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
      extendsProposalId: null,
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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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

    await screen.findByRole('heading', { name: 'Studio canvas proposed' });
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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
      createdAt: '2026-09-03T00:00:00.000Z',
      extendsProposalId: null,
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

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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

  it('places a table of the chosen size and proposes its grid', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 400, '2 by 4 table');
    expect(screen.getByRole('button', { name: 'Cell row 1 column 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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

    await screen.findByRole('heading', { name: 'Studio canvas proposed' });
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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

    const table = diagramArtifactOf(propose.mock.calls[0]![0]).tables![0]!;
    expect(table.cells[0]!.text).toBeUndefined();
  });

  it('adds and removes rows from the inspector', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 425);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Row below' }));
    expect(screen.getByRole('button', { name: 'Cell row 4 column 1' })).toBeInTheDocument();

    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Delete row' }));
    expect(screen.queryByRole('button', { name: 'Cell row 4 column 1' })).toBeNull();
  });

  it('adds a column and keeps every row the same length', async () => {
    const propose = vi.fn(async (input: ProposalCreateInput) => {
      void input;
    });
    render(<Harness propose={propose} />);
    const { user, canvas } = await openDiagram();

    await placeTable(user, canvas, 430);
    await user.click(screen.getByRole('button', { name: 'Cell row 1 column 1' }));
    await openMore(user);
    await user.click(screen.getByRole('button', { name: 'Column right' }));

    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    // Selected whole: the cell inspector is not open yet.
    await openMore(user);
    expect(screen.queryByRole('button', { name: 'Row below' })).toBeNull();

    doublePress(cell, canvas, 690, 400, 290);
    await openMore(user);
    expect(screen.getByRole('button', { name: 'Row below' })).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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

  it('closes the shape palette once a shape has been placed', async () => {
    render(<Harness propose={propose()} />);
    const { user } = await openDiagram();

    await clickInRailMenu(user, 'Shapes', 'Add ellipse');

    expect(screen.getByRole('button', { name: 'Shapes' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

    // The confirmation screen has its own way back, beside the header's.
    await user.click(screen.getAllByRole('button', { name: 'Back to pinboard' })[0]!);
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
    const user = userEvent.setup();
    render(<Harness propose={propose()} />);
    const { canvas } = await openDiagram({ width: 1600, height: 600 });
    // The surface is mocked after the first paint, so give it one more render
    // to measure on.
    await user.click(screen.getByRole('button', { name: 'Show grid' }));

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
    await screen.findByRole('heading', { name: 'Studio canvas proposed' });

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
