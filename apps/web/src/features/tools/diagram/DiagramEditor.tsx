import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  AlignHorizontalDistributeCenter,
  Box,
  CheckCircle2,
  Container,
  Link2,
  LoaderCircle,
  Send,
  Trash2,
  Type,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import type { DiagramEdge, DiagramNode, DiagramNodeShape } from '@roundtable/shared';
import {
  diagramEdgeGeometry,
  diagramEdgeToPointGeometry,
  diagramNodeSize,
} from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
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
  addEdge,
  addNode,
  autoLayoutNodes,
  clientPointToDiagramPoint,
  deleteEdge,
  deleteNodeWithEdges,
  edgeKey,
  moveNode,
  prepareDiagram,
  prepareEdgeLabel,
  prepareNodeLabel,
  renameEdge,
  renameNode,
  type DiagramPoint,
} from './diagramModel';
import { type DiagramSnapshot } from './diagramHistory';
import { useDiagramHistory } from './useDiagramHistory';

interface DragSession {
  pointerId: number;
  nodeId: string;
  offset: DiagramPoint;
  previous: DiagramSnapshot;
}

interface NodePress {
  nodeId: string;
  time: number;
  clientX: number;
  clientY: number;
}

const SHAPE_ICONS = {
  box: Box,
  container: Container,
  text: Type,
} as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(() => nodes[0]?.id ?? null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [connectionPointer, setConnectionPointer] = useState<DiagramPoint | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const edgeLabelInputRef = useRef<HTMLInputElement>(null);
  const inlineLabelInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const lastNodePressRef = useRef<NodePress | null>(null);
  const nodeLabelStartRef = useRef<DiagramSnapshot | null>(null);
  const edgeLabelStartRef = useRef<DiagramSnapshot | null>(null);
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

  function clearError() {
    setValidationError(null);
    if (submissionError) resetSubmission();
  }

  function surfacePoint(event: PointerEvent<SVGSVGElement>): DiagramPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clientPointToDiagramPoint(
      { x: event.clientX, y: event.clientY },
      { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
    );
  }

  function addElement(shape: DiagramNodeShape) {
    clearError();
    const result = addNode(history.snapshotRef.current.nodes, shape);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    history.commit({ nodes: result.nodes, edges: history.snapshotRef.current.edges });
    setSelectedId(result.addedId);
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
      setSelectedId(node.id);
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
    setSelectedId(null);
    cancelConnection();
    queueMicrotask(() => edgeLabelInputRef.current?.focus());
  }

  function removeSelectedNode() {
    if (!selectedId) return;
    clearError();
    const graph = history.snapshotRef.current;
    const next = deleteNodeWithEdges(graph.nodes, graph.edges, selectedId);
    history.commit(next);
    setSelectedId(null);
    if (connectionSourceId === selectedId) cancelConnection();
  }

  function removeSelectedEdge() {
    if (!selectedEdge) return;
    clearError();
    const graph = history.snapshotRef.current;
    history.commit({ nodes: graph.nodes, edges: deleteEdge(graph.edges, selectedEdge) });
    setSelectedEdgeKey(null);
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
    setSelectedId(node.id);
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
    const bounds = canvas.getBoundingClientRect();
    const point = clientPointToDiagramPoint(
      { x: event.clientX, y: event.clientY },
      { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
    );

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

    dragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      offset: { x: point.x - node.x, y: point.y - node.y },
      previous: history.snapshotRef.current,
    };
    canvas.setPointerCapture(event.pointerId);
    setSelectedId(node.id);
    setSelectedEdgeKey(null);
    clearError();
  }

  function updateDrag(event: PointerEvent<SVGSVGElement>) {
    if (connectionMode) setConnectionPointer(surfacePoint(event));
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = surfacePoint(event);
    const graph = history.snapshotRef.current;
    history.preview({
      nodes: moveNode(graph.nodes, drag.nodeId, {
        x: point.x - drag.offset.x,
        y: point.y - drag.offset.y,
      }),
      edges: graph.edges,
    });
  }

  function finishDrag(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateDrag(event);
    history.recordPreview(drag.previous);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onLostPointerCapture(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      history.recordPreview(drag.previous);
      dragRef.current = null;
    }
  }

  function onCanvasKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (isSubmitting) return;

    if (event.key === 'Enter' && selectedNode) {
      event.preventDefault();
      beginInlineNodeEdit(selectedNode);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (selectedEdge) removeSelectedEdge();
      else removeSelectedNode();
      return;
    }

    if (!selectedId) return;

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
    const graph = history.snapshotRef.current;
    const selected = selectedNodeById(graph.nodes, selectedId);
    if (selected) {
      history.commit({
        nodes: moveNode(graph.nodes, selectedId, {
          x: selected.x + offset.x,
          y: selected.y + offset.y,
        }),
        edges: graph.edges,
      });
    }
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape' && connectionMode) {
      event.preventDefault();
      event.stopPropagation();
      cancelConnection();
      return;
    }

    const target = event.target;
    const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (!isTextInput && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoDiagram();
      else undoDiagram();
      return;
    }

    if (!isTextInput && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoDiagram();
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
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
          <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-1">
            {DIAGRAM_NODE_SHAPES.map((shape) => {
              const ShapeIcon = SHAPE_ICONS[shape];
              return (
                <button
                  key={shape}
                  type="button"
                  onClick={() => addElement(shape)}
                  disabled={nodes.length >= DIAGRAM_NODE_LIMIT || isSubmitting}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rt-tertiary bg-rt-surface px-2.5 text-[12px] font-semibold text-rt-ink-muted transition-colors hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 md:justify-start"
                >
                  <ShapeIcon aria-hidden="true" size={16} />
                  Add {DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}
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
            disabled={!history.canUndo || isSubmitting}
            onClick={undoDiagram}
          >
            <Undo2 aria-hidden="true" size={16} />
          </IconButton>
          <IconButton
            label="Redo diagram change"
            disabled={!history.canRedo || isSubmitting}
            onClick={redoDiagram}
          >
            <Redo2 aria-hidden="true" size={16} />
          </IconButton>
        </div>

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

        {selectedNode ? (
          <section className="mt-4" aria-label="Selected element">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
                Selected {DIAGRAM_SHAPE_LABELS[displayShape(selectedNode)].toLowerCase()}
              </span>
              <IconButton label="Delete selected element" onClick={removeSelectedNode}>
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
          </section>
        ) : null}
      </aside>

      <section className="relative flex min-h-0 items-center justify-center overflow-auto p-3 sm:p-6">
        <svg
          ref={canvasRef}
          role="application"
          aria-label="Diagram canvas"
          tabIndex={0}
          viewBox={`0 0 ${DIAGRAM_CANVAS_WIDTH} ${DIAGRAM_CANVAS_HEIGHT}`}
          className="w-full shrink-0 touch-none rounded-lg border border-rt-tertiary bg-white shadow-[0_8px_30px_rgba(8,12,21,0.10)] select-none focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none"
          style={{
            maxWidth: `min(1200px, calc((100dvh - ${DIAGRAM_VERTICAL_CHROME_REM}rem) * ${DIAGRAM_CANVAS_WIDTH / DIAGRAM_CANVAS_HEIGHT}))`,
            aspectRatio: `${DIAGRAM_CANVAS_WIDTH} / ${DIAGRAM_CANVAS_HEIGHT}`,
          }}
          onPointerDown={() => {
            lastNodePressRef.current = null;
            setSelectedId(null);
            setSelectedEdgeKey(null);
          }}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={onLostPointerCapture}
          onKeyDown={onCanvasKeyDown}
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
              <path d="M0,0 L8,4 L0,8 Z" fill="#E0A33C" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#diagram-grid)" />

          {edges.map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const geometry = diagramEdgeGeometry(from, to);
            const selected = selectedEdgeKey === edgeKey(edge);
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
                  setSelectedId(null);
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
                  stroke={selected ? '#E0A33C' : '#8CA4AC'}
                  strokeWidth={selected ? 3 : 2}
                  markerEnd={`url(#diagram-editor-arrow${selected ? '-selected' : ''})`}
                  pointerEvents="none"
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

          {nodes.map((node) => {
            const shape = displayShape(node);
            const size = diagramNodeSize(node.shape);
            const selected = selectedId === node.id;
            const isConnectionSource = connectionSourceId === node.id;
            const isConnectionTarget =
              connectionMode && hoveredTargetId === node.id && connectionSourceId !== node.id;
            const isEditing = editingNodeId === node.id;
            return (
              <g
                key={node.id}
                role="button"
                aria-label={`${DIAGRAM_SHAPE_LABELS[shape]}: ${node.label || 'Unlabelled'}`}
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
                {shape === 'text' ? (
                  <rect width={size.width} height={size.height} fill="transparent" />
                ) : (
                  <rect
                    width={size.width}
                    height={size.height}
                    rx={shape === 'container' ? 3 : 8}
                    fill={shape === 'container' ? '#FAFAFA' : '#EEF2F4'}
                    stroke={shape === 'container' ? '#8CA4AC' : '#4D6A74'}
                    strokeWidth={1.5}
                    strokeDasharray={shape === 'container' ? '5 3' : undefined}
                  />
                )}
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
                    x={size.width / 2}
                    y={size.height / 2 + 4}
                    textAnchor="middle"
                    fill="#080C15"
                    style={{
                      fontSize: '11px',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontWeight: shape === 'text' ? 600 : 500,
                    }}
                    textLength={node.label.length > 10 ? size.width - 12 : undefined}
                    lengthAdjust={node.label.length > 10 ? 'spacingAndGlyphs' : undefined}
                  >
                    {node.label || 'Unlabelled'}
                  </text>
                )}
                {selected && !connectionMode && !isEditing ? (
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
              </g>
            );
          })}
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
