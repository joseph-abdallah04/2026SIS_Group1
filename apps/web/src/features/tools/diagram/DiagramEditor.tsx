import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowRight,
  Box,
  CheckCircle2,
  Circle,
  ClipboardPaste,
  Container,
  Copy,
  CopyPlus,
  Database,
  Diamond,
  Link2,
  LoaderCircle,
  Maximize2,
  Minus,
  RotateCcw,
  RectangleHorizontal,
  Send,
  BringToFront,
  SendToBack,
  Trash2,
  Triangle,
  Type,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  PathAnchor,
  PathElement,
  TableElement,
  DiagramFillKey,
  DiagramEdge,
  DiagramFontSizePreset,
  DiagramNode,
  DiagramNodeShape,
  DiagramStrokeKey,
  DiagramStrokeStyle,
  DiagramStrokeWidthPreset,
} from '@roundtable/shared';
import {
  DIAGRAM_FILL_COLORS,
  DIAGRAM_FILL_KEYS,
  DIAGRAM_FONT_SIZE_PRESETS,
  DIAGRAM_LABEL_INK,
  DIAGRAM_STROKE_COLORS,
  DIAGRAM_STROKE_KEYS,
  DIAGRAM_STROKE_STYLES,
  DIAGRAM_STROKE_WIDTH_PRESETS,
  diagramEdgeDash,
  diagramEdgeGeometry,
  diagramEdgeRoutes,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramEdgeToPointGeometry,
  diagramNodeFill,
  diagramNodeLabelLayout,
  diagramNodeSize,
  diagramNodeStroke,
  diagramNodeStrokeWidth,
  diagramCanParent,
  diagramDescendantIds,
  effectiveDiagramNodeSize,
  inkStrokeColor,
  inkStrokeWidth,
  pathFill,
  pathStrokeColor,
  pathHandlePoint,
  TABLE_CELL_PADDING,
  TABLE_CELL_TEXT_LIMIT,
  tableCellAt,
  tableCellBold,
  tableCellColor,
  tableCellFill,
  tableCellFontSize,
  tableCellLines,
  tableColCount,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  tableStrokeColor,
  tableStrokeWidth,
  TABLE_CELL_ALIGNS,
  TABLE_DEFAULT_COL_WIDTH,
  TABLE_DEFAULT_ROW_HEIGHT,
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  pathStrokeWidth,
  pathSvgData,
  strokePathData,
  reorderStudioElements,
  studioPaintOrder,
} from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
import { DiagramShapeOutline } from '../../../components/ui/DiagramShapeOutline';
import { IconButton } from '../../../components/ui/IconButton';
import { DIAGRAM_EDGE_LIMIT, DIAGRAM_NODE_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_EDGE_LABEL_LIMIT,
  DIAGRAM_GRID,
  DIAGRAM_LABEL_LIMIT,
  DIAGRAM_NODE_SHAPES,
  DIAGRAM_SHAPE_LABELS,
  DIAGRAM_SHAPE_MEDIA_TYPE,
  addEdge,
  addNode,
  alignNodes,
  clampNodesInsideContainer,
  clearEdgeStyle,
  clearNodeSize,
  clearNodeStyle,
  clientPointToDiagramPoint,
  containerAtPoint,
  deleteContainerWithContents,
  deleteEdge,
  deleteNodesWithEdges,
  distributeNodes,
  edgeKey,
  draggedSelectionRoots,
  moveNodesBy,
  nodeBounds,
  normalizeRect,
  pasteDiagramFragment,
  prepareDiagram,
  prepareEdgeLabel,
  prepareNodeLabel,
  renameEdge,
  renameNode,
  reparentNodes,
  resizeNode,
  styleEdge,
  styleNodes,
  ungroupContainer,
  type DiagramAlignMode,
  type DiagramDistributeAxis,
  type DiagramPoint,
  type DiagramRect,
  type DiagramResizeCorner,
} from './diagramModel';
import { type DiagramSnapshot } from './diagramHistory';
import {
  DIAGRAM_DEFAULT_VIEW,
  DIAGRAM_ZOOM_STEP,
  diagramViewBoxAttribute,
  diagramViewZoom,
  fitDiagramView,
  isDefaultDiagramView,
  panDiagramView,
  zoomDiagramView,
  type DiagramView,
} from './diagramView';
import { layoutDiagram, type DiagramLayoutDirection } from './diagramLayout';
import { useDiagramHistory } from './useDiagramHistory';
import { StudioToolRail } from '../studio/toolbar/StudioToolRail';
import {
  createInkId,
  dataToInk,
  eraseInkAtPoint,
  eraserRadiusForView,
  type StudioInkStroke,
} from '../studio/studioInk';
import {
  copyStudioFragment,
  isFragmentEmpty,
  pasteStudioFragment,
  type StudioFragment,
} from '../studio/studioClipboard';
import { offsetRect, snapDragToGrid, unionBounds } from '../studio/studioSnapping';
import {
  inkBounds,
  pathBounds,
  tableBounds,
  EMPTY_STUDIO_SELECTION,
  isSelectionEmpty,
  mergeSelections,
  selectionSize,
  studioElementsInRect,
  type StudioSelection,
} from '../studio/studioSelection';
import {
  clampCellRef,
  createTable,
  deleteColumn,
  deleteRow,
  fillCellRange,
  insertColumn,
  insertRow,
  alignCellRange,
  clearCellRange,
  isCellInRange,
  moveTableBy,
  moveTableSelection,
  resizeColumn,
  resizeRow,
  setCell,
  styleCellRange,
  type CellRange,
  type CellRef,
  type TableNavKey,
} from '../studio/studioTables';
import {
  anchorAtPoint,
  isSmoothAnchor,
  moveAnchor,
  moveHandle,
  movePathBy,
  removeAnchor,
  toggleAnchorSmooth,
} from '../studio/studioPathEdit';
import {
  PATH_CLOSE_TOLERANCE,
  anchorWithDraggedHandle,
  draftAnchors,
  finishPathDraft,
  isNearFirstAnchor,
  nextAnchorPoint,
} from '../studio/studioPaths';
import { STUDIO_TEMPLATES, type StudioTemplate } from '../studio/studioTemplates';

/**
 * What a press on empty canvas does. Shapes, arrows and selection are unchanged
 * by `draw`/`erase`: the ink tools only take over the canvas background, so a
 * node is still draggable while the pencil is held.
 */
type CanvasTool = 'select' | 'draw' | 'erase' | 'pen' | 'line' | 'table';

// The size picker offers a sensible span, not the whole allowed range: the
// number inputs beside it reach the rest.
const TABLE_PICKER_ROWS = 6;
const TABLE_PICKER_COLS = 8;

interface DragSession {
  pointerId: number;
  anchorId: string;
  origins: Record<string, DiagramPoint>;
  start: DiagramPoint;
  previous: DiagramSnapshot;
  moved: boolean;
}

// Below this the press reads as a click rather than a drag, in sheet units.
const DRAG_THRESHOLD = 1;

interface ResizeSession {
  pointerId: number;
  nodeId: string;
  corner: DiagramResizeCorner;
  start: DiagramRect;
  origin: DiagramPoint;
  previous: DiagramSnapshot;
}

interface PanSession {
  pointerId: number;
  startClient: DiagramPoint;
  startView: DiagramView;
}

interface MarqueeSession {
  pointerId: number;
  origin: DiagramPoint;
  current: DiagramPoint;
  base: StudioSelection | null;
}

/**
 * A press, for detecting a double one by hand.
 *
 * The DOM's `dblclick` never arrives for anything on this canvas: taking
 * pointer capture on the canvas retargets the follow-up events, so the second
 * click is not delivered to the element that was pressed. Nodes have always
 * worked around it this way; paths and tables need the same.
 */
interface NodePress {
  key: string;
  time: number;
  clientX: number;
  clientY: number;
}

const SHAPE_ICONS: Record<DiagramNodeShape, typeof Box> = {
  box: Box,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  diamond: Diamond,
  triangle: Triangle,
  cylinder: Database,
  container: Container,
  text: Type,
};

const DIAGRAM_VERTICAL_CHROME_REM = 14;

// A node's native dblclick never arrives: dragging needs `preventDefault()` on
// pointerdown (which suppresses the compatibility mouse events dblclick is built
// from) and the canvas holds pointer capture during the press (which retargets
// any that survive). Recognise the second press from the pointer stream instead,
// which also makes the gesture work for touch/pen. 400ms matches the platform
// double-click window; the slop is measured in client pixels rather than diagram
// units so it does not shrink with the canvas on small viewports, and 16px sits
// between mouse precision and finger wobble.
const NODE_DOUBLE_PRESS_MS = 400;
const NODE_DOUBLE_PRESS_SLOP_PX = 16;

// Pasted and duplicated copies land one grid step down-right so they are visibly
// distinct from their source instead of hiding exactly on top of it.
const DIAGRAM_PASTE_OFFSET: DiagramPoint = { x: DIAGRAM_GRID * 2, y: DIAGRAM_GRID * 2 };

// Editor-side pre-v2 appearance. Unstyled elements keep exactly these, so an
// inherited diagram is untouched until someone actually picks a style.
const LEGACY_NODE_STROKES: Record<DiagramNodeShape, string> = {
  box: '#4D6A74',
  container: '#8CA4AC',
  text: 'transparent',
  // Shapes added with the expanded palette inherit the box border.
  rectangle: '#4D6A74',
  ellipse: '#4D6A74',
  triangle: '#4D6A74',
  diamond: '#4D6A74',
  cylinder: '#4D6A74',
};
const LEGACY_NODE_STROKE_WIDTH = 1.5;
const LEGACY_CONTAINER_DASH = '5 3';
const LEGACY_EDGE_STROKE_WIDTH = 2;

const SELECTION_ACCENT = '#E0A33C';

const RESIZE_CORNERS: { corner: DiagramResizeCorner; label: string; cursor: string }[] = [
  { corner: 'nw', label: 'Resize from the top left', cursor: 'nwse-resize' },
  { corner: 'ne', label: 'Resize from the top right', cursor: 'nesw-resize' },
  { corner: 'se', label: 'Resize from the bottom right', cursor: 'nwse-resize' },
  { corner: 'sw', label: 'Resize from the bottom left', cursor: 'nesw-resize' },
];

const STROKE_WIDTH_LABELS: Record<DiagramStrokeWidthPreset, string> = {
  thin: 'Thin',
  regular: 'Regular',
  thick: 'Thick',
};

const FONT_SIZE_LABELS: Record<DiagramFontSizePreset, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
};

const STROKE_STYLE_LABELS: Record<DiagramStrokeStyle, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
};

const LAYOUT_DIRECTIONS: {
  direction: DiagramLayoutDirection;
  label: string;
  Icon: typeof ArrowDown;
}[] = [
  { direction: 'TB', label: 'Arrange top to bottom', Icon: ArrowDown },
  { direction: 'LR', label: 'Arrange left to right', Icon: ArrowRight },
];

const ALIGN_ACTIONS: { mode: DiagramAlignMode; label: string; Icon: typeof AlignStartVertical }[] =
  [
    { mode: 'left', label: 'Align left edges', Icon: AlignStartVertical },
    { mode: 'centerX', label: 'Align horizontal centres', Icon: AlignCenterVertical },
    { mode: 'right', label: 'Align right edges', Icon: AlignEndVertical },
    { mode: 'top', label: 'Align top edges', Icon: AlignStartHorizontal },
    { mode: 'centerY', label: 'Align vertical centres', Icon: AlignCenterHorizontal },
    { mode: 'bottom', label: 'Align bottom edges', Icon: AlignEndHorizontal },
  ];

// Sized by its grid column rather than fixed: seven fixed 28px swatches overflow
// the 260px sidebar.
function SwatchButton({
  label,
  color,
  active,
  disabled,
  onSelect,
}: {
  label: string;
  color: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={`aspect-square w-full rounded-full border-2 transition-shadow disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none ${
        active ? 'border-rt-ink shadow-[0_0_0_2px_rgba(224,163,60,0.45)]' : 'border-rt-tertiary'
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

function PresetButton({
  label,
  name,
  active,
  disabled,
  onSelect,
}: {
  label: string;
  /** Accessible name; the visible label alone ("L", "Thick") does not identify the control. */
  name: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className={`min-h-8 flex-1 rounded-lg border px-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none ${
        active
          ? 'border-rt-primary bg-rt-primary-tint text-rt-ink'
          : 'border-rt-tertiary bg-rt-surface text-rt-ink-muted hover:bg-rt-surface-alt'
      }`}
    >
      {label}
    </button>
  );
}

function displayShape(node: DiagramNode): DiagramNodeShape {
  return node.shape ?? 'box';
}

function selectedNodeById(nodes: readonly DiagramNode[], id: string | null) {
  return id ? (nodes.find((node) => node.id === id) ?? null) : null;
}

function selectedEdgeByKey(edges: readonly DiagramEdge[], key: string | null) {
  return key ? (edges.find((edge) => edgeKey(edge) === key) ?? null) : null;
}

function isDoublePress(last: NodePress | null, key: string, press: NodePress): boolean {
  return (
    last !== null &&
    last.key === key &&
    press.time - last.time <= NODE_DOUBLE_PRESS_MS &&
    Math.abs(press.clientX - last.clientX) <= NODE_DOUBLE_PRESS_SLOP_PX &&
    Math.abs(press.clientY - last.clientY) <= NODE_DOUBLE_PRESS_SLOP_PX
  );
}

function nodeOrigins(
  nodes: readonly DiagramNode[],
  ids: readonly string[],
): Record<string, DiagramPoint> {
  const origins: Record<string, DiagramPoint> = {};
  for (const node of nodes) {
    if (ids.includes(node.id)) origins[node.id] = { x: node.x, y: node.y };
  }
  return origins;
}

export function DiagramEditor() {
  const {
    closeTool,
    extensionSource,
    editSource,
    isLive,
    resetSubmission,
    setCloseGuard,
    submissionError,
    submissionStatus,
    submitArtifact,
  } = useCreativeTools();
  // Editing rewrites this proposal; extending starts a new one from it.
  const sourceProposal = editSource ?? extensionSource;
  const sourceArtifact =
    sourceProposal?.artifactJson.type === 'diagram' ? sourceProposal.artifactJson : null;
  const initialSnapshotRef = useRef<DiagramSnapshot | null>(null);
  if (!initialSnapshotRef.current) {
    initialSnapshotRef.current = {
      nodes: (sourceArtifact?.nodes ?? []).map((node) => ({ ...node })),
      edges: (sourceArtifact?.edges ?? []).map((edge) => ({ ...edge })),
      // Extending a studio canvas has to bring its sketch and its ordering with
      // it: prefilling only the shapes would quietly drop half the artifact.
      ...(sourceArtifact?.ink?.length ? { ink: dataToInk(sourceArtifact.ink) } : {}),
      ...(sourceArtifact?.z?.length ? { z: [...sourceArtifact.z] } : {}),
    };
  }
  const history = useDiagramHistory(initialSnapshotRef.current);
  const { nodes, edges } = history.snapshot;
  const ink = history.snapshot.ink ?? [];
  const paths = history.snapshot.paths ?? [];
  const paintOrder = studioPaintOrder(history.snapshot);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => (nodes[0] ? [nodes[0].id] : []));
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [connectionPointer, setConnectionPointer] = useState<DiagramPoint | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [view, setView] = useState<DiagramView>(DIAGRAM_DEFAULT_VIEW);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [clipboard, setClipboard] = useState<StudioFragment | null>(null);
  const [marquee, setMarquee] = useState<MarqueeSession | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingContainerDelete, setPendingContainerDelete] = useState<string | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<DiagramLayoutDirection>('TB');
  const [panReady, setPanReady] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  // v4: what a press on empty canvas does. `select` is the diagram's original
  // behaviour (marquee); the other two are the studio's ink tools.
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [inkColor, setInkColor] = useState<DiagramStrokeKey>('ink');
  const [inkWidth, setInkWidth] = useState<DiagramStrokeWidthPreset>('regular');
  const [activeStroke, setActiveStroke] = useState<StudioInkStroke | null>(null);
  // The pen's in-progress path. `pathCursor` is where the next segment is being
  // aimed, so the run to the pointer can be previewed before it is committed.
  const [pathAnchors, setPathAnchors] = useState<PathAnchor[]>([]);
  const [pathCursor, setPathCursor] = useState<DiagramPoint | null>(null);
  const pathAnchorsRef = useRef<PathAnchor[]>([]);
  pathAnchorsRef.current = pathAnchors;
  const pathPointerRef = useRef<number | null>(null);
  // True between pressing the first anchor and letting go: the shape is about
  // to close, and the drag in between shapes the closing curve.
  const pathClosingRef = useRef(false);
  // An existing path being edited, and which of its anchors is in hand.
  // Ink, paths and tables are selected as sets, so a marquee can sweep them up
  // alongside nodes. The single-element ids below are views onto these, for the
  // inspector, which only ever edits one thing at a time.
  const [selectedInkIds, setSelectedInkIds] = useState<string[]>([]);
  const [selectedPathIds, setSelectedPathIds] = useState<string[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [selectedAnchor, setSelectedAnchor] = useState<number | null>(null);
  // Click selects an element whole; double-click goes inside it. Until then a
  // drag moves the thing rather than reshaping it.
  const [pathEditing, setPathEditing] = useState(false);
  const [tableEditing, setTableEditing] = useState(false);
  // True while the pen's next click would close the shape, so the first anchor
  // can say so before it is clicked.
  const [closeHover, setCloseHover] = useState(false);
  const elementMoveRef = useRef<{
    pointerId: number;
    selection: StudioSelection;
    /** Pointer and artwork as they were when the drag began. */
    start: DiagramPoint;
    startBounds: DiagramRect | null;
    previous: DiagramSnapshot;
    moved: boolean;
  } | null>(null);
  // Table creation size, and which cell of which table is in hand.
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  // Pen and line styling, kept apart from the freehand ink's own pen.
  const [pathColor, setPathColor] = useState<DiagramStrokeKey>('ink');
  const [pathWidth, setPathWidth] = useState<DiagramStrokeWidthPreset>('regular');
  const [pathStyle, setPathStyle] = useState<DiagramStrokeStyle>('solid');
  const [pathFillColor, setPathFillColor] = useState<DiagramFillKey | null>(null);
  const selectedPathId = selectedPathIds.length === 1 ? (selectedPathIds[0] ?? null) : null;
  const selectedTableId = selectedTableIds.length === 1 ? (selectedTableIds[0] ?? null) : null;
  const [cellRange, setCellRange] = useState<CellRange | null>(null);
  const [editingCell, setEditingCell] = useState<CellRef | null>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  // Closing the editor unmounts the input, which fires its own blur. Without
  // this flag that blur would commit the very text Escape just abandoned.
  const cellEditCancelledRef = useRef(false);
  // Opening a cell to edit it selects what is there, so typing replaces it.
  // Opening it *by* typing must not: the first character is already in the box
  // and selecting it would make the second keystroke overwrite it.
  const cellEditSelectAllRef = useRef(true);
  const tableResizeRef = useRef<{
    pointerId: number;
    tableId: string;
    axis: 'col' | 'row';
    index: number;
    previous: DiagramSnapshot;
  } | null>(null);
  const pathEditRef = useRef<{
    pointerId: number;
    pathId: string;
    index: number;
    side: 'in' | 'out' | null;
    origin: DiagramPoint;
    previous: DiagramSnapshot;
  } | null>(null);
  const activeStrokeRef = useRef<StudioInkStroke | null>(null);
  const inkPointerRef = useRef<number | null>(null);
  const eraseStartRef = useRef<DiagramSnapshot | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const edgeLabelInputRef = useRef<HTMLInputElement>(null);
  const inlineLabelInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const resizeRef = useRef<ResizeSession | null>(null);
  const panRef = useRef<PanSession | null>(null);
  const marqueeRef = useRef<MarqueeSession | null>(null);
  const lastNodePressRef = useRef<NodePress | null>(null);
  const nodeLabelStartRef = useRef<DiagramSnapshot | null>(null);
  const edgeLabelStartRef = useRef<DiagramSnapshot | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const selectedId = selectedIds.length === 1 ? selectedIds[0]! : null;
  const selectedNode = selectedNodeById(nodes, selectedId);
  const selectedEdge = selectedEdgeByKey(edges, selectedEdgeKey);
  const connectionSource = selectedNodeById(nodes, connectionSourceId);
  const hoveredTarget = selectedNodeById(nodes, hoveredTargetId);
  const connectionPreview = connectionSource
    ? hoveredTarget
      ? diagramEdgeGeometry(connectionSource, hoveredTarget)
      : connectionPointer
        ? diagramEdgeToPointGeometry(connectionSource, connectionPointer)
        : null
    : null;
  const isSubmitting = submissionStatus === 'submitting';
  const styledNodes = nodes.filter((node) => selectedIds.includes(node.id));
  // A swatch reads as active only when every selected node already carries it.
  const sharedNodeStyle = <
    Key extends 'fillColor' | 'strokeColor' | 'strokeWidthPreset' | 'fontSizePreset',
  >(
    key: Key,
  ): DiagramNode[Key] | undefined => {
    const first = styledNodes[0]?.[key];
    return first !== undefined && styledNodes.every((node) => node[key] === first)
      ? first
      : undefined;
  };
  const zoomPercent = Math.round(diagramViewZoom(view) * 100);
  // Undo can take the container away while its delete question is still open.
  const containerAwaitingDelete = nodes.some((node) => node.id === pendingContainerDelete)
    ? pendingContainerDelete
    : null;
  // The default marker keeps its id for the connection preview; every distinct
  // edge colour gets its own so an arrowhead always matches its line.
  // Built once per render: the ordered paint pass looks every element up by key,
  // and doing that with `find` would be quadratic on a busy canvas.
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const inkById = new Map(ink.map((stroke) => [stroke.id, stroke]));
  const pathById = new Map(paths.map((path) => [path.id, path]));
  const selectedPath = selectedPathId ? (pathById.get(selectedPathId) ?? null) : null;
  const tables = history.snapshot.tables ?? [];
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const selectedTable = selectedTableId ? (tableById.get(selectedTableId) ?? null) : null;
  const edgeIndexByKey = new Map(edges.map((edge, index) => [edgeKey(edge), index]));
  const edgeArrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
  // Routing is derived from the edge set, never stored: a reciprocal pair bows
  // apart so both directions stay readable.
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);
  const edgeArrowId = (color: string) => `diagram-editor-arrow-${color.replace('#', '')}`;
  const marqueeRect: DiagramRect | null = marquee
    ? normalizeRect(marquee.origin, marquee.current)
    : null;

  useEffect(() => {
    const shouldClose = () =>
      !history.isDirty ||
      submissionStatus === 'success' ||
      window.confirm('Discard your unsaved diagram changes?');
    setCloseGuard(shouldClose);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!history.isDirty || submissionStatus === 'success') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      setCloseGuard(null);
    };
  }, [history.isDirty, setCloseGuard, submissionStatus]);

  // React attaches `wheel` passively at the root, so the zoom gesture needs its
  // own non-passive listener to be able to cancel the browser's page zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      // Ctrl/Cmd + wheel is also what a trackpad pinch sends; a plain wheel is
      // left alone so the studio still scrolls normally.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const anchor = clientPointToDiagramPoint(
        { x: event.clientX, y: event.clientY },
        { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
        viewRef.current,
      );
      setView((current) => zoomDiagramView(current, Math.exp(-event.deltaY / 200), anchor));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!editingCell) return;
    const input = cellInputRef.current;
    if (!input) return;
    input.focus();
    if (cellEditSelectAllRef.current) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [editingCell]);

  function clearError() {
    setValidationError(null);
    if (submissionError) resetSubmission();
  }

  function surfacePoint(event: { clientX: number; clientY: number }): DiagramPoint {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return clientPointToDiagramPoint(
      { x: event.clientX, y: event.clientY },
      { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
      viewRef.current,
    );
  }

  /**
   * Select one node and nothing else.
   *
   * The studio kinds are cleared too. Before this, picking up a shape left a
   * previously selected stroke or table still highlighted, and the next Delete
   * would take both — selection has to mean one thing across every kind.
   */
  function selectOnly(id: string | null) {
    setSelectedIds(id ? [id] : []);
    setSelectedEdgeKey(null);
    setSelectedInkIds([]);
    clearPathSelection();
    clearTableSelection();
  }

  function addElement(shape: DiagramNodeShape, at?: DiagramPoint, parentId: string | null = null) {
    clearError();
    const result = addNode(history.snapshotRef.current.nodes, shape, at, snapEnabled);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    const nodes = parentId ? reparentNodes(result.nodes, [result.addedId], parentId) : result.nodes;
    history.commit({ nodes, edges: history.snapshotRef.current.edges });
    selectOnly(result.addedId);
    setSelectedEdgeKey(null);
  }

  function cancelConnection() {
    setConnectionMode(false);
    setConnectionSourceId(null);
    setConnectionPointer(null);
    setHoveredTargetId(null);
  }

  function startConnection(sourceId: string | null = selectedId) {
    clearError();
    setConnectionMode(true);
    setConnectionSourceId(sourceId);
    setConnectionPointer(null);
    setHoveredTargetId(null);
    setSelectedEdgeKey(null);
  }

  function connectNode(node: DiagramNode) {
    if (!connectionSourceId) {
      setConnectionSourceId(node.id);
      selectOnly(node.id);
      return;
    }

    const graph = history.snapshotRef.current;
    const result = addEdge(graph.nodes, graph.edges, connectionSourceId, node.id);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    history.commit({ nodes: graph.nodes, edges: result.edges });
    setSelectedEdgeKey(edgeKey(result.edge));
    setSelectedIds([]);
    cancelConnection();
    queueMicrotask(() => edgeLabelInputRef.current?.focus());
  }

  function removeSelectedNodes() {
    if (selectedIds.length === 0) return;
    clearError();
    const graph = history.snapshotRef.current;

    // Deleting a container is ambiguous, so ask instead of guessing. Only a
    // single container with contents needs the question.
    if (selectedIds.length === 1) {
      const target = graph.nodes.find((node) => node.id === selectedIds[0]);
      if (
        target &&
        diagramCanParent(target.shape) &&
        diagramDescendantIds(graph.nodes, target.id).length > 0
      ) {
        setPendingContainerDelete(target.id);
        return;
      }
    }

    history.commit(deleteNodesWithEdges(graph.nodes, graph.edges, selectedIds));
    if (connectionSourceId && selectedIds.includes(connectionSourceId)) cancelConnection();
    setSelectedIds([]);
  }

  function resolveContainerDelete(mode: 'contents' | 'ungroup') {
    const containerId = pendingContainerDelete;
    if (!containerId) return;
    const graph = history.snapshotRef.current;
    history.commit(
      mode === 'contents'
        ? deleteContainerWithContents(graph.nodes, graph.edges, containerId)
        : ungroupContainer(graph.nodes, graph.edges, containerId),
    );
    if (connectionSourceId === containerId) cancelConnection();
    setPendingContainerDelete(null);
    setSelectedIds([]);
  }

  function removeSelectedEdge() {
    if (!selectedEdge) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: graph.nodes, edges: deleteEdge(graph.edges, selectedEdge) });
    setSelectedEdgeKey(null);
  }

  function alignSelection(mode: DiagramAlignMode) {
    if (selectedIds.length < 2) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({
      nodes: alignNodes(graph.nodes, selectedIds, mode),
      edges: graph.edges,
    });
  }

  function distributeSelection(axis: DiagramDistributeAxis) {
    if (selectedIds.length < 3) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({
      nodes: distributeNodes(graph.nodes, selectedIds, axis),
      edges: graph.edges,
    });
  }

  function copySelection(): StudioFragment | null {
    const selection = currentSelection();
    if (isSelectionEmpty(selection)) return null;
    const fragment = copyStudioFragment(history.snapshotRef.current, selection);
    setClipboard(fragment);
    return fragment;
  }

  function pasteFragment(fragment: StudioFragment | null) {
    if (isFragmentEmpty(fragment)) {
      setValidationError('Copy at least one element first.');
      return;
    }
    clearError();
    const graph = history.snapshotRef.current;
    const result = pasteStudioFragment(graph, fragment, DIAGRAM_PASTE_OFFSET, snapEnabled);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    history.commit({
      nodes: result.nodes,
      edges: result.edges,
      ink: result.ink,
      paths: result.paths,
      tables: result.tables,
    });
    // What just landed is what you want to move, so it is what is selected.
    applySelection(result.selection);
  }

  function duplicateSelection() {
    pasteFragment(copySelection());
  }

  function applyNodeStyle(style: Parameters<typeof styleNodes>[2]) {
    if (selectedIds.length === 0) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: styleNodes(graph.nodes, selectedIds, style), edges: graph.edges });
  }

  function resetNodeStyle() {
    if (selectedIds.length === 0) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: clearNodeStyle(graph.nodes, selectedIds), edges: graph.edges });
  }

  function applyEdgeStyle(style: Parameters<typeof styleEdge>[2]) {
    if (!selectedEdge) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: graph.nodes, edges: styleEdge(graph.edges, selectedEdge, style) });
  }

  function resetEdgeStyle() {
    if (!selectedEdge) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: graph.nodes, edges: clearEdgeStyle(graph.edges, selectedEdge) });
  }

  function resetSelectedNodeSize() {
    if (!selectedNode) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: clearNodeSize(graph.nodes, selectedNode.id), edges: graph.edges });
  }

  function normalizeSelectedLabel() {
    if (!selectedNode) return;
    const graph = history.snapshotRef.current;
    history.preview({
      nodes: renameNode(graph.nodes, selectedNode.id, prepareNodeLabel(selectedNode.label)),
      edges: graph.edges,
    });
    const previous = nodeLabelStartRef.current;
    if (previous) history.recordPreview(previous);
    nodeLabelStartRef.current = null;
  }

  function normalizeSelectedEdgeLabel() {
    if (!selectedEdge) return;
    const graph = history.snapshotRef.current;
    history.preview({
      nodes: graph.nodes,
      edges: renameEdge(graph.edges, selectedEdge, prepareEdgeLabel(selectedEdge.label ?? '')),
    });
    const previous = edgeLabelStartRef.current;
    if (previous) history.recordPreview(previous);
    edgeLabelStartRef.current = null;
  }

  function cancelNodeLabelEdit() {
    const previous = nodeLabelStartRef.current;
    if (previous) history.restorePreview(previous);
    nodeLabelStartRef.current = null;
  }

  function cancelEdgeLabelEdit() {
    const previous = edgeLabelStartRef.current;
    if (previous) history.restorePreview(previous);
    edgeLabelStartRef.current = null;
  }

  function undoDiagram() {
    cancelConnection();
    cancelNodeLabelEdit();
    cancelEdgeLabelEdit();
    history.undo();
  }

  function redoDiagram() {
    cancelConnection();
    cancelNodeLabelEdit();
    cancelEdgeLabelEdit();
    history.redo();
  }

  function beginInlineNodeEdit(node: DiagramNode) {
    cancelConnection();
    selectOnly(node.id);
    setSelectedEdgeKey(null);
    nodeLabelStartRef.current ??= history.snapshotRef.current;
    setEditingNodeId(node.id);
    queueMicrotask(() => {
      inlineLabelInputRef.current?.focus();
      inlineLabelInputRef.current?.select();
    });
  }

  function finishInlineNodeEdit() {
    if (!nodeLabelStartRef.current) {
      setEditingNodeId(null);
      return;
    }
    normalizeSelectedLabel();
    setEditingNodeId(null);
    canvasRef.current?.focus({ preventScroll: true });
  }

  function cancelInlineNodeEdit() {
    cancelNodeLabelEdit();
    setEditingNodeId(null);
    canvasRef.current?.focus({ preventScroll: true });
  }

  function zoomBy(factor: number) {
    setView((current) => zoomDiagramView(current, factor));
  }

  function fitView() {
    setView(fitDiagramView(history.snapshotRef.current.nodes));
  }

  function resetView() {
    setView(DIAGRAM_DEFAULT_VIEW);
  }

  function onNodePointerDown(event: PointerEvent<SVGGElement>, node: DiagramNode) {
    if (event.button !== 0 || dragRef.current || isSubmitting) return;
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus();
    if (connectionMode) {
      lastNodePressRef.current = null;
      setSelectedEdgeKey(null);
      connectNode(node);
      return;
    }

    const press: NodePress = {
      key: node.id,
      time: event.timeStamp,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (isDoublePress(lastNodePressRef.current, node.id, press)) {
      lastNodePressRef.current = null;
      beginInlineNodeEdit(node);
      return;
    }
    lastNodePressRef.current = press;

    // Shift toggles membership instead of starting a drag, so a mis-drag cannot
    // shove the rest of the selection while you are still building it.
    if (event.shiftKey) {
      setSelectedIds((current) =>
        current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id],
      );
      setSelectedEdgeKey(null);
      clearError();
      return;
    }

    const selection = selectedIds.includes(node.id) ? selectedIds : [node.id];
    // Moving a container moves everything nested inside it, so the group keeps
    // its shape; the selection itself is unchanged.
    const dragIds = [
      ...new Set(
        selection.flatMap((id) => [
          id,
          ...diagramDescendantIds(history.snapshotRef.current.nodes, id),
        ]),
      ),
    ];
    dragRef.current = {
      pointerId: event.pointerId,
      anchorId: node.id,
      origins: nodeOrigins(history.snapshotRef.current.nodes, dragIds),
      start: surfacePoint(event),
      previous: history.snapshotRef.current,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
    setSelectedIds(selection);
    setSelectedEdgeKey(null);
    // Picking up a shape ends any studio element's selection, so what is
    // highlighted is always what a Delete or a drag would act on.
    setSelectedInkIds([]);
    clearPathSelection();
    clearTableSelection();
    clearError();
  }

  /** The container the dragged group would land in, if any. */
  function dropContainerFor(drag: DragSession, nodes: readonly DiagramNode[]): DiagramNode | null {
    const anchor = nodes.find((node) => node.id === drag.anchorId);
    if (!anchor) return null;
    const size = effectiveDiagramNodeSize(anchor);
    const centre = { x: anchor.x + size.width / 2, y: anchor.y + size.height / 2 };
    return containerAtPoint(nodes, centre, Object.keys(drag.origins));
  }

  function onResizePointerDown(
    event: PointerEvent<SVGGElement>,
    node: DiagramNode,
    corner: DiagramResizeCorner,
  ) {
    if (event.button !== 0 || isSubmitting) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });
    lastNodePressRef.current = null;

    const size = effectiveDiagramNodeSize(node);
    resizeRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      corner,
      start: { x: node.x, y: node.y, width: size.width, height: size.height },
      origin: surfacePoint(event),
      previous: history.snapshotRef.current,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateResize(event: PointerEvent<SVGSVGElement>): boolean {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const point = surfacePoint(event);
    const graph = history.snapshotRef.current;
    history.preview({
      nodes: resizeNode(
        graph.nodes,
        resize.nodeId,
        resize.corner,
        resize.start,
        { x: point.x - resize.origin.x, y: point.y - resize.origin.y },
        snapEnabled,
        event.shiftKey,
      ),
      edges: graph.edges,
    });
    return true;
  }

  function endResize(event: PointerEvent<SVGSVGElement>): boolean {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return false;
    updateResize(event);

    const graph = history.snapshotRef.current;
    const clamped = clampNodesInsideContainer(graph.nodes, resize.nodeId);
    if (clamped.some((node, index) => node !== graph.nodes[index])) {
      history.preview({ nodes: clamped, edges: graph.edges });
    }

    history.recordPreview(resize.previous);
    resizeRef.current = null;
    releaseCapture(event);
    return true;
  }

  /**
   * Raise or lower the selection through the ink.
   *
   * A container travels with everything it holds: the write path refuses an
   * order that paints a container after its own contents, so raising a group
   * without its children would produce an artifact that cannot be proposed.
   */
  function reorderSelection(move: 'front' | 'back') {
    const selection = currentSelection();
    if (isSelectionEmpty(selection)) return;
    const graph = history.snapshotRef.current;
    const moving = new Set<string>([
      ...selection.inkIds,
      ...selection.pathIds,
      ...selection.tableIds,
    ]);
    for (const id of selection.nodeIds) {
      moving.add(id);
      for (const child of diagramDescendantIds(graph.nodes, id)) moving.add(child);
    }
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      z: reorderStudioElements(studioPaintOrder(graph), moving, move),
    });
  }

  /** One history entry, so a template dropped by mistake is one undo away. */
  /**
   * Drop a starter frame onto the canvas.
   *
   * Additive, not replacing. The picker used to be gated to an empty canvas, so
   * overwriting was safe; from the rail a template can be reached at any time
   * and replacing would destroy the board. It goes through the same paster the
   * clipboard uses, which re-mints every id — so a template can be applied twice
   * without its two copies sharing ids.
   */
  function applyTemplate(template: StudioTemplate) {
    clearError();
    const graph = history.snapshotRef.current;
    const fragment = template.build();
    // Laid out at absolute positions, so an empty canvas takes them as designed
    // and a busy one gets them stepped clear of what is already there.
    const offset =
      graph.nodes.length === 0 && graph.edges.length === 0 ? { x: 0, y: 0 } : DIAGRAM_PASTE_OFFSET;

    const pasted = pasteDiagramFragment(graph.nodes, graph.edges, fragment, offset, snapEnabled);
    if (!pasted.ok) {
      setValidationError(pasted.error);
      return;
    }

    history.commit({ nodes: pasted.nodes, edges: pasted.edges });
    applySelection({ ...EMPTY_STUDIO_SELECTION, nodeIds: pasted.addedIds });
    // Applying from a popover unmounts the button that had focus; without moving
    // it back to the canvas it lands on document.body, outside the form, and the
    // form's Ctrl+Z handler stops seeing keystrokes until something is clicked.
    canvasRef.current?.focus({ preventScroll: true });
  }

  /** Paths travel with the nodes and edges in one history entry, like ink. */
  function commitPaths(nextPaths: PathElement[], nextOrder?: string[]) {
    const graph = history.snapshotRef.current;
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      paths: nextPaths,
      ...(nextOrder ? { z: nextOrder } : {}),
    });
  }

  /** Scene-unit close target, scaled so it stays a constant size on screen. */
  function closeTolerance() {
    return PATH_CLOSE_TOLERANCE / diagramViewZoom(viewRef.current);
  }

  function clearPathDraft() {
    pathClosingRef.current = false;
    setCloseHover(false);
    setPathAnchors([]);
    setPathCursor(null);
    pathPointerRef.current = null;
  }

  /**
   * Land the path in hand. A finished path goes on top, so when the diagram
   * already carries an explicit order the new id has to join it.
   */
  function commitPathDraft(anchors: readonly PathAnchor[], closed: boolean) {
    const path = finishPathDraft(anchors, closed, {
      strokeColor: pathColor,
      strokeWidthPreset: pathWidth,
      strokeStyle: pathStyle,
      ...(pathFillColor ? { fillColor: pathFillColor } : {}),
    });
    clearPathDraft();
    if (!path) return;

    const graph = history.snapshotRef.current;
    const existingOrder = graph.z;
    commitPaths(
      [...(graph.paths ?? []), path],
      existingOrder ? [...existingOrder, path.id] : undefined,
    );

    // Finishing hands the shape straight back, selected and on the select tool,
    // so the next thing you can do is move it. The table tool already behaves
    // this way; drawing another line is one click on Pen.
    setCanvasTool('select');
    applySelection({ ...EMPTY_STUDIO_SELECTION, pathIds: [path.id] });
  }

  function finishPenDraft() {
    const anchors = pathAnchorsRef.current;
    if (anchors.length === 0) {
      clearPathDraft();
      return;
    }
    commitPathDraft(anchors, false);
  }

  function replacePath(next: PathElement | null, id: string) {
    const graph = history.snapshotRef.current;
    const current = graph.paths ?? [];
    const kept = next
      ? current.map((path) => (path.id === id ? next : path))
      : current.filter((path) => path.id !== id);
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      paths: kept,
      ...(next ? {} : graph.z ? { z: graph.z.filter((key) => key !== id) } : {}),
    });
  }

  function selectPath(id: string) {
    setSelectedPathIds([id]);
    setSelectedInkIds([]);
    setSelectedTableIds([]);
    setSelectedAnchor(null);
    setSelectedIds([]);
    setSelectedEdgeKey(null);
  }

  function clearPathSelection() {
    setSelectedPathIds([]);
    setSelectedAnchor(null);
    setPathEditing(false);
  }

  /**
   * Shift-click on a studio element toggles its membership, exactly as it does
   * on a shape. Returns true when it handled the press, so the caller knows not
   * to start a drag — building a selection and moving it are separate acts.
   */
  function toggleStudioSelection(kind: 'ink' | 'path' | 'table', id: string): void {
    const setter =
      kind === 'ink'
        ? setSelectedInkIds
        : kind === 'path'
          ? setSelectedPathIds
          : setSelectedTableIds;
    setter((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
    setSelectedEdgeKey(null);
    clearError();
  }

  function selectTable(id: string) {
    setSelectedTableIds([id]);
    setSelectedIds([]);
    setSelectedEdgeKey(null);
    setSelectedInkIds([]);
    clearPathSelection();
    setCellRange(null);
    setTableEditing(false);
  }

  /** Everything selected, in the shape the sweep and the group edits use. */
  function currentSelection(): StudioSelection {
    return {
      nodeIds: selectedIds,
      inkIds: selectedInkIds,
      pathIds: selectedPathIds,
      tableIds: selectedTableIds,
    };
  }

  function applySelection(next: StudioSelection) {
    setSelectedIds(next.nodeIds);
    setSelectedInkIds(next.inkIds);
    setSelectedPathIds(next.pathIds);
    setSelectedTableIds(next.tableIds);
    setSelectedEdgeKey(null);
    setSelectedAnchor(null);
    setPathEditing(false);
    setTableEditing(false);
    setCellRange(null);
    setEditingCell(null);
  }

  function clearAllSelection() {
    applySelection(EMPTY_STUDIO_SELECTION);
  }

  /** Delete every selected element, whatever kind, in one history entry. */
  function deleteSelection() {
    const selection = currentSelection();
    if (isSelectionEmpty(selection)) return;
    const graph = history.snapshotRef.current;
    const inkGone = new Set(selection.inkIds);
    const pathGone = new Set(selection.pathIds);
    const tableGone = new Set(selection.tableIds);
    const gone = new Set([...inkGone, ...pathGone, ...tableGone]);

    const remaining =
      selection.nodeIds.length > 0
        ? deleteNodesWithEdges(graph.nodes, graph.edges, selection.nodeIds)
        : { nodes: graph.nodes, edges: graph.edges };

    history.commit({
      nodes: remaining.nodes,
      edges: remaining.edges,
      ink: (graph.ink ?? []).filter((stroke) => !inkGone.has(stroke.id)),
      paths: (graph.paths ?? []).filter((path) => !pathGone.has(path.id)),
      tables: (graph.tables ?? []).filter((table) => !tableGone.has(table.id)),
      ...(graph.z ? { z: graph.z.filter((key) => !gone.has(key)) } : {}),
    });
    clearAllSelection();
  }

  /** Anchor and handle drags are one history entry each, recorded on release. */
  function beginPathEdit(
    event: PointerEvent<SVGElement>,
    path: PathElement,
    index: number,
    side: 'in' | 'out' | null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    const anchor = path.anchors[index];
    if (!anchor) return;

    setSelectedPathIds([path.id]);
    setSelectedAnchor(index);
    pathEditRef.current = {
      pointerId: event.pointerId,
      pathId: path.id,
      index,
      side,
      origin: { x: anchor.x, y: anchor.y },
      previous: history.snapshotRef.current,
    };
  }

  function updatePathEdit(event: PointerEvent<SVGSVGElement>): boolean {
    const session = pathEditRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    event.preventDefault();

    const graph = history.snapshotRef.current;
    const path = (graph.paths ?? []).find((current) => current.id === session.pathId);
    if (!path) return true;

    const point = surfacePoint(event);
    const next = session.side
      ? // Alt breaks the tangent, so the two sides bend independently.
        moveHandle(path, session.index, session.side, point, event.altKey)
      : moveAnchor(path, session.index, point, session.origin, event.shiftKey);

    history.preview({
      nodes: graph.nodes,
      edges: graph.edges,
      paths: (graph.paths ?? []).map((current) => (current.id === session.pathId ? next : current)),
    });
    return true;
  }

  function endPathEdit(event: PointerEvent<SVGSVGElement>): boolean {
    const session = pathEditRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    pathEditRef.current = null;
    history.recordPreview(session.previous);
    releaseCapture(event);
    return true;
  }

  function replaceTable(next: TableElement | null, id: string) {
    const graph = history.snapshotRef.current;
    const current = graph.tables ?? [];
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      tables: next
        ? current.map((table) => (table.id === id ? next : table))
        : current.filter((table) => table.id !== id),
      ...(next ? {} : graph.z ? { z: graph.z.filter((key) => key !== id) } : {}),
    });
  }

  function clearTableSelection() {
    setSelectedTableIds([]);
    setCellRange(null);
    setEditingCell(null);
    setTableEditing(false);
  }

  function placeTable(at: DiagramPoint, rows = tableRows, cols = tableCols) {
    clearError();
    const table = createTable(rows, cols, at);
    const graph = history.snapshotRef.current;
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      tables: [...(graph.tables ?? []), table],
      ...(graph.z ? { z: [...graph.z, table.id] } : {}),
    });
    setCanvasTool('select');
    // Deliberately unselected. A press on it both selects and starts a drag, so
    // the first thing anyone can do with a new table is put it where they want
    // it; opening it for typing straight away made that impossible.
    clearAllSelection();
    canvasRef.current?.focus({ preventScroll: true });
  }

  /** The one cell a keystroke acts on: the focus end of the current range. */
  function activeCell(): CellRef | null {
    return cellRange?.focus ?? null;
  }

  function selectCell(table: TableElement, row: number, col: number, extend: boolean) {
    setSelectedTableIds([table.id]);
    setSelectedIds([]);
    setSelectedEdgeKey(null);
    clearPathSelection();
    setEditingCell(null);
    setCellRange((current) =>
      extend && current
        ? { anchor: current.anchor, focus: { row, col } }
        : {
            anchor: { row, col },
            focus: { row, col },
          },
    );
  }

  function commitCellText(table: TableElement, cell: CellRef, text: string) {
    replaceTable(setCell(table, cell.row, cell.col, { text }), table.id);
  }

  function beginTableResize(
    event: PointerEvent<SVGElement>,
    table: TableElement,
    axis: 'col' | 'row',
    index: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    setSelectedTableIds([table.id]);
    tableResizeRef.current = {
      pointerId: event.pointerId,
      tableId: table.id,
      axis,
      index,
      previous: history.snapshotRef.current,
    };
  }

  function updateTableResize(event: PointerEvent<SVGSVGElement>): boolean {
    const session = tableResizeRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    event.preventDefault();

    const graph = history.snapshotRef.current;
    const table = (graph.tables ?? []).find((current) => current.id === session.tableId);
    if (!table) return true;

    const point = surfacePoint(event);
    // The boundary being dragged is measured from where its own track starts,
    // so the neighbouring columns keep the widths their authors chose.
    const next =
      session.axis === 'col'
        ? resizeColumn(
            table,
            session.index,
            point.x - (table.x + (tableColumnOffsets(table)[session.index] ?? 0)),
          )
        : resizeRow(
            table,
            session.index,
            point.y - (table.y + (tableRowOffsets(table)[session.index] ?? 0)),
          );

    history.preview({
      nodes: graph.nodes,
      edges: graph.edges,
      tables: (graph.tables ?? []).map((current) =>
        current.id === session.tableId ? next : current,
      ),
    });
    return true;
  }

  function endTableResize(event: PointerEvent<SVGSVGElement>): boolean {
    const session = tableResizeRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    tableResizeRef.current = null;
    history.recordPreview(session.previous);
    releaseCapture(event);
    return true;
  }

  /**
   * Drag a whole element. One history entry per drag, recorded on release, so
   * moving a shape is a single undo like moving a node already is.
   */
  function beginElementMove(
    event: PointerEvent<SVGElement>,
    kind: 'path' | 'table' | 'ink',
    id: string,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);

    // Grabbing something already in the selection drags the whole selection;
    // grabbing anything else drags only that, which is how every canvas editor
    // behaves and stops a stray click hauling the rest of the board along.
    const current = currentSelection();
    const key = kind === 'path' ? 'pathIds' : kind === 'table' ? 'tableIds' : 'inkIds';
    const selection: StudioSelection = current[key].includes(id)
      ? current
      : { ...EMPTY_STUDIO_SELECTION, [key]: [id] };

    const previous = history.snapshotRef.current;
    elementMoveRef.current = {
      pointerId: event.pointerId,
      selection,
      start: surfacePoint(event),
      startBounds: unionBounds(boundsOfSelection(previous, selection)),
      previous,
      moved: false,
    };
  }

  /**
   * Move the selection to where the pointer has taken it.
   *
   * Everything is computed from the state the drag began in, never from the
   * previous frame. An incremental version drifts: it applies a snapped delta
   * each frame but advances its reference by the raw pointer delta, so the grid
   * rounding accumulates and the artwork walks away from the cursor. This is
   * the same origin-plus-total-delta model `moveNodesBy` already uses, which is
   * why dragging a shape has never had the problem.
   */
  function updateElementMove(event: PointerEvent<SVGSVGElement>): boolean {
    const session = elementMoveRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    event.preventDefault();

    const point = surfacePoint(event);
    const rawTotal = { x: point.x - session.start.x, y: point.y - session.start.y };
    // Snapped by the group's outer box, so a multi-element drag keeps its
    // internal spacing rather than each member rounding independently.
    const total = session.startBounds
      ? snapDragToGrid(offsetRect(session.startBounds, rawTotal), rawTotal, snapEnabled)
      : rawTotal;

    if (total.x === 0 && total.y === 0 && !session.moved) return true;
    session.moved = true;

    const origin = session.previous;
    const moving = session.selection;
    const nodeGoing = new Set(moving.nodeIds);
    const inkGoing = new Set(moving.inkIds);
    const pathGoing = new Set(moving.pathIds);
    const tableGoing = new Set(moving.tableIds);

    history.preview({
      nodes: origin.nodes.map((node) =>
        nodeGoing.has(node.id)
          ? { ...node, x: Math.round(node.x + total.x), y: Math.round(node.y + total.y) }
          : node,
      ),
      edges: origin.edges,
      ink: (origin.ink ?? []).map((stroke) =>
        inkGoing.has(stroke.id)
          ? {
              ...stroke,
              points: stroke.points.map((p) => ({ x: p.x + total.x, y: p.y + total.y })),
            }
          : stroke,
      ),
      paths: (origin.paths ?? []).map((path) =>
        pathGoing.has(path.id) ? movePathBy(path, total.x, total.y) : path,
      ),
      tables: (origin.tables ?? []).map((table) =>
        tableGoing.has(table.id) ? moveTableBy(table, total.x, total.y) : table,
      ),
    });
    return true;
  }

  function endElementMove(event: PointerEvent<SVGSVGElement>): boolean {
    const session = elementMoveRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    elementMoveRef.current = null;
    // A click that never moved is a selection, not an edit worth undoing.
    if (session.moved) history.recordPreview(session.previous);
    releaseCapture(event);
    return true;
  }

  /** Bounds of one element of each kind, for snapping and group extents. */
  function boundsOfSelection(scene: DiagramSnapshot, selection: StudioSelection) {
    const rects: DiagramRect[] = [];
    for (const node of scene.nodes) {
      if (selection.nodeIds.includes(node.id)) rects.push(nodeBounds(node));
    }
    for (const stroke of scene.ink ?? []) {
      if (!selection.inkIds.includes(stroke.id)) continue;
      const bounds = inkBounds(stroke);
      if (bounds) rects.push(bounds);
    }
    for (const path of scene.paths ?? []) {
      if (!selection.pathIds.includes(path.id)) continue;
      const bounds = pathBounds(path);
      if (bounds) rects.push(bounds);
    }
    for (const table of scene.tables ?? []) {
      if (selection.tableIds.includes(table.id)) rects.push(tableBounds(table));
    }
    return rects;
  }

  /**
   * Arms a tool. Leaving the select tool drops the selection — its handles would
   * otherwise sit under the pen — so every route to a tool goes through here,
   * whether that is the rail or a button inside one of its sub-toolbars.
   */
  function selectCanvasTool(next: CanvasTool) {
    setCanvasTool(next);
    if (next !== 'select') {
      clearAllSelection();
      cancelConnection();
    }
  }

  function renderFreehandOptions() {
    return (
      <div className="w-full">
        <div className="mb-2 flex gap-1" role="group" aria-label="Freehand mode">
          {(
            [
              ['draw', 'Freehand'],
              ['erase', 'Erase'],
            ] as const
          ).map(([mode, modeLabel]) => (
            <button
              key={mode}
              type="button"
              aria-label={modeLabel}
              aria-pressed={canvasTool === mode}
              disabled={isSubmitting}
              onClick={() => selectCanvasTool(mode)}
              className={`flex-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
                canvasTool === mode
                  ? 'border-rt-primary bg-rt-primary-tint text-rt-ink'
                  : 'border-rt-tertiary bg-rt-surface text-rt-ink-muted hover:text-rt-ink'
              }`}
            >
              {modeLabel}
            </button>
          ))}
        </div>
        <fieldset className="mb-4">
          <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            Ink
          </legend>
          <div className="mt-2 grid grid-cols-8 gap-1.5">
            {DIAGRAM_STROKE_KEYS.map((key) => (
              <SwatchButton
                key={key}
                label={`${key} ink`}
                color={DIAGRAM_STROKE_COLORS[key]}
                active={inkColor === key}
                disabled={isSubmitting}
                onSelect={() => setInkColor(key)}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
              <PresetButton
                key={preset}
                label={STROKE_WIDTH_LABELS[preset]}
                name={`${STROKE_WIDTH_LABELS[preset]} pen`}
                active={inkWidth === preset}
                disabled={isSubmitting}
                onSelect={() => setInkWidth(preset)}
              />
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  function renderPenOptions() {
    return (
      <div className="w-full">
        <fieldset className="mb-4">
          <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            {selectedPath ? 'Selected line' : 'Line style'}
          </legend>
          <div className="mt-2 grid grid-cols-8 gap-1.5">
            {DIAGRAM_STROKE_KEYS.map((key) => (
              <SwatchButton
                key={key}
                label={`${key} line`}
                color={DIAGRAM_STROKE_COLORS[key]}
                active={selectedPath ? selectedPath.strokeColor === key : pathColor === key}
                disabled={isSubmitting}
                onSelect={() => {
                  setPathColor(key);
                  if (selectedPath) {
                    replacePath({ ...selectedPath, strokeColor: key }, selectedPath.id);
                  }
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
              <PresetButton
                key={preset}
                label={STROKE_WIDTH_LABELS[preset]}
                name={`${STROKE_WIDTH_LABELS[preset]} line`}
                active={
                  selectedPath ? selectedPath.strokeWidthPreset === preset : pathWidth === preset
                }
                disabled={isSubmitting}
                onSelect={() => {
                  setPathWidth(preset);
                  if (selectedPath) {
                    replacePath({ ...selectedPath, strokeWidthPreset: preset }, selectedPath.id);
                  }
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {DIAGRAM_STROKE_STYLES.map((style) => (
              <PresetButton
                key={style}
                label={STROKE_STYLE_LABELS[style]}
                name={`${STROKE_STYLE_LABELS[style]} line`}
                active={
                  selectedPath
                    ? (selectedPath.strokeStyle ?? 'solid') === style
                    : pathStyle === style
                }
                disabled={isSubmitting}
                onSelect={() => {
                  setPathStyle(style);
                  if (selectedPath) {
                    replacePath({ ...selectedPath, strokeStyle: style }, selectedPath.id);
                  }
                }}
              />
            ))}
          </div>

          {/* A fill only means anything once the shape encloses an area, so it
                is offered for a closed path and for the pen that can close one. */}
          {canvasTool === 'pen' || selectedPath?.closed ? (
            <>
              <p className="mt-3 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                Fill when closed
              </p>
              <div className="mt-2 grid grid-cols-8 gap-1.5">
                {DIAGRAM_FILL_KEYS.map((key) => (
                  <SwatchButton
                    key={key}
                    label={`${key} shape fill`}
                    color={DIAGRAM_FILL_COLORS[key]}
                    active={selectedPath ? selectedPath.fillColor === key : pathFillColor === key}
                    disabled={isSubmitting}
                    onSelect={() => {
                      setPathFillColor(key);
                      if (selectedPath?.closed) {
                        replacePath({ ...selectedPath, fillColor: key }, selectedPath.id);
                      }
                    }}
                  />
                ))}
                <IconButton
                  label="No shape fill"
                  className="h-full w-full"
                  onClick={() => {
                    setPathFillColor(null);
                    if (selectedPath) {
                      // Rebuilt without the key: an explicit `undefined` would
                      // still be a property, and the write path rejects one.
                      const rest = { ...selectedPath };
                      delete rest.fillColor;
                      replacePath(rest, selectedPath.id);
                    }
                  }}
                >
                  <X aria-hidden="true" size={13} />
                </IconButton>
              </div>
            </>
          ) : null}

          {selectedPath ? (
            <div className="mt-2 flex gap-1.5">
              <Button variant="secondary" onClick={() => setPathEditing((current) => !current)}>
                {pathEditing ? 'Done editing points' : 'Edit points'}
              </Button>
              {pathEditing && selectedAnchor !== null ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    replacePath(toggleAnchorSmooth(selectedPath, selectedAnchor), selectedPath.id)
                  }
                >
                  {isSmoothAnchor(selectedPath.anchors[selectedAnchor]!)
                    ? 'Make corner'
                    : 'Make curve'}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-rt-ink-faint">
              Click a line to move it · double-click to edit its points
            </p>
          )}
        </fieldset>
      </div>
    );
  }

  function renderShapeOptions() {
    return (
      <div className="w-full">
        <fieldset>
          <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            Elements
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-1.5 md:grid-cols-2">
            {DIAGRAM_NODE_SHAPES.filter((shape) => shape !== 'text').map((shape) => {
              const ShapeIcon = SHAPE_ICONS[shape];
              const disabled = nodes.length >= DIAGRAM_NODE_LIMIT || isSubmitting;
              return (
                <button
                  key={shape}
                  type="button"
                  draggable={!disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DIAGRAM_SHAPE_MEDIA_TYPE, shape);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => addElement(shape)}
                  disabled={disabled}
                  aria-label={`Add ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`}
                  title={`Click to place a ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}, or drag it onto the canvas`}
                  className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-rt-tertiary bg-rt-surface px-1 py-1.5 text-[10px] font-semibold text-rt-ink-muted transition-colors hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ShapeIcon aria-hidden="true" size={16} />
                  {DIAGRAM_SHAPE_LABELS[shape]}
                </button>
              );
            })}
            {/* A line makes a form, so it belongs with the shapes — but unlike
                them it is a tool you draw with, not a node you place. */}
            <button
              type="button"
              aria-label="Line"
              aria-pressed={canvasTool === 'line'}
              disabled={isSubmitting}
              onClick={() => selectCanvasTool('line')}
              title="Draw a straight line; hold Shift to constrain the angle"
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${
                canvasTool === 'line'
                  ? 'border-rt-primary bg-rt-primary-tint text-rt-ink'
                  : 'border-rt-tertiary bg-rt-surface text-rt-ink-muted hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink'
              }`}
            >
              <Minus aria-hidden="true" size={16} />
              Line
            </button>
          </div>
        </fieldset>
      </div>
    );
  }

  function renderTableOptions() {
    return (
      <div className="w-full">
        <fieldset className="mb-4">
          <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            New table
          </legend>
          {/* The grid is the quick way to pick a size; the two number inputs
                beside it are the same choice for anyone not using a pointer. */}
          <div
            className="mt-2 grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${TABLE_PICKER_COLS}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLS }, (_, index) => {
              const row = Math.floor(index / TABLE_PICKER_COLS) + 1;
              const col = (index % TABLE_PICKER_COLS) + 1;
              const covered = row <= tableRows && col <= tableCols;
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`${row} by ${col} table`}
                  onPointerEnter={() => {
                    setTableRows(row);
                    setTableCols(col);
                  }}
                  onClick={() => {
                    setTableRows(row);
                    setTableCols(col);
                    // Clicking a size is the whole gesture: the table lands in
                    // the middle of what is on screen rather than asking for a
                    // second click to say where.
                    placeTable(
                      {
                        x: view.x + view.width / 2 - (col * TABLE_DEFAULT_COL_WIDTH) / 2,
                        y: view.y + view.height / 2 - (row * TABLE_DEFAULT_ROW_HEIGHT) / 2,
                      },
                      row,
                      col,
                    );
                  }}
                  className={`aspect-square rounded-[2px] border ${
                    covered
                      ? 'border-rt-primary bg-rt-primary-tint'
                      : 'border-rt-tertiary bg-rt-surface'
                  }`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="flex flex-1 items-center gap-1 text-[11px] text-rt-ink-muted">
              Rows
              <input
                type="number"
                min={1}
                max={TABLE_MAX_ROWS}
                value={tableRows}
                onChange={(event) =>
                  setTableRows(Math.max(1, Math.min(TABLE_MAX_ROWS, Number(event.target.value))))
                }
                className="w-full rounded border border-rt-tertiary px-1 py-0.5 text-[11px]"
              />
            </label>
            <label className="flex flex-1 items-center gap-1 text-[11px] text-rt-ink-muted">
              Cols
              <input
                type="number"
                min={1}
                max={TABLE_MAX_COLS}
                value={tableCols}
                onChange={(event) =>
                  setTableCols(Math.max(1, Math.min(TABLE_MAX_COLS, Number(event.target.value))))
                }
                className="w-full rounded border border-rt-tertiary px-1 py-0.5 text-[11px]"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[10px] text-rt-ink-faint">
            {tableRows} × {tableCols} — click a size to place it, or the canvas
          </p>
        </fieldset>
      </div>
    );
  }

  function renderTemplateOptions() {
    return (
      <div className="w-full">
        <fieldset className="mb-4">
          <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            Start from
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-1.5 md:grid-cols-2">
            {STUDIO_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                title={template.hint}
                disabled={isSubmitting}
                onClick={() => applyTemplate(template)}
                className="min-h-9 rounded-lg border border-dashed border-rt-tertiary bg-rt-surface px-2 text-[11px] font-semibold text-rt-ink-muted transition-colors hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
              >
                {template.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  function surfaceBounds() {
    const canvas = canvasRef.current;
    if (!canvas) return { left: 0, top: 0, width: 0, height: 0 };
    const bounds = canvas.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  }

  /** Ink and paint order travel with the nodes and edges in one history entry. */
  function commitInk(nextInk: StudioInkStroke[], nextOrder?: string[]) {
    const graph = history.snapshotRef.current;
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      ink: nextInk,
      ...(nextOrder ? { z: nextOrder } : {}),
    });
  }

  function beginStroke(event: PointerEvent<SVGSVGElement>) {
    const stroke: StudioInkStroke = {
      id: createInkId(),
      points: [surfacePoint(event)],
      strokeColor: inkColor,
      strokeWidthPreset: inkWidth,
    };
    activeStrokeRef.current = stroke;
    setActiveStroke(stroke);
  }

  function extendStroke(event: PointerEvent<SVGSVGElement>) {
    const current = activeStrokeRef.current;
    if (!current) return;
    const next = { ...current, points: [...current.points, surfacePoint(event)] };
    activeStrokeRef.current = next;
    setActiveStroke(next);
  }

  /**
   * A finished stroke goes on top. When the diagram already carries an explicit
   * order the new id has to be appended to it, because anything `z` does not
   * name is painted underneath what it does.
   */
  function finishStroke() {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setActiveStroke(null);
    if (!stroke) return;

    const existingOrder = history.snapshotRef.current.z;
    commitInk(
      [...(history.snapshotRef.current.ink ?? []), stroke],
      existingOrder ? [...existingOrder, stroke.id] : undefined,
    );
  }

  function eraseAt(event: PointerEvent<SVGSVGElement>) {
    const graph = history.snapshotRef.current;
    const current = graph.ink ?? [];
    const radius = eraserRadiusForView(viewRef.current, surfaceBounds());
    const remaining = eraseInkAtPoint(current, surfacePoint(event), radius);
    if (remaining.length === current.length) return;

    const kept = new Set(remaining.map((stroke) => stroke.id));
    const removed = new Set(
      current.filter((stroke) => !kept.has(stroke.id)).map((stroke) => stroke.id),
    );
    history.preview({
      nodes: graph.nodes,
      edges: graph.edges,
      ink: remaining,
      ...(graph.z ? { z: graph.z.filter((key) => !removed.has(key)) } : {}),
    });
  }

  function onCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (isSubmitting) return;
    lastNodePressRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus();

    // Middle mouse or Space+drag pans; both leave the diagram itself untouched.
    if (event.button === 1 || (event.button === 0 && panReady)) {
      event.preventDefault();
      panRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startView: viewRef.current,
      };
      setIsPanning(true);
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) return;

    if (connectionMode) {
      setSelectedIds([]);
      setSelectedEdgeKey(null);
      return;
    }

    if (canvasTool === 'table') {
      clearTableSelection();
      event.preventDefault();
      placeTable(surfacePoint(event));
      return;
    }

    // The pen and line tools own a press on the canvas background.
    if (canvasTool === 'pen' || canvasTool === 'line') {
      event.preventDefault();
      clearError();
      canvas.setPointerCapture(event.pointerId);
      pathPointerRef.current = event.pointerId;
      clearAllSelection();

      const raw = surfacePoint(event);
      const anchors = pathAnchorsRef.current;

      // Landing back on the first anchor closes the shape and finishes it.
      // Pressing the first anchor arms the close but does not finish it: the
      // drag that follows shapes the closing curve, exactly as a drag on any
      // other anchor does. It lands on pointer-up.
      if (canvasTool === 'pen' && isNearFirstAnchor(anchors, raw, closeTolerance())) {
        pathClosingRef.current = true;
        return;
      }

      const placed = nextAnchorPoint(anchors, raw, event.shiftKey);
      const next = canvasTool === 'line' ? [{ x: placed.x, y: placed.y }] : [...anchors, placed];
      setPathAnchors(next);
      pathAnchorsRef.current = next;
      setPathCursor(placed);
      return;
    }

    // The ink tools own a press on the canvas background; everything below this
    // point (marquee, selection) is the original `select` behaviour.
    if (canvasTool !== 'select') {
      event.preventDefault();
      clearError();
      inkPointerRef.current = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      clearAllSelection();

      if (canvasTool === 'erase') {
        // The whole erase gesture is one undo step, so the pre-gesture snapshot
        // is held and recorded when the pointer lifts.
        eraseStartRef.current = history.snapshotRef.current;
        eraseAt(event);
      } else {
        beginStroke(event);
      }
      return;
    }

    const origin = surfacePoint(event);
    const base = event.shiftKey ? currentSelection() : null;
    const session: MarqueeSession = {
      pointerId: event.pointerId,
      origin,
      current: origin,
      base,
    };
    marqueeRef.current = session;
    setMarquee(session);
    canvas.setPointerCapture(event.pointerId);
    if (!event.shiftKey) clearAllSelection();
  }

  function updatePan(event: PointerEvent<SVGSVGElement>): boolean {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return true;
    setView(
      panDiagramView(pan.startView, {
        x: ((event.clientX - pan.startClient.x) / bounds.width) * pan.startView.width,
        y: ((event.clientY - pan.startClient.y) / bounds.height) * pan.startView.height,
      }),
    );
    return true;
  }

  function onCanvasPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (updatePan(event)) return;
    if (updateResize(event)) return;
    if (updateElementMove(event)) return;
    if (updatePathEdit(event)) return;
    if (updateTableResize(event)) return;

    if (inkPointerRef.current === event.pointerId) {
      event.preventDefault();
      if (canvasTool === 'erase') eraseAt(event);
      else extendStroke(event);
      return;
    }

    if (canvasTool === 'pen' || canvasTool === 'line') {
      const raw = surfacePoint(event);
      const anchors = pathAnchorsRef.current;

      // While the button is down the drag pulls the last anchor's handles out,
      // turning the corner just placed into a curve. The line tool aims its far
      // end instead: it only ever has the one segment.
      if (pathPointerRef.current === event.pointerId && anchors.length > 0) {
        event.preventDefault();
        if (canvasTool === 'line') {
          setPathCursor(nextAnchorPoint(anchors, raw, event.shiftKey));
          return;
        }
        // While closing, the drag shapes the *first* anchor's handles, which is
        // what the closing segment arrives along.
        const index = pathClosingRef.current ? 0 : anchors.length - 1;
        const next = [...anchors];
        next[index] = anchorWithDraggedHandle(anchors[index]!, raw);
        setPathAnchors(next);
        pathAnchorsRef.current = next;
        return;
      }

      // Button up: aim the next segment, and say when it would close the shape.
      setCloseHover(canvasTool === 'pen' && isNearFirstAnchor(anchors, raw, closeTolerance()));
      setPathCursor(nextAnchorPoint(anchors, raw, event.shiftKey));
      return;
    }

    const session = marqueeRef.current;
    if (session && session.pointerId === event.pointerId) {
      const next = { ...session, current: surfacePoint(event) };
      marqueeRef.current = next;
      setMarquee(next);
      return;
    }

    if (connectionMode) setConnectionPointer(surfacePoint(event));
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = surfacePoint(event);
    const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };
    if (Math.abs(delta.x) >= DRAG_THRESHOLD || Math.abs(delta.y) >= DRAG_THRESHOLD) {
      drag.moved = true;
    }
    const graph = history.snapshotRef.current;
    const moved = moveNodesBy(graph.nodes, drag.origins, delta, drag.anchorId, snapEnabled);
    history.preview({ nodes: moved, edges: graph.edges });
    setDropTargetId(dropContainerFor(drag, moved)?.id ?? null);
  }

  function endPan(event: PointerEvent<SVGSVGElement>): boolean {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return false;
    updatePan(event);
    panRef.current = null;
    setIsPanning(false);
    releaseCapture(event);
    return true;
  }

  function endMarquee(event: PointerEvent<SVGSVGElement>): boolean {
    const session = marqueeRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    const rect = normalizeRect(session.origin, surfacePoint(event));
    marqueeRef.current = null;
    setMarquee(null);
    releaseCapture(event);

    // A plain click sweeps nothing; the selection was already cleared on press.
    if (rect.width < 1 && rect.height < 1) return true;
    const swept = studioElementsInRect(history.snapshotRef.current, rect);
    applySelection(session.base ? mergeSelections(session.base, swept) : swept);
    return true;
  }

  function releaseCapture(event: PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function endInk(event: PointerEvent<SVGSVGElement>): boolean {
    if (inkPointerRef.current !== event.pointerId) return false;
    inkPointerRef.current = null;

    if (canvasTool === 'erase') {
      const previous = eraseStartRef.current;
      eraseStartRef.current = null;
      // One undo step for the whole sweep, however many strokes it took out.
      if (previous) history.recordPreview(previous);
    } else {
      finishStroke();
    }

    releaseCapture(event);
    return true;
  }

  function endPath(event: PointerEvent<SVGSVGElement>): boolean {
    if (pathPointerRef.current !== event.pointerId) return false;
    pathPointerRef.current = null;
    releaseCapture(event);

    // The close lands here, so a press-and-drag on the first anchor curves the
    // closing segment before the shape is sealed.
    if (pathClosingRef.current) {
      pathClosingRef.current = false;
      commitPathDraft(pathAnchorsRef.current, true);
      return true;
    }

    // One drag is the whole line tool: it finishes where the pointer lifts.
    if (canvasTool === 'line') {
      const anchors = pathAnchorsRef.current;
      const start = anchors[0];
      const end = pathCursor;
      if (start && end && (start.x !== end.x || start.y !== end.y)) {
        commitPathDraft([start, { x: end.x, y: end.y }], false);
      } else {
        clearPathDraft();
      }
    }
    return true;
  }

  function onCanvasPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (endPan(event)) return;
    if (endElementMove(event)) return;
    if (endPathEdit(event)) return;
    if (endTableResize(event)) return;
    if (endPath(event)) return;
    if (endResize(event)) return;
    if (endInk(event)) return;
    if (endMarquee(event)) return;

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onCanvasPointerMove(event);

    // Where the group came to rest decides its container, so grouping lands in
    // the same history entry as the move.
    if (drag.moved) {
      const graph = history.snapshotRef.current;
      const target = dropContainerFor(drag, graph.nodes);
      const roots = draggedSelectionRoots(graph.nodes, Object.keys(drag.origins));
      const reparented = reparentNodes(graph.nodes, roots, target?.id ?? null);
      if (reparented.some((node, index) => node !== graph.nodes[index])) {
        history.preview({ nodes: reparented, edges: graph.edges });
      }
    }

    setDropTargetId(null);
    history.recordPreview(drag.previous);
    dragRef.current = null;
    releaseCapture(event);

    // Clicking one member of a multi-selection without moving it means "just
    // this one", the same as it does in every other canvas editor.
    if (!drag.moved && Object.keys(drag.origins).length > 1) {
      setSelectedIds([drag.anchorId]);
    }
  }

  function onLostPointerCapture(event: PointerEvent<SVGSVGElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setIsPanning(false);
    }
    // A pen draft survives losing capture: the path is still being built and
    // the next click continues it. Only the line tool, which is one gesture
    // start to finish, is resolved here.
    if (pathPointerRef.current === event.pointerId) {
      pathPointerRef.current = null;
      if (canvasTool === 'line') clearPathDraft();
    }
    const move = elementMoveRef.current;
    if (move?.pointerId === event.pointerId) {
      if (move.moved) history.recordPreview(move.previous);
      elementMoveRef.current = null;
    }
    const tableResize = tableResizeRef.current;
    if (tableResize?.pointerId === event.pointerId) {
      history.recordPreview(tableResize.previous);
      tableResizeRef.current = null;
    }
    const pathEdit = pathEditRef.current;
    if (pathEdit?.pointerId === event.pointerId) {
      history.recordPreview(pathEdit.previous);
      pathEditRef.current = null;
    }
    // Losing capture mid-gesture must still land the work, not discard it: a
    // half-drawn stroke is committed exactly as `pointerup` would commit it.
    if (inkPointerRef.current === event.pointerId) {
      inkPointerRef.current = null;
      if (canvasTool === 'erase') {
        const previous = eraseStartRef.current;
        eraseStartRef.current = null;
        if (previous) history.recordPreview(previous);
      } else {
        finishStroke();
      }
    }
    const resize = resizeRef.current;
    if (resize?.pointerId === event.pointerId) {
      history.recordPreview(resize.previous);
      resizeRef.current = null;
    }
    if (marqueeRef.current?.pointerId === event.pointerId) {
      marqueeRef.current = null;
      setMarquee(null);
    }
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      history.recordPreview(drag.previous);
      dragRef.current = null;
      setDropTargetId(null);
    }
  }

  function onCanvasDragOver(event: DragEvent<SVGSVGElement>) {
    if (isSubmitting) return;
    if (!event.dataTransfer?.types?.includes(DIAGRAM_SHAPE_MEDIA_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onCanvasDrop(event: DragEvent<SVGSVGElement>) {
    if (isSubmitting) return;
    const shape = event.dataTransfer?.getData(DIAGRAM_SHAPE_MEDIA_TYPE) as DiagramNodeShape | '';
    if (!shape || !DIAGRAM_NODE_SHAPES.includes(shape)) return;
    event.preventDefault();
    const point = surfacePoint(event);
    const size = diagramNodeSize(shape);
    addElement(
      shape,
      { x: point.x - size.width / 2, y: point.y - size.height / 2 },
      containerAtPoint(history.snapshotRef.current.nodes, point)?.id ?? null,
    );
  }

  function nudgeSelection(offset: DiagramPoint) {
    const graph = history.snapshotRef.current;
    const inkGoing = new Set(selectedInkIds);
    const pathGoing = new Set(selectedPathIds);
    const tableGoing = new Set(selectedTableIds);

    history.commit({
      // Nodes keep their own mover: it understands snapping and containers.
      nodes:
        selectedIds.length > 0
          ? moveNodesBy(
              graph.nodes,
              nodeOrigins(graph.nodes, selectedIds),
              offset,
              selectedIds[0]!,
              snapEnabled,
            )
          : graph.nodes,
      edges: graph.edges,
      ink: (graph.ink ?? []).map((stroke) =>
        inkGoing.has(stroke.id)
          ? {
              ...stroke,
              points: stroke.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })),
            }
          : stroke,
      ),
      paths: (graph.paths ?? []).map((path) =>
        pathGoing.has(path.id) ? movePathBy(path, offset.x, offset.y) : path,
      ),
      tables: (graph.tables ?? []).map((table) =>
        tableGoing.has(table.id) ? moveTableBy(table, offset.x, offset.y) : table,
      ),
    });
  }

  function onCanvasKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (isSubmitting) return;

    // Held Space arms panning; the keyup below disarms it. Auto-repeat lands here
    // too, which is why this returns rather than falling through to the shortcuts.
    if (event.key === ' ') {
      event.preventDefault();
      setPanReady(true);
      return;
    }

    if (event.key === 'Enter' && selectedNode) {
      event.preventDefault();
      beginInlineNodeEdit(selectedNode);
      return;
    }

    // A selected table takes the navigation and typing keys first: inside a grid
    // the arrows move between cells rather than nudging an element.
    if (selectedTable && cellRange && !editingCell) {
      const cell = activeCell();
      const withModifier = event.ctrlKey || event.metaKey || event.altKey;
      const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'];
      if (cell && navKeys.includes(event.key) && !withModifier) {
        event.preventDefault();
        // Enter on a cell opens it for editing rather than moving on; Tab and
        // the arrows move, which is how a spreadsheet behaves.
        if (event.key === 'Enter') {
          cellEditSelectAllRef.current = true;
          setEditingCell(cell);
          return;
        }
        const next = moveTableSelection(
          selectedTable,
          cell,
          event.key as TableNavKey,
          event.shiftKey,
        );
        setCellRange(
          event.shiftKey && event.key.startsWith('Arrow')
            ? { anchor: cellRange.anchor, focus: next }
            : { anchor: next, focus: next },
        );
        return;
      }

      if (cell && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        replaceTable(clearCellRange(selectedTable, cellRange), selectedTable.id);
        return;
      }

      // Typing replaces the cell, exactly as it does in a spreadsheet.
      if (cell && !withModifier && event.key.length === 1) {
        event.preventDefault();
        replaceTable(
          setCell(selectedTable, cell.row, cell.col, { text: event.key }),
          selectedTable.id,
        );
        cellEditSelectAllRef.current = false;
        setEditingCell(cell);
        return;
      }
    }

    if (event.key === 'Escape') {
      // One step out at a time: leave the element first, drop it second.
      if (pathEditing || tableEditing) {
        event.preventDefault();
        setPathEditing(false);
        setTableEditing(false);
        setCellRange(null);
        return;
      }
      if (!isSelectionEmpty(currentSelection())) {
        event.preventDefault();
        clearAllSelection();
        return;
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      // A mixed selection goes as one, before any single-element handling.
      const selection = currentSelection();
      if (selectionSize(selection) > 1 || selection.inkIds.length > 0) {
        deleteSelection();
        return;
      }
      if (selection.tableIds.length === 1 && !tableEditing) {
        deleteSelection();
        return;
      }
      // With a path selected, Delete takes the anchor in hand if there is one
      // and the whole path otherwise — and a path too short to lose an anchor
      // goes entirely rather than being left as a stub.
      if (selectedPath) {
        const next = selectedAnchor === null ? null : removeAnchor(selectedPath, selectedAnchor);
        replacePath(next, selectedPath.id);
        if (!next) clearPathSelection();
        else setSelectedAnchor(null);
        return;
      }
      if (selectedEdge) removeSelectedEdge();
      else removeSelectedNodes();
      return;
    }

    // Enter toggles the selected anchor between a corner and a curve, the same
    // thing double-clicking it does.
    if (event.key === 'Enter' && selectedPath && selectedAnchor !== null) {
      event.preventDefault();
      replacePath(toggleAnchorSmooth(selectedPath, selectedAnchor), selectedPath.id);
      return;
    }

    if (isSelectionEmpty(currentSelection())) return;

    const delta = event.shiftKey ? DIAGRAM_GRID * 2 : DIAGRAM_GRID;
    const offsetByKey: Partial<Record<string, DiagramPoint>> = {
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
      ArrowDown: { x: 0, y: delta },
    };
    const offset = offsetByKey[event.key];
    if (!offset) return;

    event.preventDefault();
    nudgeSelection(offset);
  }

  function onCanvasKeyUp(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === ' ') setPanReady(false);
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // A path in hand takes Escape and Enter before anything else does: while the
    // pen is mid-path they mean "finish this", not "close the editor".
    if ((event.key === 'Escape' || event.key === 'Enter') && pathAnchorsRef.current.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      finishPenDraft();
      return;
    }

    if (event.key === 'Escape' && pendingContainerDelete) {
      event.preventDefault();
      event.stopPropagation();
      setPendingContainerDelete(null);
      return;
    }

    if (event.key === 'Escape' && connectionMode) {
      event.preventDefault();
      event.stopPropagation();
      cancelConnection();
      return;
    }

    const target = event.target;
    const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const withModifier = event.ctrlKey || event.metaKey;

    if (!isTextInput && withModifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoDiagram();
      else undoDiagram();
      return;
    }

    if (!isTextInput && withModifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoDiagram();
      return;
    }

    if (!isTextInput && withModifier && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        const graph = history.snapshotRef.current;
        applySelection({
          nodeIds: graph.nodes.map((node) => node.id),
          inkIds: (graph.ink ?? []).map((stroke) => stroke.id),
          pathIds: (graph.paths ?? []).map((path) => path.id),
          tableIds: (graph.tables ?? []).map((table) => table.id),
        });
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }
      if (key === 'v') {
        event.preventDefault();
        pasteFragment(clipboard);
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }
    }

    if (event.key === 'Enter' && withModifier) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dragRef.current) {
      setValidationError('Finish moving the element before proposing.');
      return;
    }
    if (resizeRef.current) {
      setValidationError('Finish resizing the element before proposing.');
      return;
    }
    if (connectionMode) {
      setValidationError('Finish or cancel the arrow before proposing.');
      return;
    }
    // A path in hand is uncommitted work. Proposing over it would drop it
    // without saying so, which is the one thing a submit must never do.
    if (pathAnchorsRef.current.length > 0) {
      setValidationError('Finish the path with Enter or Esc before proposing.');
      return;
    }
    if (editingNodeId) finishInlineNodeEdit();
    normalizeSelectedLabel();
    normalizeSelectedEdgeLabel();
    const graph = history.snapshotRef.current;
    const prepared = prepareDiagram(
      graph.nodes,
      graph.edges,
      graph.ink ?? [],
      graph.z ?? [],
      graph.paths ?? [],
      graph.tables ?? [],
    );
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }

    setValidationError(null);
    await submitArtifact(prepared.artifact);
  }

  if (submissionStatus === 'success') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-rt-surface-sunken px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rt-primary-tint text-rt-primary-deep">
          <CheckCircle2 aria-hidden="true" size={28} strokeWidth={1.7} />
        </span>
        <div>
          <h2 className="text-[20px] font-semibold text-rt-ink">Studio canvas proposed</h2>
          <p role="status" className="mt-1 text-[13px] text-rt-ink-muted">
            It is now on the shared pinboard.
          </p>
        </div>
        <Button onClick={closeTool}>Back to pinboard</Button>
      </div>
    );
  }

  const error = validationError ?? submissionError;
  const canAlign = selectedIds.length >= 2 && !isSubmitting;
  const canDistribute = selectedIds.length >= 3 && !isSubmitting;
  const canvasCursor = isPanning
    ? 'cursor-grabbing'
    : panReady
      ? 'cursor-grab'
      : canvasTool === 'draw'
        ? 'cursor-crosshair'
        : canvasTool === 'erase'
          ? 'cursor-cell'
          : 'cursor-default';

  function renderEdge(edge: DiagramEdge, index: number) {
    const from = nodes.find((node) => node.id === edge.from);
    const to = nodes.find((node) => node.id === edge.to);
    const route = edgeRoutes[index];
    if (!from || !to || !route) return null;
    const selected = selectedEdgeKey === edgeKey(edge);
    const strokeWidth = diagramEdgeStrokeWidth(edge, LEGACY_EDGE_STROKE_WIDTH);
    const stroke = diagramEdgeStroke(edge);
    const dash = diagramEdgeDash(edge, strokeWidth);
    return (
      <g
        key={edgeKey(edge)}
        role="button"
        aria-label={`Arrow from ${from.label} to ${to.label}`}
        tabIndex={-1}
        className="cursor-pointer"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          canvasRef.current?.focus();
          lastNodePressRef.current = null;
          cancelConnection();
          setSelectedIds([]);
          setSelectedEdgeKey(edgeKey(edge));
        }}
      >
        {/* The hit target follows the same path, so a bowed arrow is
                    grabbable where it is actually drawn. */}
        <path d={route.path} fill="none" stroke="transparent" strokeWidth={18} />
        <path
          d={route.path}
          fill="none"
          stroke={selected ? SELECTION_ACCENT : stroke}
          strokeWidth={selected ? Math.max(3, strokeWidth + 1) : strokeWidth}
          markerEnd={`url(#${selected ? 'diagram-editor-arrow-selected' : edgeArrowId(stroke)})`}
          pointerEvents="none"
          {...dash}
        />
        {edge.label ? (
          <text
            x={route.labelX}
            y={route.labelY}
            textAnchor="middle"
            fill="#5A5F68"
            stroke="#FFFFFF"
            strokeWidth={4}
            paintOrder="stroke"
            style={{ fontSize: '11px', fontFamily: 'Inter, system-ui, sans-serif' }}
            pointerEvents="none"
          >
            {edge.label}
          </text>
        ) : null}
      </g>
    );
  }

  function renderPath(path: PathElement, key?: string, isDraft = false) {
    const strokeWidth = pathStrokeWidth(path);
    const selected = !isDraft && selectedPathIds.includes(path.id);

    return (
      <g key={key ?? path.id}>
        <path
          data-testid="studio-path"
          d={pathSvgData(path)}
          fill={pathFill(path)}
          stroke={pathStrokeColor(path)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
          {...diagramEdgeDash(path, strokeWidth)}
        />
        {/* A hairline is impossible to hit, so selection uses a wide invisible
            stroke over the same outline. */}
        {!isDraft && canvasTool === 'select' ? (
          <path
            role="button"
            aria-label={`Path with ${path.anchors.length} points`}
            d={pathSvgData(path)}
            // A filled shape is grabbable anywhere inside it, which is where
            // anyone would reach for it. An unfilled outline stays outline-only,
            // so a click inside an empty shape still reaches whatever is behind.
            fill={path.closed && path.fillColor ? 'transparent' : 'none'}
            pointerEvents={path.closed && path.fillColor ? 'all' : 'stroke'}
            stroke="transparent"
            strokeWidth={Math.max(strokeWidth, 14)}
            className="cursor-pointer"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              canvasRef.current?.focus({ preventScroll: true });

              // Inside the path, an anchor under the pointer is what is grabbed.
              if (pathEditing && selectedPathId === path.id) {
                const hit = anchorAtPoint(path, surfacePoint(event), closeTolerance());
                if (hit !== null) {
                  beginPathEdit(event, path, hit, null);
                  return;
                }
              }

              if (event.shiftKey) {
                toggleStudioSelection('path', path.id);
                return;
              }

              const press: NodePress = {
                key: path.id,
                time: event.timeStamp,
                clientX: event.clientX,
                clientY: event.clientY,
              };
              if (isDoublePress(lastNodePressRef.current, path.id, press)) {
                lastNodePressRef.current = null;
                selectPath(path.id);
                setPathEditing(true);
                return;
              }
              lastNodePressRef.current = press;

              selectPath(path.id);
              beginElementMove(event, 'path', path.id);
            }}
          />
        ) : null}
        {selected && !pathEditing ? (
          <path
            d={pathSvgData(path)}
            fill="none"
            stroke={SELECTION_ACCENT}
            strokeWidth={Math.max(strokeWidth + 3, 5)}
            strokeOpacity={0.28}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ) : null}
        {selected && pathEditing
          ? path.anchors.map((anchor, index) => (
              <g key={`${path.id}-anchor-${index}`}>
                {(['in', 'out'] as const).map((side) => {
                  if (!anchor[side]) return null;
                  const handle = pathHandlePoint(anchor, side);
                  return (
                    <g key={side}>
                      <line
                        x1={anchor.x}
                        y1={anchor.y}
                        x2={handle.x}
                        y2={handle.y}
                        stroke={SELECTION_ACCENT}
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                      <circle
                        role="button"
                        aria-label={`Curve handle ${side} of point ${index + 1}`}
                        cx={handle.x}
                        cy={handle.y}
                        r={9}
                        fill="transparent"
                        className="cursor-grab"
                        onPointerDown={(event) => beginPathEdit(event, path, index, side)}
                      />
                      <circle
                        cx={handle.x}
                        cy={handle.y}
                        r={3}
                        fill={SELECTION_ACCENT}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
                <circle
                  role="button"
                  aria-label={`Point ${index + 1} of ${path.anchors.length}`}
                  cx={anchor.x}
                  cy={anchor.y}
                  r={9}
                  fill="transparent"
                  className="cursor-move"
                  onPointerDown={(event) => {
                    const key = `${path.id}:anchor:${index}`;
                    const press: NodePress = {
                      key,
                      time: event.timeStamp,
                      clientX: event.clientX,
                      clientY: event.clientY,
                    };
                    // Same reason as everywhere else on this canvas: pointer
                    // capture means `dblclick` never reaches the element.
                    if (isDoublePress(lastNodePressRef.current, key, press)) {
                      event.preventDefault();
                      event.stopPropagation();
                      lastNodePressRef.current = null;
                      replacePath(toggleAnchorSmooth(path, index), path.id);
                      return;
                    }
                    lastNodePressRef.current = press;
                    beginPathEdit(event, path, index, null);
                  }}
                />
                <circle
                  cx={anchor.x}
                  cy={anchor.y}
                  r={4}
                  fill={selectedAnchor === index ? SELECTION_ACCENT : '#FFFFFF'}
                  stroke={SELECTION_ACCENT}
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              </g>
            ))
          : null}
      </g>
    );
  }

  function renderTable(table: TableElement) {
    const cols = tableColCount(table);
    const colOffsets = tableColumnOffsets(table);
    const rowOffsets = tableRowOffsets(table);
    const size = tableSize(table);
    const stroke = tableStrokeColor(table);
    const strokeWidth = tableStrokeWidth(table);
    const selected = selectedTableIds.includes(table.id);

    return (
      <g key={table.id} transform={`translate(${table.x}, ${table.y})`}>
        {table.cells.map((_, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          const cell = tableCellAt(table, row, col);
          const x = colOffsets[col] ?? 0;
          const y = rowOffsets[row] ?? 0;
          const width = table.colWidths[col] ?? 0;
          const height = table.rowHeights[row] ?? 0;
          const lines = tableCellLines(table, cell, col, row);
          const fontSize = tableCellFontSize(table, cell);
          const lineHeight = fontSize * 1.25;
          const align = cell?.align ?? 'left';
          const textX =
            align === 'center'
              ? x + width / 2
              : align === 'right'
                ? x + width - TABLE_CELL_PADDING
                : x + TABLE_CELL_PADDING;
          const inRange = cellRange ? isCellInRange(cellRange, row, col) : false;
          const isEditing =
            editingCell !== null && editingCell.row === row && editingCell.col === col;

          return (
            <g key={`${table.id}-${row}-${col}`}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={tableCellFill(table, cell, row)}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
              {selected && tableEditing && inRange ? (
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill="rgba(224,163,60,0.16)"
                  pointerEvents="none"
                />
              ) : null}
              {isEditing ? (
                <foreignObject
                  x={x + 1}
                  y={y + 1}
                  width={Math.max(10, width - 2)}
                  height={Math.max(10, height - 2)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="flex h-full w-full items-center px-0.5">
                    <input
                      ref={cellInputRef}
                      aria-label={`Cell row ${row + 1} column ${col + 1}`}
                      defaultValue={cell?.text ?? ''}
                      maxLength={TABLE_CELL_TEXT_LIMIT}
                      onBlur={(event) => {
                        if (cellEditCancelledRef.current) {
                          cellEditCancelledRef.current = false;
                          return;
                        }
                        commitCellText(table, { row, col }, event.target.value);
                        setEditingCell(null);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          // Escape abandons the edit and keeps what was there.
                          cellEditCancelledRef.current = true;
                          setEditingCell(null);
                          canvasRef.current?.focus({ preventScroll: true });
                          return;
                        }
                        if (event.key === 'Enter' || event.key === 'Tab') {
                          event.preventDefault();
                          commitCellText(table, { row, col }, event.currentTarget.value);
                          const next = moveTableSelection(
                            table,
                            { row, col },
                            event.key as TableNavKey,
                            event.shiftKey,
                          );
                          setEditingCell(null);
                          setCellRange({ anchor: next, focus: next });
                          canvasRef.current?.focus({ preventScroll: true });
                        }
                      }}
                      className="h-full w-full rounded-sm border border-rt-primary-deep bg-white px-1 text-[11px] text-rt-ink outline-none select-text"
                    />
                  </div>
                </foreignObject>
              ) : (
                <>
                  <text
                    fill={tableCellColor(cell)}
                    textAnchor={align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'}
                    style={{
                      fontSize: `${fontSize}px`,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontWeight: tableCellBold(table, cell, row) ? 600 : 400,
                    }}
                    pointerEvents="none"
                  >
                    {lines.map((line, lineIndex) => (
                      <tspan
                        key={line + String(lineIndex)}
                        x={textX}
                        y={
                          y +
                          height / 2 +
                          fontSize / 3 -
                          ((lines.length - 1) * lineHeight) / 2 +
                          lineIndex * lineHeight
                        }
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                  {canvasTool === 'select' ? (
                    <rect
                      role="button"
                      aria-label={`Cell row ${row + 1} column ${col + 1}`}
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill="transparent"
                      className="cursor-cell"
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        canvasRef.current?.focus({ preventScroll: true });

                        // Outside cell mode, shift builds a selection of
                        // whole tables rather than a range of cells.
                        if (event.shiftKey && (!tableEditing || selectedTableId !== table.id)) {
                          toggleStudioSelection('table', table.id);
                          return;
                        }

                        const press: NodePress = {
                          key: `${table.id}:${row}:${col}`,
                          time: event.timeStamp,
                          clientX: event.clientX,
                          clientY: event.clientY,
                        };
                        const isSecond = isDoublePress(
                          lastNodePressRef.current,
                          `${table.id}:${row}:${col}`,
                          press,
                        );
                        lastNodePressRef.current = isSecond ? null : press;

                        if (isSecond) {
                          setSelectedTableIds([table.id]);
                          // First double-click goes inside the table; a second,
                          // already inside, opens the cell for typing.
                          if (tableEditing) {
                            cellEditSelectAllRef.current = true;
                            setEditingCell({ row, col });
                          } else setTableEditing(true);
                          setCellRange({ anchor: { row, col }, focus: { row, col } });
                          return;
                        }

                        // Outside cell mode a press grabs the whole table.
                        if (!tableEditing || selectedTableId !== table.id) {
                          selectTable(table.id);
                          beginElementMove(event, 'table', table.id);
                          return;
                        }
                        selectCell(table, row, col, event.shiftKey);
                      }}
                    />
                  ) : null}
                </>
              )}
            </g>
          );
        })}

        {selected ? (
          <>
            <rect
              x={-1}
              y={-1}
              width={size.width + 2}
              height={size.height + 2}
              fill="none"
              stroke={SELECTION_ACCENT}
              strokeWidth={1.5}
              pointerEvents="none"
            />
            {/* Resizing is an inside-the-table gesture, like editing a cell. */}
            {tableEditing
              ? table.colWidths.map((_, col) => (
                  <rect
                    key={`col-grip-${col}`}
                    role="button"
                    aria-label={`Resize column ${col + 1}`}
                    x={(colOffsets[col + 1] ?? 0) - 3}
                    y={0}
                    width={6}
                    height={size.height}
                    fill="transparent"
                    className="cursor-col-resize"
                    onPointerDown={(event) => beginTableResize(event, table, 'col', col)}
                  />
                ))
              : null}
            {tableEditing
              ? table.rowHeights.map((_, row) => (
                  <rect
                    key={`row-grip-${row}`}
                    role="button"
                    aria-label={`Resize row ${row + 1}`}
                    x={0}
                    y={(rowOffsets[row + 1] ?? 0) - 3}
                    width={size.width}
                    height={6}
                    fill="transparent"
                    className="cursor-row-resize"
                    onPointerDown={(event) => beginTableResize(event, table, 'row', row)}
                  />
                ))
              : null}
          </>
        ) : null}
      </g>
    );
  }

  function renderInk(stroke: StudioInkStroke) {
    const selected = selectedInkIds.includes(stroke.id);
    return (
      <g key={stroke.id}>
        {selected ? (
          <path
            d={strokePathData(stroke.points)}
            fill="none"
            stroke={SELECTION_ACCENT}
            strokeWidth={inkStrokeWidth(stroke) + 5}
            strokeOpacity={0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ) : null}
        <path
          data-testid="ink-stroke"
          d={strokePathData(stroke.points)}
          fill="none"
          stroke={inkStrokeColor(stroke)}
          strokeWidth={inkStrokeWidth(stroke)}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
        {/* Ink used to be reachable only with the eraser. It is an element like
            any other, so it can be picked up, moved and deleted like one. */}
        {canvasTool === 'select' ? (
          <path
            role="button"
            aria-label="Freehand stroke"
            d={strokePathData(stroke.points)}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(inkStrokeWidth(stroke), 14)}
            className="cursor-pointer"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              canvasRef.current?.focus({ preventScroll: true });
              if (event.shiftKey) {
                toggleStudioSelection('ink', stroke.id);
                return;
              }
              if (!selectedInkIds.includes(stroke.id)) {
                applySelection({ ...EMPTY_STUDIO_SELECTION, inkIds: [stroke.id] });
              }
              beginElementMove(event, 'ink', stroke.id);
            }}
          />
        ) : null}
      </g>
    );
  }

  function renderNode(node: DiagramNode) {
    const shape = displayShape(node);
    const size = effectiveDiagramNodeSize(node);
    const labelLayout = diagramNodeLabelLayout({
      ...node,
      label: node.label || 'Unlabelled',
    });
    const selected = selectedIds.includes(node.id);
    const isOnlySelection = selectedId === node.id;
    const isConnectionSource = connectionSourceId === node.id;
    const isConnectionTarget =
      connectionMode && hoveredTargetId === node.id && connectionSourceId !== node.id;
    const isEditing = editingNodeId === node.id;
    return (
      <g
        key={node.id}
        role="button"
        aria-label={`${DIAGRAM_SHAPE_LABELS[shape]}: ${node.label || 'Unlabelled'}`}
        aria-pressed={selected}
        tabIndex={-1}
        transform={`translate(${node.x}, ${node.y})`}
        className={connectionMode ? 'cursor-crosshair' : 'cursor-move'}
        onPointerDown={(event) => onNodePointerDown(event, node)}
        onPointerEnter={() => {
          if (connectionMode && connectionSourceId !== node.id) setHoveredTargetId(node.id);
        }}
        onPointerLeave={() => {
          if (hoveredTargetId === node.id) setHoveredTargetId(null);
        }}
        onDoubleClick={() => beginInlineNodeEdit(node)}
      >
        {selected ? (
          <rect
            x={-5}
            y={-5}
            width={size.width + 10}
            height={size.height + 10}
            rx={7}
            fill="none"
            stroke={isConnectionSource ? '#4D6A74' : '#E0A33C'}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ) : null}
        {isConnectionSource && !selected ? (
          <rect
            x={-5}
            y={-5}
            width={size.width + 10}
            height={size.height + 10}
            rx={7}
            fill="none"
            stroke="#4D6A74"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ) : null}
        {dropTargetId === node.id ? (
          <rect
            data-testid="container-drop-target"
            x={-3}
            y={-3}
            width={size.width + 6}
            height={size.height + 6}
            rx={5}
            fill="none"
            stroke="#4D6A74"
            strokeWidth={2.5}
          />
        ) : null}
        {isConnectionTarget ? (
          <rect
            x={-7}
            y={-7}
            width={size.width + 14}
            height={size.height + 14}
            rx={9}
            fill="none"
            stroke="#E0A33C"
            strokeWidth={3}
          />
        ) : null}
        <DiagramShapeOutline
          shape={shape}
          size={size}
          fill={shape === 'text' && !node.fillColor ? 'transparent' : diagramNodeFill(node)}
          stroke={diagramNodeStroke(node, LEGACY_NODE_STROKES[shape])}
          strokeWidth={diagramNodeStrokeWidth(node, LEGACY_NODE_STROKE_WIDTH)}
          containerDashArray={LEGACY_CONTAINER_DASH}
        />
        {isEditing ? (
          <foreignObject
            x={4}
            y={4}
            width={Math.max(40, size.width - 8)}
            height={Math.max(28, size.height - 8)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex h-full w-full items-center justify-center px-1">
              <input
                ref={inlineLabelInputRef}
                aria-label={`Edit ${shape} label`}
                value={node.label}
                maxLength={DIAGRAM_LABEL_LIMIT}
                onChange={(event) => {
                  clearError();
                  const graph = history.snapshotRef.current;
                  history.preview({
                    nodes: renameNode(graph.nodes, node.id, event.target.value),
                    edges: graph.edges,
                  });
                }}
                onBlur={finishInlineNodeEdit}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelInlineNodeEdit();
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    if (event.ctrlKey || event.metaKey) {
                      finishInlineNodeEdit();
                      event.currentTarget.form?.requestSubmit();
                    } else {
                      event.currentTarget.blur();
                    }
                  }
                }}
                className="h-full w-full rounded border border-rt-primary-deep bg-white px-1 text-center text-[11px] font-medium text-rt-ink outline-none select-text ring-2 ring-rt-primary-tint"
              />
            </div>
          </foreignObject>
        ) : (
          <text
            textAnchor="middle"
            fill={DIAGRAM_LABEL_INK}
            style={{
              fontSize: `${labelLayout.fontSize}px`,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: shape === 'text' ? 600 : 500,
            }}
          >
            {labelLayout.lines.map((line, index) => (
              <tspan
                key={line + String(index)}
                x={size.width / 2}
                y={labelLayout.firstBaselineY + index * labelLayout.lineHeight}
              >
                {line}
              </tspan>
            ))}
          </text>
        )}
        {isOnlySelection && !connectionMode && !isEditing ? (
          <g aria-hidden="true" className="cursor-crosshair">
            {[
              [size.width / 2, 0],
              [size.width, size.height / 2],
              [size.width / 2, size.height],
              [0, size.height / 2],
            ].map(([x, y]) => (
              <g
                key={`${x}-${y}`}
                data-testid="connection-handle"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  canvasRef.current?.focus({ preventScroll: true });
                  lastNodePressRef.current = null;
                  startConnection(node.id);
                }}
              >
                <circle cx={x} cy={y} r={14} fill="transparent" />
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill="#FFFFFF"
                  stroke="#4D6A74"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              </g>
            ))}
          </g>
        ) : null}
        {isOnlySelection && !connectionMode && !isEditing
          ? RESIZE_CORNERS.map(({ corner, label, cursor }) => {
              // Sit on the selection outline so the corners stay clear of
              // the connection handles on the node's own edge midpoints.
              const x = corner === 'nw' || corner === 'sw' ? -5 : size.width + 5;
              const y = corner === 'nw' || corner === 'ne' ? -5 : size.height + 5;
              return (
                <g
                  key={corner}
                  role="button"
                  aria-label={label}
                  tabIndex={-1}
                  data-testid={`resize-handle-${corner}`}
                  style={{ cursor }}
                  onPointerDown={(event) => onResizePointerDown(event, node, corner)}
                >
                  <circle cx={x} cy={y} r={10} fill="transparent" />
                  <rect
                    x={x - 3.5}
                    y={y - 3.5}
                    width={7}
                    height={7}
                    fill="#FFFFFF"
                    stroke={SELECTION_ACCENT}
                    strokeWidth={2}
                    pointerEvents="none"
                  />
                </g>
              );
            })
          : null}
      </g>
    );
  }

  return (
    <form
      className="grid min-h-0 flex-1 grid-rows-[auto_minmax(300px,1fr)_auto] overflow-y-auto bg-rt-surface-sunken md:grid-cols-[212px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden"
      onKeyDown={onFormKeyDown}
      onSubmit={(event) => void onSubmit(event)}
    >
      <aside className="border-b border-rt-tertiary bg-rt-surface p-4 select-none md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0 md:p-5">
        {extensionSource ? (
          <div className="mb-4 border-l-2 border-rt-secondary bg-rt-secondary-wash px-3 py-2 text-[12px] text-rt-secondary-deep">
            Extending {extensionSource.authorName}&apos;s diagram
          </div>
        ) : null}

        {selectedPath ? renderPenOptions() : null}

        {selectedTable && cellRange ? (
          <section className="mt-4" aria-label="Table">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
              Table
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Button
                variant="secondary"
                onClick={() =>
                  replaceTable(insertRow(selectedTable, cellRange.focus.row + 1), selectedTable.id)
                }
              >
                Row below
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  replaceTable(
                    insertColumn(selectedTable, cellRange.focus.col + 1),
                    selectedTable.id,
                  )
                }
              >
                Column right
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = deleteRow(selectedTable, cellRange.focus.row);
                  replaceTable(next, selectedTable.id);
                  const clamped = clampCellRef(next, cellRange.focus);
                  setCellRange({ anchor: clamped, focus: clamped });
                }}
              >
                Delete row
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = deleteColumn(selectedTable, cellRange.focus.col);
                  replaceTable(next, selectedTable.id);
                  const clamped = clampCellRef(next, cellRange.focus);
                  setCellRange({ anchor: clamped, focus: clamped });
                }}
              >
                Delete column
              </Button>
            </div>

            <p className="mt-3 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
              Cell fill
            </p>
            <div className="mt-2 grid grid-cols-8 gap-1.5">
              {DIAGRAM_FILL_KEYS.map((key) => (
                <SwatchButton
                  key={key}
                  label={`${key} cell fill`}
                  color={DIAGRAM_FILL_COLORS[key]}
                  active={false}
                  onSelect={() =>
                    replaceTable(fillCellRange(selectedTable, cellRange, key), selectedTable.id)
                  }
                />
              ))}
              <IconButton
                label="Clear cell fill"
                className="h-full w-full"
                onClick={() =>
                  replaceTable(fillCellRange(selectedTable, cellRange, null), selectedTable.id)
                }
              >
                <X aria-hidden="true" size={13} />
              </IconButton>
            </div>

            <p className="mt-3 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
              Cell text
            </p>
            <div className="mt-2 grid grid-cols-8 gap-1.5">
              {DIAGRAM_STROKE_KEYS.map((key) => (
                <SwatchButton
                  key={key}
                  label={`${key} cell text`}
                  color={DIAGRAM_STROKE_COLORS[key]}
                  active={false}
                  onSelect={() =>
                    replaceTable(
                      styleCellRange(selectedTable, cellRange, { color: key }),
                      selectedTable.id,
                    )
                  }
                />
              ))}
              <IconButton
                label="Default cell text colour"
                className="h-full w-full"
                onClick={() =>
                  replaceTable(
                    styleCellRange(selectedTable, cellRange, { color: null }),
                    selectedTable.id,
                  )
                }
              >
                <X aria-hidden="true" size={13} />
              </IconButton>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {DIAGRAM_FONT_SIZE_PRESETS.map((preset) => (
                <PresetButton
                  key={preset}
                  label={FONT_SIZE_LABELS[preset]}
                  // The letter alone does not identify the control; the word does.
                  name={`${preset} cell text`}
                  active={false}
                  onSelect={() =>
                    replaceTable(
                      styleCellRange(selectedTable, cellRange, { fontSizePreset: preset }),
                      selectedTable.id,
                    )
                  }
                />
              ))}
              <PresetButton
                label="B"
                name="Bold cell text"
                active={Boolean(
                  tableCellAt(selectedTable, cellRange.focus.row, cellRange.focus.col)?.bold,
                )}
                onSelect={() =>
                  replaceTable(
                    styleCellRange(selectedTable, cellRange, {
                      bold: !tableCellAt(selectedTable, cellRange.focus.row, cellRange.focus.col)
                        ?.bold,
                    }),
                    selectedTable.id,
                  )
                }
              />
            </div>

            <div className="mt-2 flex gap-1.5">
              {TABLE_CELL_ALIGNS.map((align) => (
                <PresetButton
                  key={align}
                  label={align[0]!.toUpperCase()}
                  name={`Align ${align}`}
                  active={false}
                  onSelect={() =>
                    replaceTable(alignCellRange(selectedTable, cellRange, align), selectedTable.id)
                  }
                />
              ))}
              <PresetButton
                label="H"
                name={selectedTable.headerRow ? 'Turn header row off' : 'Turn header row on'}
                active={Boolean(selectedTable.headerRow)}
                onSelect={() =>
                  replaceTable(
                    { ...selectedTable, headerRow: !selectedTable.headerRow },
                    selectedTable.id,
                  )
                }
              />
            </div>
          </section>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-y border-rt-tertiary py-3">
          <span className="text-[11px] text-rt-ink-faint">
            {nodes.length}/{DIAGRAM_NODE_LIMIT} elements
          </span>
          <Button
            variant="quiet"
            className="min-h-8 px-2.5"
            disabled={nodes.length < 2 || isSubmitting}
            title="Lay the diagram out along its arrows"
            onClick={() => {
              clearError();
              const graph = history.snapshotRef.current;
              history.commit({
                nodes: layoutDiagram(graph.nodes, graph.edges, layoutDirection),
                edges: graph.edges,
              });
            }}
          >
            <AlignHorizontalDistributeCenter aria-hidden="true" size={15} />
            Arrange
          </Button>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] text-rt-ink-faint">Flow</span>
          {LAYOUT_DIRECTIONS.map(({ direction, label, Icon }) => (
            <IconButton
              key={direction}
              label={label}
              className={`h-8 w-8 ${
                layoutDirection === direction
                  ? 'border-rt-primary bg-rt-primary-tint text-rt-ink'
                  : ''
              }`}
              aria-pressed={layoutDirection === direction}
              disabled={isSubmitting}
              onClick={() => setLayoutDirection(direction)}
            >
              <Icon aria-hidden="true" size={15} />
            </IconButton>
          ))}
        </div>

        <section className="mt-4" aria-label="Selection">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
              Selection
            </p>
            <p className="text-[10px] text-rt-ink-faint" aria-live="polite">
              {selectionSize(currentSelection())} selected
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <IconButton
              label="Duplicate selection"
              title="Duplicate (Ctrl+D)"
              disabled={isSelectionEmpty(currentSelection()) || isSubmitting}
              onClick={duplicateSelection}
            >
              <CopyPlus aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              label="Copy selection"
              title="Copy (Ctrl+C)"
              disabled={isSelectionEmpty(currentSelection()) || isSubmitting}
              onClick={() => copySelection()}
            >
              <Copy aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              label="Paste copied elements"
              title="Paste (Ctrl+V)"
              disabled={isFragmentEmpty(clipboard) || isSubmitting}
              onClick={() => pasteFragment(clipboard)}
            >
              <ClipboardPaste aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              label="Bring selection to front"
              title="Bring in front of the ink"
              disabled={isSelectionEmpty(currentSelection()) || isSubmitting}
              onClick={() => reorderSelection('front')}
            >
              <BringToFront aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              label="Send selection to back"
              title="Send behind the ink"
              disabled={isSelectionEmpty(currentSelection()) || isSubmitting}
              onClick={() => reorderSelection('back')}
            >
              <SendToBack aria-hidden="true" size={16} />
            </IconButton>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {ALIGN_ACTIONS.map(({ mode, label, Icon }) => (
              <IconButton
                key={mode}
                label={label}
                className="h-9 w-9"
                disabled={!canAlign}
                onClick={() => alignSelection(mode)}
              >
                <Icon aria-hidden="true" size={15} />
              </IconButton>
            ))}
            <IconButton
              label="Distribute horizontally"
              className="h-9 w-9"
              disabled={!canDistribute}
              onClick={() => distributeSelection('horizontal')}
            >
              <AlignHorizontalDistributeCenter aria-hidden="true" size={15} />
            </IconButton>
            <IconButton
              label="Distribute vertically"
              className="h-9 w-9"
              disabled={!canDistribute}
              onClick={() => distributeSelection('vertical')}
            >
              <AlignVerticalDistributeCenter aria-hidden="true" size={15} />
            </IconButton>
          </div>
        </section>

        {selectedIds.length > 0 ? (
          <section className="mt-4" aria-label="Element style">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                Element style
              </p>
              <Button
                variant="quiet"
                className="min-h-7 px-2 text-[11px]"
                aria-label="Reset element style"
                disabled={isSubmitting}
                title="Return the selection to the default appearance"
                onClick={resetNodeStyle}
              >
                Reset
              </Button>
            </div>

            <p className="mt-2 text-[11px] font-medium text-rt-ink-muted">Fill</p>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {DIAGRAM_FILL_KEYS.map((key) => (
                <SwatchButton
                  key={key}
                  label={`Fill ${key}`}
                  color={DIAGRAM_FILL_COLORS[key]}
                  active={sharedNodeStyle('fillColor') === key}
                  disabled={isSubmitting}
                  onSelect={() => applyNodeStyle({ fillColor: key })}
                />
              ))}
            </div>

            <p className="mt-2.5 text-[11px] font-medium text-rt-ink-muted">Border</p>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {DIAGRAM_STROKE_KEYS.map((key) => (
                <SwatchButton
                  key={key}
                  label={`Border ${key}`}
                  color={DIAGRAM_STROKE_COLORS[key]}
                  active={sharedNodeStyle('strokeColor') === key}
                  disabled={isSubmitting}
                  onSelect={() => applyNodeStyle({ strokeColor: key })}
                />
              ))}
            </div>

            <p className="mt-2.5 text-[11px] font-medium text-rt-ink-muted">Border width</p>
            <div className="mt-1 flex gap-1.5">
              {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
                <PresetButton
                  key={preset}
                  label={STROKE_WIDTH_LABELS[preset]}
                  name={`Border width ${preset}`}
                  active={sharedNodeStyle('strokeWidthPreset') === preset}
                  disabled={isSubmitting}
                  onSelect={() => applyNodeStyle({ strokeWidthPreset: preset })}
                />
              ))}
            </div>

            <p className="mt-2.5 text-[11px] font-medium text-rt-ink-muted">Text size</p>
            <div className="mt-1 flex gap-1.5">
              {DIAGRAM_FONT_SIZE_PRESETS.map((preset) => (
                <PresetButton
                  key={preset}
                  label={FONT_SIZE_LABELS[preset]}
                  name={`Text size ${preset}`}
                  active={sharedNodeStyle('fontSizePreset') === preset}
                  disabled={isSubmitting}
                  onSelect={() => applyNodeStyle({ fontSizePreset: preset })}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-4" aria-label="Arrows">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                Arrows
              </p>
              <p className="mt-0.5 text-[10px] text-rt-ink-faint">
                {edges.length}/{DIAGRAM_EDGE_LIMIT}
              </p>
            </div>
            {connectionMode ? (
              <Button variant="quiet" className="min-h-8 px-2.5" onClick={cancelConnection}>
                <X aria-hidden="true" size={15} />
                Cancel
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="min-h-8 px-2.5"
                disabled={nodes.length < 2 || edges.length >= DIAGRAM_EDGE_LIMIT || isSubmitting}
                title="Draw an arrow between two elements"
                onClick={() => startConnection()}
              >
                <Link2 aria-hidden="true" size={15} />
                Connect
              </Button>
            )}
          </div>
          {connectionMode ? (
            <p
              role="status"
              className="mt-2 rounded-lg bg-rt-primary-tint px-3 py-2 text-[11px] leading-relaxed text-rt-primary-deep"
            >
              {connectionSourceId
                ? `Choose a destination for ${selectedNodeById(nodes, connectionSourceId)?.label ?? 'this element'}.`
                : 'Choose the starting element.'}
            </p>
          ) : null}
        </section>

        {containerAwaitingDelete ? (
          <section
            className="mt-4 rounded-lg border border-rt-secondary bg-rt-secondary-wash p-3"
            aria-label="Delete container"
          >
            <p role="alert" className="text-[12px] leading-relaxed text-rt-secondary-deep">
              This container holds {diagramDescendantIds(nodes, containerAwaitingDelete).length}{' '}
              {diagramDescendantIds(nodes, containerAwaitingDelete).length === 1
                ? 'element'
                : 'elements'}
              . Delete them too, or keep them on the canvas?
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button
                variant="secondary"
                className="min-h-8 px-2.5"
                onClick={() => resolveContainerDelete('ungroup')}
              >
                <Ungroup aria-hidden="true" size={15} />
                Keep contents
              </Button>
              <Button className="min-h-8 px-2.5" onClick={() => resolveContainerDelete('contents')}>
                <Trash2 aria-hidden="true" size={15} />
                Delete contents
              </Button>
              <Button
                variant="quiet"
                className="min-h-8 px-2.5"
                aria-label="Cancel deleting the container"
                onClick={() => setPendingContainerDelete(null)}
              >
                Cancel
              </Button>
            </div>
          </section>
        ) : null}

        {selectedNode ? (
          <section className="mt-4" aria-label="Selected element">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                Selected {DIAGRAM_SHAPE_LABELS[displayShape(selectedNode)].toLowerCase()}
              </span>
              <IconButton label="Delete selected element" onClick={removeSelectedNodes}>
                <Trash2 aria-hidden="true" size={16} />
              </IconButton>
            </div>
            <label
              htmlFor="diagram-node-label"
              className="mt-3 block text-[12px] font-semibold text-rt-ink"
            >
              Label
            </label>
            <input
              ref={labelInputRef}
              id="diagram-node-label"
              value={selectedNode.label}
              maxLength={DIAGRAM_LABEL_LIMIT}
              onFocus={() => {
                nodeLabelStartRef.current ??= history.snapshotRef.current;
              }}
              onChange={(event) => {
                clearError();
                const graph = history.snapshotRef.current;
                history.preview({
                  nodes: renameNode(graph.nodes, selectedNode.id, event.target.value),
                  edges: graph.edges,
                });
              }}
              onBlur={normalizeSelectedLabel}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelNodeLabelEdit();
                  canvasRef.current?.focus();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none select-text focus:border-rt-primary-deep focus:ring-2 focus:ring-rt-primary-tint"
            />
            <p className="mt-1.5 text-right text-[10px] tabular-nums text-rt-ink-faint">
              {selectedNode.label.length}/{DIAGRAM_LABEL_LIMIT}
            </p>
            {selectedNode.parentId ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-rt-ink-faint">
                  Inside {selectedNodeById(nodes, selectedNode.parentId)?.label ?? 'a container'}
                </span>
                <Button
                  variant="quiet"
                  className="min-h-7 px-2 text-[11px]"
                  disabled={isSubmitting}
                  title="Move this element out of its container"
                  onClick={() => {
                    clearError();
                    const graph = history.snapshotRef.current;
                    history.commit({
                      nodes: reparentNodes(graph.nodes, [selectedNode.id], null),
                      edges: graph.edges,
                    });
                  }}
                >
                  <Ungroup aria-hidden="true" size={14} />
                  Remove from container
                </Button>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] tabular-nums text-rt-ink-faint">
                {Math.round(effectiveDiagramNodeSize(selectedNode).width)} ×{' '}
                {Math.round(effectiveDiagramNodeSize(selectedNode).height)}
                {selectedNode.width === undefined ? ' (default)' : ''}
              </span>
              <Button
                variant="quiet"
                className="min-h-7 px-2 text-[11px]"
                disabled={selectedNode.width === undefined || isSubmitting}
                title="Return this element to its default size"
                onClick={resetSelectedNodeSize}
              >
                Reset size
              </Button>
            </div>
          </section>
        ) : null}

        {selectedEdge ? (
          <section className="mt-4 border-t border-rt-tertiary pt-4" aria-label="Selected arrow">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                  Selected arrow
                </p>
                <p className="mt-1 truncate text-[11px] text-rt-ink-muted">
                  {selectedNodeById(nodes, selectedEdge.from)?.label} →{' '}
                  {selectedNodeById(nodes, selectedEdge.to)?.label}
                </p>
              </div>
              <IconButton label="Delete selected arrow" onClick={removeSelectedEdge}>
                <Trash2 aria-hidden="true" size={16} />
              </IconButton>
            </div>
            <label
              htmlFor="diagram-edge-label"
              className="mt-3 block text-[12px] font-semibold text-rt-ink"
            >
              Label <span className="font-normal text-rt-ink-faint">(optional)</span>
            </label>
            <input
              ref={edgeLabelInputRef}
              id="diagram-edge-label"
              value={selectedEdge.label ?? ''}
              maxLength={DIAGRAM_EDGE_LABEL_LIMIT}
              onFocus={() => {
                edgeLabelStartRef.current ??= history.snapshotRef.current;
              }}
              onChange={(event) => {
                clearError();
                const graph = history.snapshotRef.current;
                history.preview({
                  nodes: graph.nodes,
                  edges: renameEdge(graph.edges, selectedEdge, event.target.value),
                });
              }}
              onBlur={normalizeSelectedEdgeLabel}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelEdgeLabelEdit();
                  canvasRef.current?.focus();
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              placeholder="e.g. sends request"
              className="mt-1.5 h-10 w-full rounded-lg border border-rt-tertiary bg-rt-surface px-3 text-[13px] text-rt-ink outline-none select-text placeholder:text-rt-ink-faint focus:border-rt-primary-deep focus:ring-2 focus:ring-rt-primary-tint"
            />
            <p className="mt-1.5 text-right text-[10px] tabular-nums text-rt-ink-faint">
              {(selectedEdge.label ?? '').length}/{DIAGRAM_EDGE_LABEL_LIMIT}
            </p>

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-rt-ink-muted">Arrow style</p>
              <Button
                variant="quiet"
                className="min-h-7 px-2 text-[11px]"
                aria-label="Reset arrow style"
                disabled={isSubmitting}
                title="Return this arrow to the default appearance"
                onClick={resetEdgeStyle}
              >
                Reset
              </Button>
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {DIAGRAM_STROKE_KEYS.map((key) => (
                <SwatchButton
                  key={key}
                  label={`Arrow ${key}`}
                  color={DIAGRAM_STROKE_COLORS[key]}
                  active={selectedEdge.strokeColor === key}
                  disabled={isSubmitting}
                  onSelect={() => applyEdgeStyle({ strokeColor: key })}
                />
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
                <PresetButton
                  key={preset}
                  label={STROKE_WIDTH_LABELS[preset]}
                  name={`Arrow width ${preset}`}
                  active={selectedEdge.strokeWidthPreset === preset}
                  disabled={isSubmitting}
                  onSelect={() => applyEdgeStyle({ strokeWidthPreset: preset })}
                />
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {DIAGRAM_STROKE_STYLES.map((style) => (
                <PresetButton
                  key={style}
                  label={STROKE_STYLE_LABELS[style]}
                  name={`Arrow style ${style}`}
                  active={selectedEdge.strokeStyle === style}
                  disabled={isSubmitting}
                  onSelect={() => applyEdgeStyle({ strokeStyle: style })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <section className="relative flex min-h-0 items-center justify-center overflow-auto p-3 sm:p-6">
        <StudioToolRail
          tool={canvasTool}
          onToolChange={selectCanvasTool}
          disabled={isSubmitting}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={undoDiagram}
          onRedo={redoDiagram}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((current) => !current)}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((current) => !current)}
          freehandOptions={renderFreehandOptions()}
          shapeOptions={renderShapeOptions()}
          penOptions={renderPenOptions()}
          tableOptions={renderTableOptions()}
          templateOptions={renderTemplateOptions()}
          onAddText={() => addElement('text')}
        />

        <div className="absolute top-4 right-4 z-10 flex select-none items-center gap-1 rounded-lg border border-rt-tertiary bg-rt-surface/95 p-1 shadow-sm sm:top-7 sm:right-7">
          <IconButton
            label="Zoom out"
            title="Zoom out (Ctrl + scroll)"
            className="h-8 w-8 border-transparent"
            disabled={zoomPercent <= 100}
            onClick={() => zoomBy(1 / DIAGRAM_ZOOM_STEP)}
          >
            <ZoomOut aria-hidden="true" size={15} />
          </IconButton>
          <span
            className="min-w-13 text-center text-[11px] font-semibold tabular-nums text-rt-ink-muted"
            aria-live="polite"
          >
            {zoomPercent}%
          </span>
          <IconButton
            label="Zoom in"
            title="Zoom in (Ctrl + scroll)"
            className="h-8 w-8 border-transparent"
            disabled={zoomPercent >= 400}
            onClick={() => zoomBy(DIAGRAM_ZOOM_STEP)}
          >
            <ZoomIn aria-hidden="true" size={15} />
          </IconButton>
          <IconButton
            label="Fit diagram to view"
            title="Fit to content"
            className="h-8 w-8 border-transparent"
            disabled={nodes.length === 0}
            onClick={fitView}
          >
            <Maximize2 aria-hidden="true" size={15} />
          </IconButton>
          <IconButton
            label="Reset view"
            title="Reset view to 100%"
            className="h-8 w-8 border-transparent"
            disabled={isDefaultDiagramView(view)}
            onClick={resetView}
          >
            <RotateCcw aria-hidden="true" size={15} />
          </IconButton>
        </div>

        <svg
          ref={canvasRef}
          role="application"
          aria-label="Studio canvas"
          tabIndex={0}
          viewBox={diagramViewBoxAttribute(view)}
          className={`w-full shrink-0 touch-none rounded-lg border border-rt-tertiary bg-white shadow-[0_8px_30px_rgba(8,12,21,0.10)] select-none focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none ${canvasCursor}`}
          style={{
            maxWidth: `min(1200px, calc((100dvh - ${DIAGRAM_VERTICAL_CHROME_REM}rem) * ${DIAGRAM_CANVAS_WIDTH / DIAGRAM_CANVAS_HEIGHT}))`,
            aspectRatio: `${DIAGRAM_CANVAS_WIDTH} / ${DIAGRAM_CANVAS_HEIGHT}`,
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onLostPointerCapture={onLostPointerCapture}
          onKeyDown={onCanvasKeyDown}
          onKeyUp={onCanvasKeyUp}
          onBlur={() => setPanReady(false)}
          onDragOver={onCanvasDragOver}
          onDrop={onCanvasDrop}
        >
          <defs>
            <pattern
              id="diagram-grid"
              width={DIAGRAM_GRID}
              height={DIAGRAM_GRID}
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="0.8" fill="#CFCFCF" />
            </pattern>
            <marker
              id="diagram-editor-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#8CA4AC" />
            </marker>
            <marker
              id="diagram-editor-arrow-selected"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={SELECTION_ACCENT} />
            </marker>
            {edgeArrowColors.map((color) => (
              <marker
                key={color}
                id={edgeArrowId(color)}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={color} />
              </marker>
            ))}
          </defs>
          {showGrid ? (
            <rect
              data-testid="diagram-grid"
              x={0}
              y={0}
              width={DIAGRAM_CANVAS_WIDTH}
              height={DIAGRAM_CANVAS_HEIGHT}
              fill="url(#diagram-grid)"
            />
          ) : null}

          {/* One ordered pass: `z` can put ink above or below any shape, so
              edges, nodes and ink cannot be drawn in three fixed layers. */}
          {paintOrder.map((ref) => {
            if (ref.kind === 'edge') {
              const index = edgeIndexByKey.get(ref.key);
              const edge = index === undefined ? undefined : edges[index];
              return edge && index !== undefined ? renderEdge(edge, index) : null;
            }
            if (ref.kind === 'ink') {
              const stroke = inkById.get(ref.key);
              return stroke ? renderInk(stroke) : null;
            }
            if (ref.kind === 'path') {
              const path = pathById.get(ref.key);
              return path ? renderPath(path) : null;
            }
            if (ref.kind === 'table') {
              const table = tableById.get(ref.key);
              return table ? renderTable(table) : null;
            }
            const node = nodeById.get(ref.key);
            return node ? renderNode(node) : null;
          })}

          {activeStroke ? renderInk(activeStroke) : null}

          {pathAnchors.length > 0
            ? (() => {
                const preview = draftAnchors(pathAnchors, pathCursor);
                return (
                  <g data-testid="path-draft">
                    {renderPath(
                      {
                        id: 'draft',
                        anchors: preview,
                        strokeColor: pathColor,
                        strokeWidthPreset: pathWidth,
                        strokeStyle: pathStyle,
                        ...(closeHover && pathFillColor
                          ? { closed: true, fillColor: pathFillColor }
                          : {}),
                      },
                      'draft-path',
                      true,
                    )}
                    {pathAnchors.map((anchor, index) => {
                      const closing = index === 0 && closeHover;
                      return (
                        <g key={`${anchor.x}-${anchor.y}-${index}`}>
                          {closing ? (
                            <circle
                              data-testid="path-close-target"
                              cx={anchor.x}
                              cy={anchor.y}
                              r={9}
                              fill="none"
                              stroke={SELECTION_ACCENT}
                              strokeWidth={2}
                              pointerEvents="none"
                            />
                          ) : null}
                          <circle
                            cx={anchor.x}
                            cy={anchor.y}
                            r={closing ? 5 : 3.5}
                            fill={index === 0 ? SELECTION_ACCENT : '#FFFFFF'}
                            stroke={SELECTION_ACCENT}
                            strokeWidth={1.5}
                            pointerEvents="none"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })()
            : null}

          {/* Drawn last so the in-flight arrow stays visible over whatever it
              is being dragged across. */}
          {connectionPreview ? (
            <line
              aria-hidden="true"
              data-testid="connection-preview"
              x1={connectionPreview.x1}
              y1={connectionPreview.y1}
              x2={connectionPreview.x2}
              y2={connectionPreview.y2}
              stroke="#4D6A74"
              strokeWidth={2}
              strokeDasharray="6 4"
              markerEnd="url(#diagram-editor-arrow)"
              pointerEvents="none"
            />
          ) : null}

          {marqueeRect ? (
            <rect
              aria-hidden="true"
              data-testid="selection-marquee"
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill="rgba(224,163,60,0.12)"
              stroke="#E0A33C"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </section>

      <footer className="sticky bottom-0 z-10 col-span-full flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary bg-rt-surface px-4 py-3 shadow-[0_-4px_16px_rgba(8,12,21,0.06)] sm:px-6 md:static md:shadow-none">
        <div className="min-w-0 flex-1">
          {error ? (
            <p role="alert" className="text-[12px] text-rt-secondary-deep">
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-rt-ink-faint" aria-live="polite">
              {nodes.length} {nodes.length === 1 ? 'element' : 'elements'} · {edges.length}{' '}
              {edges.length === 1 ? 'arrow' : 'arrows'}
              {ink.length > 0 ? ` · ${ink.length} ${ink.length === 1 ? 'stroke' : 'strokes'}` : ''}
              {paths.length > 0
                ? ` · ${paths.length} ${paths.length === 1 ? 'path' : 'paths'}`
                : ''}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={closeTool}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isLive || isSubmitting}
          title={isLive ? 'Propose diagram (Ctrl+Enter)' : 'Reconnect before proposing'}
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
          ) : (
            <Send aria-hidden="true" size={16} />
          )}
          {isSubmitting ? 'Proposing' : 'Propose'}
        </Button>
      </footer>
    </form>
  );
}
