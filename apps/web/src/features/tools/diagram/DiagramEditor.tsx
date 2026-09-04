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
  Box,
  CheckCircle2,
  Circle,
  ClipboardPaste,
  Container,
  Copy,
  CopyPlus,
  Database,
  Diamond,
  Grid3x3,
  Link2,
  LoaderCircle,
  Magnet,
  Maximize2,
  RotateCcw,
  RectangleHorizontal,
  Send,
  Trash2,
  Triangle,
  Type,
  Ungroup,
  Undo2,
  Redo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  DiagramEdge,
  DiagramFontSizePreset,
  DiagramNode,
  DiagramNodeShape,
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
  diagramNodesInDrawOrder,
  effectiveDiagramNodeSize,
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
  autoLayoutNodes,
  clampNodesInsideContainer,
  clearEdgeStyle,
  clearNodeSize,
  clearNodeStyle,
  clientPointToDiagramPoint,
  containerAtPoint,
  deleteContainerWithContents,
  copyDiagramFragment,
  deleteEdge,
  deleteNodesWithEdges,
  distributeNodes,
  edgeKey,
  draggedSelectionRoots,
  moveNodesBy,
  nodeIdsInRect,
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
  type PasteFragment,
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
import { useDiagramHistory } from './useDiagramHistory';

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
  base: string[];
}

interface NodePress {
  nodeId: string;
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

function isNodeDoublePress(last: NodePress | null, nodeId: string, press: NodePress): boolean {
  return (
    last !== null &&
    last.nodeId === nodeId &&
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
    isLive,
    resetSubmission,
    setCloseGuard,
    submissionError,
    submissionStatus,
    submitArtifact,
  } = useCreativeTools();
  const sourceArtifact =
    extensionSource?.artifactJson.type === 'diagram' ? extensionSource.artifactJson : null;
  const initialSnapshotRef = useRef<DiagramSnapshot | null>(null);
  if (!initialSnapshotRef.current) {
    initialSnapshotRef.current = {
      nodes: (sourceArtifact?.nodes ?? []).map((node) => ({ ...node })),
      edges: (sourceArtifact?.edges ?? []).map((edge) => ({ ...edge })),
    };
  }
  const history = useDiagramHistory(initialSnapshotRef.current);
  const { nodes, edges } = history.snapshot;
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
  const [clipboard, setClipboard] = useState<PasteFragment | null>(null);
  const [marquee, setMarquee] = useState<MarqueeSession | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingContainerDelete, setPendingContainerDelete] = useState<string | null>(null);
  const [panReady, setPanReady] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
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
  const edgeArrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
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

  function selectOnly(id: string | null) {
    setSelectedIds(id ? [id] : []);
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

  function copySelection(): PasteFragment | null {
    if (selectedIds.length === 0) return null;
    const graph = history.snapshotRef.current;
    const fragment = copyDiagramFragment(graph.nodes, graph.edges, selectedIds);
    setClipboard(fragment);
    return fragment;
  }

  function pasteFragment(fragment: PasteFragment | null) {
    if (!fragment) {
      setValidationError('Copy at least one element first.');
      return;
    }
    clearError();
    const graph = history.snapshotRef.current;
    const result = pasteDiagramFragment(
      graph.nodes,
      graph.edges,
      fragment,
      DIAGRAM_PASTE_OFFSET,
      snapEnabled,
    );
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    history.commit({ nodes: result.nodes, edges: result.edges });
    setSelectedIds(result.addedIds);
    setSelectedEdgeKey(null);
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
      nodeId: node.id,
      time: event.timeStamp,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (isNodeDoublePress(lastNodePressRef.current, node.id, press)) {
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

    const origin = surfacePoint(event);
    const base = event.shiftKey ? selectedIds : [];
    const session: MarqueeSession = {
      pointerId: event.pointerId,
      origin,
      current: origin,
      base,
    };
    marqueeRef.current = session;
    setMarquee(session);
    canvas.setPointerCapture(event.pointerId);
    if (!event.shiftKey) {
      setSelectedIds([]);
      setSelectedEdgeKey(null);
    }
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
    const swept = nodeIdsInRect(history.snapshotRef.current.nodes, rect);
    setSelectedIds([...new Set([...session.base, ...swept])]);
    setSelectedEdgeKey(null);
    return true;
  }

  function releaseCapture(event: PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onCanvasPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (endPan(event)) return;
    if (endResize(event)) return;
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
    history.commit({
      nodes: moveNodesBy(
        graph.nodes,
        nodeOrigins(graph.nodes, selectedIds),
        offset,
        selectedIds[0]!,
        snapEnabled,
      ),
      edges: graph.edges,
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

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (selectedEdge) removeSelectedEdge();
      else removeSelectedNodes();
      return;
    }

    if (selectedIds.length === 0) return;

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
        setSelectedIds(history.snapshotRef.current.nodes.map((node) => node.id));
        setSelectedEdgeKey(null);
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
    if (editingNodeId) finishInlineNodeEdit();
    normalizeSelectedLabel();
    normalizeSelectedEdgeLabel();
    const graph = history.snapshotRef.current;
    const prepared = prepareDiagram(graph.nodes, graph.edges);
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
          <h2 className="text-[20px] font-semibold text-rt-ink">Diagram proposed</h2>
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
  const canvasCursor = isPanning ? 'cursor-grabbing' : panReady ? 'cursor-grab' : 'cursor-default';

  return (
    <form
      className="grid min-h-0 flex-1 grid-rows-[auto_minmax(300px,1fr)_auto] overflow-y-auto bg-rt-surface-sunken md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)_auto] md:overflow-hidden"
      onKeyDown={onFormKeyDown}
      onSubmit={(event) => void onSubmit(event)}
    >
      <aside className="border-b border-rt-tertiary bg-rt-surface p-4 select-none md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0 md:p-5">
        {extensionSource ? (
          <div className="mb-4 border-l-2 border-rt-secondary bg-rt-secondary-wash px-3 py-2 text-[12px] text-rt-secondary-deep">
            Extending {extensionSource.authorName}&apos;s diagram
          </div>
        ) : null}

        <fieldset>
          <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
            Elements
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-1.5 md:grid-cols-2">
            {DIAGRAM_NODE_SHAPES.map((shape) => {
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
          </div>
        </fieldset>

        <div className="mt-4 flex items-center justify-between border-y border-rt-tertiary py-3">
          <span className="text-[11px] text-rt-ink-faint">
            {nodes.length}/{DIAGRAM_NODE_LIMIT} elements
          </span>
          <Button
            variant="quiet"
            className="min-h-8 px-2.5"
            disabled={nodes.length < 2 || isSubmitting}
            title="Lay every element out on a tidy grid"
            onClick={() => {
              clearError();
              const graph = history.snapshotRef.current;
              history.commit({ nodes: autoLayoutNodes(graph.nodes), edges: graph.edges });
            }}
          >
            <AlignHorizontalDistributeCenter aria-hidden="true" size={15} />
            Arrange
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <IconButton
            label="Undo diagram change"
            title="Undo (Ctrl+Z)"
            disabled={!history.canUndo || isSubmitting}
            onClick={undoDiagram}
          >
            <Undo2 aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            label="Redo diagram change"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!history.canRedo || isSubmitting}
            onClick={redoDiagram}
          >
            <Redo2 aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            label="Show grid"
            title={showGrid ? 'Hide the grid' : 'Show the grid'}
            aria-pressed={showGrid}
            className={showGrid ? 'border-rt-primary bg-rt-primary-tint text-rt-ink' : ''}
            onClick={() => setShowGrid((current) => !current)}
          >
            <Grid3x3 aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            label="Snap to grid"
            title={snapEnabled ? 'Turn snapping off' : 'Turn snapping on'}
            aria-pressed={snapEnabled}
            className={snapEnabled ? 'border-rt-primary bg-rt-primary-tint text-rt-ink' : ''}
            onClick={() => setSnapEnabled((current) => !current)}
          >
            <Magnet aria-hidden="true" size={16} />
          </IconButton>
        </div>

        <section className="mt-4" aria-label="Selection">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
              Selection
            </p>
            <p className="text-[10px] text-rt-ink-faint" aria-live="polite">
              {selectedIds.length} selected
            </p>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <IconButton
              label="Duplicate selection"
              title="Duplicate (Ctrl+D)"
              disabled={selectedIds.length === 0 || isSubmitting}
              onClick={duplicateSelection}
            >
              <CopyPlus aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              label="Copy selection"
              title="Copy (Ctrl+C)"
              disabled={selectedIds.length === 0 || isSubmitting}
              onClick={() => copySelection()}
            >
              <Copy aria-hidden="true" size={16} />
            </IconButton>
            <IconButton
              label="Paste copied elements"
              title="Paste (Ctrl+V)"
              disabled={!clipboard || isSubmitting}
              onClick={() => pasteFragment(clipboard)}
            >
              <ClipboardPaste aria-hidden="true" size={16} />
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
          aria-label="Diagram canvas"
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

          {edges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const geometry = diagramEdgeGeometry(from, to);
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
                <line
                  x1={geometry.x1}
                  y1={geometry.y1}
                  x2={geometry.x2}
                  y2={geometry.y2}
                  stroke="transparent"
                  strokeWidth={18}
                />
                <line
                  x1={geometry.x1}
                  y1={geometry.y1}
                  x2={geometry.x2}
                  y2={geometry.y2}
                  stroke={selected ? SELECTION_ACCENT : stroke}
                  strokeWidth={selected ? Math.max(3, strokeWidth + 1) : strokeWidth}
                  markerEnd={`url(#${selected ? 'diagram-editor-arrow-selected' : edgeArrowId(stroke)})`}
                  pointerEvents="none"
                  {...dash}
                />
                {edge.label ? (
                  <text
                    x={geometry.labelX}
                    y={geometry.labelY}
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
          })}

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

          {diagramNodesInDrawOrder(nodes).map((node) => {
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
          })}

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
