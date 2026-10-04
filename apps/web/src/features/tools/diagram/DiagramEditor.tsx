import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
} from 'react';
import {
  ArrowDownFromLine,
  ArrowRight,
  ArrowUpFromLine,
  Columns3,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  DropletOff,
  Eraser,
  CornerDownRight,
  GitBranch,
  Minus,
  MoveRight,
  PaintBucket,
  Pencil,
  PenTool,
  RotateCcw,
  Rows3,
  TableCellsMerge,
  TableCellsSplit,
  BringToFront,
  SendToBack,
  Spline,
  Trash2,
  Type,
  Ungroup,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type {
  ArrowAttach,
  ArrowCap,
  ArrowElement,
  ArrowGeometry,
  ArrowPoint,
  ArrowRoute,
  ArrowTargetLookup,
  PathAnchor,
  PathElement,
  TableElement,
  DiagramFillKey,
  DiagramEdge,
  DiagramFontSizePreset,
  DiagramNode,
  DiagramArtifact,
  DiagramNodeShape,
  DiagramNodeSize,
  DiagramStrokeKey,
  DiagramStrokeStyle,
  DiagramStrokeWidthPreset,
  DiagramTextAlign,
  TableCellAlign,
} from '@roundtable/shared';
import {
  ARROW_CAPS,
  ARROW_LABEL_LIMIT,
  nearestTOnRoute,
  arrowCapGeometry,
  arrowEndCap,
  arrowFontSize,
  arrowGeometry,
  arrowLabelLines,
  arrowLabelSide,
  arrowRoute,
  arrowStartCap,
  DIAGRAM_MIN_NODE_HEIGHT,
  DIAGRAM_MIN_NODE_WIDTH,
  DIAGRAM_ROTATION_COARSE_STEP,
  DIAGRAM_ROTATION_STEP,
  normalizeRotation,
  offsetArrow,
  prepareArrowLabel,
  rotationTransform,
  arrowStrokeWidth,
  DIAGRAM_FILL_COLORS,
  DIAGRAM_FONT_SIZE_PRESETS,
  DIAGRAM_TEXT_ALIGNS,
  DIAGRAM_LABEL_INK,
  DIAGRAM_LABEL_PADDING,
  DIAGRAM_STROKE_COLORS,
  DIAGRAM_STROKE_STYLES,
  DIAGRAM_STROKE_WIDTH_PRESETS,
  diagramEdgeDash,
  diagramEdgeRoutes,
  diagramEdgeStroke,
  diagramEdgeStrokeWidth,
  diagramNodeFill,
  diagramNodeLabelLayout,
  diagramLabelWidthRatio,
  diagramNodeFontSize,
  diagramTextBoxHeight,
  diagramNodeLabelStyle,
  wrapDiagramLabel,
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
  tableCellFontSize,
  tableColCount,
  tableRowCount,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  toElementSpace,
  TABLE_DEFAULT_ROW_HEIGHT,
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  pathStrokeWidth,
  pathSvgData,
  strokePathData,
  reorderStudioElements,
  studioPaintOrder,
  DIAGRAM_Z_LIMIT,
} from '@roundtable/shared';

import { Button } from '../../../components/ui/Button';
import { DiagramShapeOutline } from '../../../components/ui/DiagramShapeOutline';
import { DIAGRAM_NODE_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_GRID,
  DIAGRAM_LABEL_LIMIT,
  DIAGRAM_NEW_NODE_FONT_SIZE,
  DIAGRAM_NEW_TEXT_SIZE,
  DIAGRAM_NODE_SHAPES,
  DIAGRAM_SHAPE_LABELS,
  placeNodePosition,
  DIAGRAM_SHAPE_PALETTE_ORDER,
  DIAGRAM_SHAPE_MEDIA_TYPE,
  addNode,
  createNodeId,
  newNodeSize,
  centreStudioContent,
  clampNodesInsideContainer,
  clientPointToDiagramPoint,
  containerAtPoint,
  deleteContainerWithContents,
  deleteEdge,
  styleEdge,
  deleteNodesWithEdges,
  edgeKey,
  draggedSelectionRoots,
  moveNodesBy,
  diagramRectToClientRect,
  nodeBounds,
  nodeLocalBounds,
  normalizeRect,
  prepareDiagram,
  preparedDiagramKey,
  prepareEdgeLabel,
  prepareNodeLabel,
  renameEdge,
  renameNode,
  reparentNodes,
  snapToGrid,
  resizeNode,
  ungroupContainer,
  type DiagramAlignMode,
  type DiagramDistributeAxis,
  type DiagramPoint,
  type DiagramRect,
  type DiagramResizeHandle,
} from './diagramModel';
import { type DiagramSnapshot } from './diagramHistory';
import {
  DIAGRAM_DEFAULT_VIEW,
  DIAGRAM_MAX_ZOOM,
  DIAGRAM_MIN_ZOOM,
  diagramViewBoxAttribute,
  expandViewToAspect,
  diagramViewZoom,
  isDefaultDiagramView,
  panDiagramView,
  scenePerPixel,
  stepDiagramView,
  zoomDiagramView,
  type DiagramView,
} from './diagramView';
import { useDiagramHistory } from './useDiagramHistory';
import { StudioPropertiesBar } from '../studio/toolbar/StudioPropertiesBar';
import { STUDIO_LAYER } from '../studio/studioLayers';
import { shortcutLabelFor } from '../studio/studioShortcuts';
import { ShapeThumbnail } from '../studio/ShapeThumbnail';
import {
  CHROME,
  STUDIO_ACCENT,
  STUDIO_ACCENT_WASH,
  STUDIO_COOL,
  chromeDash,
} from '../studio/studioTheme';
import { StudioShortcutSheet } from '../studio/toolbar/StudioShortcutSheet';
import { StudioToolRail } from '../studio/toolbar/StudioToolRail';
import {
  createInkId,
  dataToInk,
  fitInkStroke,
  inkToData,
  eraseInkAtPoint,
  eraserRadiusForView,
  type StudioInkStroke,
} from '../studio/studioInk';
import {
  RESIZE_CORNER_HANDLES,
  RESIZE_EDGE_HANDLES,
  RESIZE_HANDLE_LABELS,
  resizeCursorFor,
  scaleInk,
  scalePath,
} from '../studio/studioScale';
import { groupFrame, groupMustScaleUniformly, scaleGroup } from '../studio/studioGroupScale';
import {
  EXTEND_SIDES,
  EXTEND_SIDE_ANGLE,
  EXTEND_SIDE_LABELS,
  extendShapeChoices,
  extendSideNormal,
  planExtension,
  type ExtendSide,
} from '../studio/studioExtend';
import { StudioShapePicker, type ShapePickerSide } from '../studio/StudioShapePicker';
import {
  copyStudioFragment,
  isFragmentEmpty,
  pasteStudioFragment,
  type StudioFragment,
} from '../studio/studioClipboard';
import {
  clampDragToCanvas,
  offsetRect,
  snapDragToGrid,
  snapResizePull,
  unionBounds,
} from '../studio/studioSnapping';
import {
  arrowBoundsIn,
  inkBounds,
  inkLocalBounds,
  pathBounds,
  pathFrameBounds,
  pathLocalBounds,
  tableBounds,
  EMPTY_STUDIO_SELECTION,
  isSelectionEmpty,
  mergeSelections,
  selectionSize,
  studioElementsInRect,
  type StudioSelection,
} from '../studio/studioSelection';
import {
  anchorCellsInRange,
  bakeHeaderRow,
  cellAtPoint,
  cellsInRange,
  wholeTableRange,
  createTable,
  deleteTracks,
  duplicateTracks,
  expandRangeToMerges,
  fillCellRange,
  fitColumnWidth,
  fitRowHeight,
  fitRowsToContent,
  insertColumn,
  insertRow,
  alignCellRange,
  clearCellRange,
  isCellInRange,
  mergeAction,
  mergeCells,
  moveTableBy,
  moveTableSelection,
  movedTrackStart,
  moveTracks,
  newTableColWidth,
  parseTabularText,
  pasteGrid,
  rangeAsTabularText,
  rangeFocusCell,
  resolveCell,
  rangeAfterDelete,
  resizeColumn,
  resizeOuterTrack,
  resizeRow,
  setCell,
  shiftRangeForInsert,
  styleCellRange,
  trackSpan,
  tracksAsTable,
  unmergeCells,
  wholeTracks,
  wholeTracksRange,
  type CellRange,
  type CellRef,
  type TableAxis,
  type TableNavKey,
} from '../studio/studioTables';
import { StudioTableView, TABLE_CORNER_RADIUS, type TableCellBox } from '../studio/StudioTableView';
import { TABLE_CHROME_REACH_PX, TableChrome, type TableChromeHandle } from '../studio/TableChrome';
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
import {
  commonProperties,
  type StudioPropertyDescriptor,
  type StudioTarget,
} from '../studio/studioProperties';
import {
  alignOffsets,
  distributeOffsets,
  type ArrangeBox,
  type ArrangeOffset,
} from '../studio/studioArrange';
import { Popover } from '../../../components/ui/Popover';
import { Tooltip } from '../../../components/ui/Tooltip';
import {
  clearStudioDraft,
  isDraftWorthKeeping,
  readStudioDraft,
  writeStudioDraft,
  type StudioDraftScope,
} from '../studio/studioDraft';
import {
  arrowEndpointAt,
  createArrowId,
  pointerTravelSlopForView,
  arrowSnapToleranceForView,
  bendForPointer,
  draftArrow,
  elbowHandlePoint,
  finishArrow,
  snapArrowPoint,
  POINTER_TRAVEL_SLOP,
  type ArrowDraft,
  type ArrowStyle,
  type ArrowSnap,
} from '../studio/studioArrowDraft';
import { arrowTargets } from '../studio/studioArrowTargets';
import { StudioArrowView } from '../studio/StudioArrowView';
import { toolForShortcut } from '../studio/studioShortcuts';
import { STUDIO_TEMPLATES, templateFragment, type StudioTemplate } from '../studio/studioTemplates';
import { studioLimitError } from '../studio/studioLimits';
import {
  StudioArtwork,
  StudioSceneContent,
  studioSceneBounds,
  type StudioScene,
} from '../studio/StudioArtwork';
import { StudioActions, StudioProposeButton, useReportStudioStatus } from '../StudioOverlay';
import { EXTEND_UNCHANGED_HINT } from '../proposeErrors';
import { useSlowSubmission } from '../useProposalSubmission';

/**
 * What a press on empty canvas does. Shapes, arrows and selection are unchanged
 * by `draw`/`erase`: the ink tools only take over the canvas background, so a
 * node is still draggable while the pencil is held.
 */
type CanvasTool =
  'select' | 'draw' | 'erase' | 'pen' | 'line' | 'table' | 'text' | 'shape' | 'template' | 'arrow';

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

/**
 * A ctrl+wheel delta at least this big is one click of a mouse wheel rather
 * than part of a trackpad pinch. Browsers report a notch as roughly 100 pixels
 * (more under display scaling); a pinch sends a stream of single digits.
 */
const WHEEL_NOTCH_DELTA = 50;

interface ResizeSession {
  pointerId: number;
  kind: ResizableKind;
  id: string;
  handle: DiagramResizeHandle;
  /** A shape's stored box at the press. Ink and paths scale from `previous`. */
  start: DiagramRect;
  /** A table or group: the frame being pulled, and what is inside it. */
  frame: DiagramRect;
  selection: StudioSelection;
  origin: DiagramPoint;
  previous: DiagramSnapshot;
  /** A press on a grip that never moves changes nothing and records nothing. */
  moved: boolean;
}

/** What a selection frame can be pulled to resize. */
type ResizableKind = 'node' | 'ink' | 'path' | 'table' | 'group';

/** Which kinds can be turned. Arrows and tables are deliberately not among them. */
type RotatableKind = 'node' | 'ink' | 'path';

interface RotateSession {
  pointerId: number;
  kind: RotatableKind;
  id: string;
  /** Scene-space point the element turns about, fixed for the whole drag. */
  centre: DiagramPoint;
  /** Where the pointer was, as an angle, when the drag began. */
  startPointerAngle: number;
  startRotation: number;
  previous: DiagramSnapshot;
  moved: boolean;
}

interface PanSession {
  pointerId: number;
  startClient: DiagramPoint;
  startView: DiagramView;
  /** What was on screen when the drag began; sets what a pixel is worth. */
  startRendered: DiagramView;
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

/**
 * The colours a sub-toolbar offers. The contract's palette is unchanged and
 * larger — this is the short list the popovers show, so a tool strip can be one
 * narrow column. Each list leads with the neutral (black ink, and the fill that
 * goes with it) because that is the one people reach for without thinking.
 */
const QUICK_STROKE_KEYS = ['ink', 'blue', 'green', 'amber', 'rose', 'violet'] as const;
const QUICK_FILL_KEYS = ['surface', 'blue', 'green', 'amber', 'rose', 'violet'] as const;

/**
 * The same lists, plus the option to paint nothing at all.
 *
 * Offered for a fill, and for the outline of a shape or a table — things that
 * still have a body once the paint is gone. Deliberately not offered for ink, a
 * pen stroke or a label: those *are* their stroke, so a transparent one is an
 * element that has vanished but still catches clicks, and the only way back is
 * an undo the user may not realise they need.
 */
const FILL_KEYS_WITH_TRANSPARENT = [...QUICK_FILL_KEYS, 'transparent'] as const;
const OUTLINE_KEYS_WITH_TRANSPARENT = [...QUICK_STROKE_KEYS, 'transparent'] as const;

/**
 * The fill that belongs to each line colour. A closed path is filled with its
 * own stroke colour rather than a separately chosen one, so the fill control is
 * a yes/no rather than a second palette.
 */
const FILL_FOR_STROKE: Record<DiagramStrokeKey, DiagramFillKey> = {
  // A path outlined in nothing is filled with nothing: any other answer would
  // paint a body onto a shape whose author asked for no paint at all.
  transparent: 'transparent',
  ink: 'neutral',
  slate: 'neutral',
  grey: 'neutral',
  blue: 'blue',
  green: 'green',
  amber: 'amber',
  rose: 'rose',
  violet: 'violet',
};

// Far enough apart to tell at a glance: the old 1.5/3/5 read as one weight.
const STROKE_WIDTH_SAMPLE: Record<DiagramStrokeWidthPreset, number> = {
  thin: 1,
  regular: 3.5,
  thick: 7,
};

// Long dashes and round dots, so the three styles are three shapes.
const STROKE_STYLE_DASH: Record<DiagramStrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: '6 4',
  dotted: '0.5 4.5',
};

/**
 * A sub-toolbar control, deliberately a size below the rail's 36px. The panel is
 * a detail of the tool that opened it, and a column of full-size buttons reads
 * as a second toolbar instead. Swatches are smaller again: a colour needs less
 * room to be recognised than a glyph does.
 */
const SUBTOOL_SIZE = 'h-7 w-7';
const SUBTOOL_SWATCH_SIZE = 'h-5 w-5';

const TILE_SHAPE = `flex ${SUBTOOL_SIZE} items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45`;
const TILE_IDLE =
  'border-rt-tertiary bg-rt-surface text-rt-ink-muted hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink';
const TILE_ACTIVE = 'border-rt-primary bg-rt-primary-tint text-rt-ink';

/**
 * A sub-toolbar tile, lit when it is the one in use.
 *
 * The two states are swapped rather than stacked. Appending the active colours
 * to a class list that already carries the idle ones leaves Tailwind emitting
 * both, and which of them wins is decided by the order they happen to sit in
 * the stylesheet — here, the idle ones did, so a tool armed from this palette
 * never actually looked armed however correct its `aria-pressed` was.
 */
function tileClass(active: boolean): string {
  return `${TILE_SHAPE} ${active ? TILE_ACTIVE : TILE_IDLE}`;
}

const TILE_BUTTON = tileClass(false);

const CELL_ALIGN_ICONS: Record<TableCellAlign, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

const CHROME_ROUND_BUTTON =
  'flex h-6 w-6 items-center justify-center rounded-lg text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-9 max-sm:w-9';

const BAR_CONTROL =
  'flex h-8 w-8 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-lg border border-transparent text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45';

/**
 * One run of related controls inside a tool strip. Named for the screen reader
 * rather than titled on screen: a strip this narrow has no room for headings,
 * and every control in it carries its own name.
 */
function ToolStripGroup({
  label,
  spacious = false,
  row = false,
  children,
}: {
  label: string;
  /** Swatches are small and round; crowded, they read as one striped block. */
  spacious?: boolean;
  /**
   * Laid out across rather than down. The rail's panels hang off a vertical
   * column and read downwards; the properties bar's hang off a horizontal one
   * and have to read the same way as the bar they came from.
   */
  row?: boolean;
  children: ReactNode;
}) {
  const spacing = spacious
    ? row
      ? 'gap-2 px-1.5'
      : 'gap-2 py-1.5'
    : row
      ? 'gap-1 pr-2 pl-2 first:pl-0 last:pr-0'
      : 'gap-1 pb-1.5';
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center ${
        row
          ? 'border-r border-rt-tertiary last:border-r-0 last:pr-0'
          : 'flex-col border-b border-rt-tertiary last:border-b-0 last:pb-0'
      } ${spacing}`}
    >
      {children}
    </div>
  );
}

/** A titled block; used where a popover is wide enough to carry a heading. */
function PopoverSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        {label}
      </legend>
      <div className="mt-1.5">{children}</div>
    </fieldset>
  );
}

/** A sample of a stroke at one weight, so widths are compared by eye. */
function StrokeWeightIcon({ weight }: { weight: number }) {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} aria-hidden="true">
      <line
        x1="2"
        y1="10"
        x2="18"
        y2="10"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The same sample in one dash pattern; the icon is the thing it draws. */
function StrokeStyleIcon({ dash }: { dash?: string }) {
  return (
    <svg viewBox="0 0 20 20" width={15} height={15} aria-hidden="true">
      <line
        x1="2"
        y1="10"
        x2="18"
        y2="10"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        {...(dash ? { strokeDasharray: dash } : {})}
      />
    </svg>
  );
}

/**
 * A column of colours. Six is what a narrow strip holds and about as many as
 * anyone scans before picking; the rest of the contract's palette stays
 * reachable through the properties bar rather than crowding the tool.
 */
function ColorChoices<K extends string>({
  itemName,
  row = false,
  keys,
  colorFor,
  activeKey,
  disabled,
  onSelect,
}: {
  /** Singular, for each swatch's own name ("rose ink"). */
  itemName: string;
  row?: boolean;
  keys: readonly K[];
  colorFor: (key: K) => string;
  activeKey: K | null;
  disabled?: boolean;
  onSelect: (key: K) => void;
}) {
  return (
    <ToolStripGroup label={`${itemName} colour`} spacious row={row}>
      {keys.map((key) => (
        <SwatchButton
          key={key}
          label={`${key} ${itemName}`}
          color={colorFor(key)}
          active={activeKey === key}
          disabled={disabled}
          onSelect={() => onSelect(key)}
        />
      ))}
    </ToolStripGroup>
  );
}

/**
 * The paint order with `id` on top.
 *
 * Without an explicit order the legacy one applies, and that paints every node
 * beneath every stroke, path and table — which is why a text element dropped
 * onto a pen shape disappeared behind it. Adding an element pins the order as it
 * stands and puts the new one last.
 *
 * Returns undefined when there is nothing worth pinning: a canvas of nodes and
 * arrows alone already paints in the right order, and an artifact that does not
 * need a `z` should not carry one.
 */
function paintOrderWithNewestOnTop(graph: DiagramSnapshot, id: string): string[] | undefined {
  const mixed =
    (graph.ink?.length ?? 0) +
      (graph.paths?.length ?? 0) +
      (graph.tables?.length ?? 0) +
      (graph.arrows?.length ?? 0) >
    0;
  if (!graph.z?.length && !mixed) return undefined;

  const current = graph.z?.length ? graph.z : studioPaintOrder(graph).map((ref) => ref.key);
  const next = [...current.filter((key) => key !== id), id];
  // Past the limit the write path would reject the proposal outright, which is
  // a worse outcome than one element painting in its legacy position.
  return next.length > DIAGRAM_Z_LIMIT ? graph.z : next;
}

/** What the cursor is carrying while a tool waits for somewhere to put it. */
type Ghost =
  | { kind: 'node'; shape: DiagramNodeShape; size: DiagramNodeSize }
  | { kind: 'table'; rows: number; cols: number; size: DiagramNodeSize }
  | {
      kind: 'template';
      size: DiagramNodeSize;
      /** What it will put down, drawn faintly where it will land. */
      scene: StudioScene;
      /** Where the scene's own top-left is, so it can be drawn from the ghost's corner. */
      origin: DiagramPoint;
    };

/**
 * The box a drag-out asks for, grown from the corner the press started at.
 *
 * The only upper limit is the sheet: the pointer is already held on it, so a
 * drag can never ask for more than the room between the press and the edge.
 * A shape dragged smaller than the minimum still becomes the minimum rather
 * than being refused — the gesture said "a small one", and the nearest legal
 * answer is more useful than nothing appearing at all.
 *
 * Square (Shift) takes the longer side, but no more than the room on *both*
 * axes, so it stays square instead of being flattened by whichever edge it
 * reached first. Every size grows away from the press, so a drag up and to the
 * left keeps its corner under the press rather than jumping below it.
 */
function shapeRectFromDrag(
  origin: DiagramPoint,
  current: DiagramPoint,
  square: boolean,
  min: DiagramNodeSize = { width: DIAGRAM_MIN_NODE_WIDTH, height: DIAGRAM_MIN_NODE_HEIGHT },
): DiagramRect {
  const towardsRight = current.x >= origin.x;
  const towardsBottom = current.y >= origin.y;
  const roomX = towardsRight ? DIAGRAM_CANVAS_WIDTH - origin.x : origin.x;
  const roomY = towardsBottom ? DIAGRAM_CANVAS_HEIGHT - origin.y : origin.y;
  const dx = Math.abs(current.x - origin.x);
  const dy = Math.abs(current.y - origin.y);

  let width: number;
  let height: number;
  if (square) {
    const side = Math.max(Math.min(Math.max(dx, dy), roomX, roomY), min.width, min.height);
    width = side;
    height = side;
  } else {
    width = Math.max(dx, min.width);
    height = Math.max(dy, min.height);
  }
  width = Math.round(width);
  height = Math.round(height);
  return {
    x: towardsRight ? origin.x : origin.x - width,
    y: towardsBottom ? origin.y : origin.y - height,
    width,
    height,
  };
}

/**
 * The box a text-tool drag asks for: only its width.
 *
 * A text box's height is always what its text needs — it is refitted the
 * moment the text is committed — so a dragged height would only snap back.
 * The drag sets how wide the lines run, and the box starts one line tall.
 */
function textRectFromDrag(origin: DiagramPoint, current: DiagramPoint): DiagramRect {
  return shapeRectFromDrag(origin, { x: current.x, y: origin.y }, false, {
    width: DIAGRAM_MIN_NODE_WIDTH,
    height: DIAGRAM_NEW_TEXT_SIZE.height,
  });
}

function emptyTableSize({ rows, cols }: { rows: number; cols: number }): DiagramNodeSize {
  return { width: cols * newTableColWidth(cols), height: rows * TABLE_DEFAULT_ROW_HEIGHT };
}

/** A template's footprint, so its ghost is the shape it will occupy. */
function templateSize(template: StudioTemplate): DiagramNodeSize {
  const bounds = templateBounds(template);
  return { width: bounds.width, height: bounds.height };
}

/**
 * Everything a template puts down — shapes, tables and each arrow's whole
 * route — measured the way the board card measures a canvas, so the drop
 * preview, where it lands and what the card shows all agree.
 */
function templateBounds(template: StudioTemplate) {
  // Templates never change, and this runs on every pointer move while one is
  // carried — arrow routes and all — so each is measured once.
  const known = TEMPLATE_BOUNDS.get(template.id);
  if (known) return known;
  const bounds = studioSceneBounds(templateFragment(template));
  TEMPLATE_BOUNDS.set(template.id, bounds);
  return bounds;
}

const TEMPLATE_BOUNDS = new Map<string, ReturnType<typeof studioSceneBounds>>();

/**
 * A template's picture in the picker. Its own component, and memoised, so the
 * eight of them are drawn once rather than again on every render of the
 * editor while the picker is open.
 */
const TemplateThumbnail = memo(function TemplateThumbnail({
  template,
}: {
  template: StudioTemplate;
}) {
  return (
    <StudioArtwork
      scene={templateFragment(template)}
      fit="content"
      className="absolute inset-0 h-full w-full p-1"
    />
  );
});

/**
 * A control on the properties bar: an icon that opens its own choices.
 *
 * Defined here rather than inside the editor: a component declared during
 * render is a new component type every time, so React would tear its subtree
 * down and rebuild it on every keystroke — taking the focus in an open panel
 * with it.
 */
function BarMenu({
  label,
  icon,
  disabled,
  openMenu,
  onOpenChange,
  children,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  openMenu: string | null;
  onOpenChange: (next: string | null) => void;
  children: (close: () => void) => ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = openMenu === label;

  return (
    <span className="relative inline-flex">
      <Tooltip label={label} placement="bottom">
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => onOpenChange(open ? null : label)}
          className={BAR_CONTROL}
        >
          {icon}
        </button>
      </Tooltip>
      <Popover
        open={open}
        onClose={() => onOpenChange(null)}
        label={`${label} options`}
        placement="top-center"
        triggerRef={triggerRef}
      >
        {children(() => onOpenChange(null))}
      </Popover>
    </span>
  );
}

/**
 * What each cap is called.
 *
 * The tiles are pictures of the shape, so these exist for the screen reader and
 * for the tooltip — the two places a picture is no use.
 */
const ARROW_CAP_LABELS: Record<ArrowCap, string> = {
  none: 'No',
  line: 'Line arrow',
  solid: 'Solid arrow',
  triangle: 'Triangle',
  triangleHollow: 'Hollow triangle',
  circle: 'Circle',
  circleHollow: 'Hollow circle',
  diamond: 'Diamond',
  diamondHollow: 'Hollow diamond',
  bar: 'Bar',
};

/**
 * A cap, drawn as a tile for the picker.
 *
 * Straight out of `arrowCapGeometry`, so the tile is the shape the canvas will
 * actually draw rather than a hand-made icon that can drift from it.
 */
function CapTile({ cap }: { cap: ArrowCap }) {
  const geometry = arrowCapGeometry(cap, { x: 20, y: 10 }, 0, 2);
  return (
    <svg viewBox="0 0 24 20" width={20} height={16} aria-hidden="true">
      <path d="M 2 10 L 18 10" stroke="currentColor" strokeWidth={1.5} fill="none" />
      {geometry.d === '' ? null : (
        <path
          d={geometry.d}
          fill={geometry.closed ? (geometry.filled ? 'currentColor' : '#FFFFFF') : 'none'}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** The gap carried rows or columns will drop into: the surface, sunk. */
const STUDIO_DROP_SLOT_FILL = '#EEF2F4';

/** A resize grip on a frame's side rather than its corner. */
function isEdgeHandle(handle: DiagramResizeHandle): handle is 'n' | 'e' | 's' | 'w' {
  return handle === 'n' || handle === 'e' || handle === 's' || handle === 'w';
}

/** Shown faintly inside a selected element that has no label yet. */
const NODE_LABEL_PLACEHOLDER = 'Add text';

/** The ghost is held around the cursor, not hung below and right of it. */
function centredOnCursor(point: DiagramPoint, size: DiagramNodeSize): DiagramPoint {
  return { x: point.x - size.width / 2, y: point.y - size.height / 2 };
}

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

// The resize bands, in CSS pixels: the same size on screen at every zoom. The
// corner grips' sizes are shared with every other grip (`CHROME`).
/**
 * How wide the invisible band along each edge of the frame is. Centred on the
 * frame line, which sits `CHROME.frameOutset` outside the element, so even at 100%
 * it stops short of the element's body and a press there still moves it.
 */
const RESIZE_EDGE_PX = 8;
/** A finger needs more to aim at than a pointer does. */
const RESIZE_EDGE_COARSE_PX = 12;

// The glow along a selected stroke or path, the same on both: how much wider
// than the mark it is drawn, and how strongly.
const SELECTION_HALO_GROW = 5;
const SELECTION_HALO_OPACITY = 0.28;

// The buttons that grow the diagram from a selected shape, in CSS pixels.
/** Half the button, which is the size it opens up to near the pointer. */
const EXTEND_HANDLE_RADIUS_PX = 11;
/** Clear space between the resize band and the button. */
const EXTEND_HANDLE_CLEARANCE_PX = 6;
/** An average glyph's width over its size, as the label wrapping estimates it. */
const LABEL_GLYPH_ADVANCE = 0.55;
/** Room around an arrow label's grab area, so its edge is easy to catch. */
const LABEL_GRAB_PADDING = 6;
/** Where on a shape each side's button leaves from, for a loop back onto it. */
const EXTEND_SIDE_ATTACH: Record<ExtendSide, ArrowAttach> = {
  n: { u: 0.5, v: 0 },
  e: { u: 1, v: 0.5 },
  s: { u: 0.5, v: 1 },
  w: { u: 0, v: 0.5 },
};
/** How close the pointer has to come before a button wakes from a dot. */
const EXTEND_NEAR_PX = 36;
/** How far past the frame the outer edge of a button reaches, for the bar to clear. */
const EXTEND_HANDLE_REACH_PX =
  RESIZE_EDGE_COARSE_PX / 2 + EXTEND_HANDLE_CLEARANCE_PX + EXTEND_HANDLE_RADIUS_PX * 2;

/**
 * An inline editor should look like the text it replaces, not like a form field.
 *
 * Every inline editor used to be a bordered white box at a fixed 11px, which
 * made three separate problems out of one cause: a visible input sitting on the
 * canvas, editing text that did not match the text being edited, and the
 * original showing around a box too small to cover it. Painting nothing and
 * inheriting the element's own settings answers all three.
 */
const INLINE_EDITOR_CLASS =
  'block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none select-text';

const INLINE_FONT_FAMILY = 'Inter, system-ui, sans-serif';

/**
 * The padding that makes a label editor wrap exactly where its label will.
 *
 * `wrapDiagramLabel` measures against `width * diagramLabelWidthRatio(shape)`
 * minus `DIAGRAM_LABEL_PADDING`, and a tapered shape's ratio is well under 1 —
 * a triangle is 0.5. Padding the editor by a flat 6 each side let a triangle
 * wrap at about 15 characters a line while the shape itself wrapped at 6, so a
 * label that looked fine while it was typed collapsed to an ellipsis the
 * moment it was committed.
 */
function labelEditorInset(node: DiagramNode): number {
  const width = effectiveDiagramNodeSize(node).width;
  const usable = width * diagramLabelWidthRatio(node.shape);
  return Math.max(2, (width - usable + DIAGRAM_LABEL_PADDING) / 2);
}

/** Lines are spaced exactly as `diagramNodeLabelLayout` spaces the rendered ones. */
const INLINE_LINE_HEIGHT = 1.25;

/**
 * How far outside each corner you can still grab to turn the element.
 *
 * Deep enough to find without aiming, shallow enough that two shapes sitting
 * beside each other do not both claim the gap between them.
 */

/**
 * There is no CSS cursor that means "rotate", so this draws one.
 *
 * A dark arc with a white casing under it, which is what keeps it legible on a
 * dark fill as well as on the bare sheet. `grab` is the fallback for anywhere
 * the data URI cannot be loaded, and it is close enough in meaning to be safe.
 */
const ROTATE_CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'>" +
  "<g fill='none' stroke='#FFFFFF' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M5 13.5a7 7 0 1 0 1.2-6.6'/><path d='M3 4.2v4.6h4.6'/></g>" +
  "<g fill='none' stroke='#141A24' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M5 13.5a7 7 0 1 0 1.2-6.6'/><path d='M3 4.2v4.6h4.6'/></g></svg>";

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 11 11, grab`;

/**
 * The dashed box around a selected element.
 *
 * Drawn in the element's own frame and rendered inside whatever transform the
 * element already carries, so on a turned element the box turns with it rather
 * than growing into the upright rectangle that contains it. That is the whole
 * point of a selection box you can rotate by: it has to show which way "up" is
 * for the thing you are holding.
 *
 * Every kind uses this. Ink and paths used to show only a halo tracing the
 * mark, which said what was selected but gave nothing to grab.
 */
function SelectionFrame({
  bounds,
  pixel,
  inset = CHROME.frameOutset * pixel,
  member = false,
  target = false,
  testId,
}: {
  bounds: DiagramRect;
  /** One CSS pixel in scene units, so the frame looks the same at every zoom. */
  pixel: number;
  inset?: number;
  /**
   * One of several selected elements. The group's frame is the one to pull
   * then, so each member only shows a quiet outline saying it is in the group.
   */
  member?: boolean;
  /**
   * Something a drop or a snap will land on. The same box as a selection, so
   * the eye reads it as "this one", but solid and heavier: it is a promise
   * about what a release will do, not a statement about what is held.
   */
  target?: boolean;
  testId?: string;
}) {
  const strokeWidth =
    (target ? CHROME.targetStroke : member ? CHROME.memberStroke : CHROME.frameStroke) * pixel;
  return (
    <rect
      // Fades up rather than snapping on, so a selection that changes under the
      // cursor is followed rather than noticed.
      className="rt-studio-fade"
      data-testid={testId ?? (member ? 'selection-member' : 'selection-frame')}
      x={bounds.x - inset}
      y={bounds.y - inset}
      width={bounds.width + inset * 2}
      height={bounds.height + inset * 2}
      rx={CHROME.frameRadius * pixel}
      fill="none"
      stroke={STUDIO_ACCENT}
      strokeWidth={strokeWidth}
      strokeOpacity={member ? CHROME.memberOpacity : 1}
      {...(member || target ? {} : { strokeDasharray: chromeDash(CHROME.frameDash, pixel) })}
      pointerEvents="none"
    />
  );
}

const STROKE_WIDTH_LABELS: Record<DiagramStrokeWidthPreset, string> = {
  thin: 'Thin',
  regular: 'Regular',
  thick: 'Thick',
};

/**
 * The arrow as its label is typed and stored: an arrow labelled for the first
 * time takes the size new text does (Medium), as a new shape's label does.
 *
 * Only a first label. An arrow that already carries one without a preset was
 * drawn at the legacy size, and giving it one on the next edit would suddenly
 * enlarge a label someone laid out around — the same no-reflow rule stored
 * diagrams keep.
 */
function withNewLabelSize(arrow: ArrowElement): ArrowElement {
  if (arrow.fontSizePreset || arrow.label) return arrow;
  return { ...arrow, fontSizePreset: DIAGRAM_NEW_NODE_FONT_SIZE };
}

const FONT_SIZE_LABELS: Record<DiagramFontSizePreset, string> = {
  small: 'S',
  medium: 'M',
  large: 'L',
  xlarge: 'XL',
};

const STROKE_STYLE_LABELS: Record<DiagramStrokeStyle, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
};

/**
 * The checkerboard every graphics tool uses for "nothing here".
 *
 * A transparent swatch painted with its own colour would be an empty circle,
 * indistinguishable from a white one. Drawn rather than iconified so it sits in
 * the same swatch row as the colours and answers the same click.
 */
const TRANSPARENT_SWATCH_STYLE: CSSProperties = {
  backgroundColor: '#FFFFFF',
  backgroundImage: 'conic-gradient(#C3CFD6 25%, transparent 0 50%, #C3CFD6 0 75%, transparent 0)',
  backgroundSize: '7px 7px',
};

// Sized by its grid column rather than fixed, so a row of swatches fits
// whichever strip it is laid out in.
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
    <Tooltip label={label} placement="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onSelect}
        className={`${SUBTOOL_SWATCH_SIZE} shrink-0 rounded-full border-2 transition-shadow disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none ${
          active ? 'border-rt-ink shadow-[0_0_0_2px_rgba(224,163,60,0.45)]' : 'border-rt-tertiary'
        }`}
        style={color === 'transparent' ? TRANSPARENT_SWATCH_STYLE : { backgroundColor: color }}
      />
    </Tooltip>
  );
}

function PresetButton({
  label,
  name,
  active,
  disabled,
  onSelect,
}: {
  /** What the button shows — an icon wherever one can carry the meaning. */
  label: ReactNode;
  /** Accessible name; the icon alone does not identify the control. */
  name: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip label={name} placement="top">
      <button
        type="button"
        aria-label={name}
        aria-pressed={active}
        disabled={disabled}
        onClick={onSelect}
        className={`flex ${SUBTOOL_SIZE} shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none ${
          active
            ? 'border-rt-primary bg-rt-primary-tint text-rt-ink'
            : 'border-rt-tertiary bg-rt-surface text-rt-ink-muted hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink'
        }`}
      >
        {label}
      </button>
    </Tooltip>
  );
}

/**
 * Where an element is placed, and how far it is turned.
 *
 * The rotation is applied *after* the translate and about the element's own
 * local centre, so the children underneath keep working in the same unrotated
 * coordinates they always have — a shape's label, its fill and its handles all
 * come along for free.
 *
 * An unrotated element produces exactly the `translate(x, y)` it always did:
 * this must not start writing a `rotate(0 …)` onto every element on the sheet.
 */
function placementTransform(
  x: number,
  y: number,
  size: DiagramNodeSize,
  rotation?: number,
): string {
  const translate = `translate(${x}, ${y})`;
  if (!rotation) return translate;
  return `${translate} rotate(${rotation} ${size.width / 2} ${size.height / 2})`;
}

/**
 * The element's own text settings, as CSS.
 *
 * Read from the same resolver the renderer uses, so the two cannot drift: what
 * the label will look like is what it looks like while it is being typed.
 */
function inlineLabelStyle(node: DiagramNode): CSSProperties {
  const style = diagramNodeLabelStyle(node, effectiveDiagramNodeSize(node).width);
  return {
    fontSize: `${diagramNodeFontSize(node)}px`,
    fontFamily: INLINE_FONT_FAMILY,
    fontWeight: style.fontWeight,
    color: style.fill,
    textAlign: node.labelAlign ?? 'center',
    lineHeight: INLINE_LINE_HEIGHT,
  };
}

/**
 * How many rows the field needs to show everything typed into it.
 *
 * Counted with the same wrapper the renderer uses rather than measured from the
 * DOM, for the same reason that wrapper exists: it is the one answer the editor
 * and the board card already agree on. Uncapped, so the field grows with the
 * text instead of scrolling it out of sight.
 */
function inlineLabelRows(node: DiagramNode): number {
  const size = effectiveDiagramNodeSize(node);
  const usable = size.width * diagramLabelWidthRatio(node.shape);
  const lines = wrapDiagramLabel(
    node.label,
    usable,
    diagramNodeFontSize(node),
    Number.MAX_SAFE_INTEGER,
  );
  return Math.max(1, lines.length);
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
  // Propose sits in the studio's header, outside the form, and submits it by id.
  const formId = useId();
  const {
    draftScope,
    extensionSource,
    isReusing,
    isExtendingOwn,
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
  /**
   * What this canvas is, for the purpose of keeping a draft. Composing,
   * extending and editing are three different pieces of work from one tool, so
   * each keeps its own — and an edit's belongs to the proposal it rewrites.
   */
  const draftKeyScope: StudioDraftScope = {
    ...draftScope,
    mode: editSource ? 'edit' : extensionSource ? 'extend' : 'compose',
    sourceId: sourceProposal?.id ?? null,
  };
  const draftStorage = typeof window === 'undefined' ? undefined : window.sessionStorage;

  const initialSnapshotRef = useRef<DiagramSnapshot | null>(null);
  // The source as it opens on the canvas, kept to tell an extension that has
  // changed from one that has not. Null when there is no source to compare to.
  const sourceKeyRef = useRef<string | null>(null);
  if (!initialSnapshotRef.current) {
    const toSnapshot = (from: NonNullable<typeof sourceArtifact>): DiagramSnapshot => ({
      nodes: from.nodes.map((node) => ({ ...node })),
      edges: from.edges.map((edge) => ({ ...edge })),
      // Prefilling only the shapes would quietly drop half the artifact, which
      // is as true of a restored draft as of an extended canvas.
      ...(from.ink?.length ? { ink: dataToInk(from.ink) } : {}),
      ...(from.paths?.length ? { paths: from.paths.map((path) => ({ ...path })) } : {}),
      ...(from.tables?.length ? { tables: from.tables.map((table) => ({ ...table })) } : {}),
      ...(from.arrows?.length ? { arrows: from.arrows.map((arrow) => ({ ...arrow })) } : {}),
      ...(from.z?.length ? { z: [...from.z] } : {}),
    });
    // A proposal is stored tucked into the sheet's top-left corner, framed for
    // its card on the board. Opened for editing or extending, it is centred
    // instead; proposing tucks it back, so the card looks the same after.
    const source = sourceArtifact ? centreStudioContent(toSnapshot(sourceArtifact)) : null;
    // What the source would store if proposed as it stands, not where it sits
    // on the canvas: see `preparedDiagramKey`.
    sourceKeyRef.current = source ? preparedDiagramKey(source) : null;
    // A kept draft is what was last on this canvas, so it wins over the source
    // it was started from — the source is already in it — and it opens exactly
    // where it was left rather than being moved.
    const draft = readStudioDraft(draftStorage, draftKeyScope);
    initialSnapshotRef.current = draft ? toSnapshot(draft) : (source ?? { nodes: [], edges: [] });
  }
  const history = useDiagramHistory(initialSnapshotRef.current);
  /**
   * An extension that still matches its original. Proposing it would put an
   * identical card on the board marked as building on the first, so Propose
   * waits for a change. Compared with the source rather than with where the
   * history started, so a restored draft that already differs is not held
   * back — and undoing every change holds it back again. Reuse is exempt:
   * bringing an idea to a new question unchanged is the point of it.
   *
   * Judged on what proposing would store, so moving everything together — which
   * proposing undoes — is not a change. Worked out once per change to the
   * canvas, not on every render the pointer causes.
   */
  const extending = extensionSource !== null && !isReusing && sourceKeyRef.current !== null;
  const canvasKey = useMemo(
    () => (extending ? preparedDiagramKey(history.snapshot) : null),
    [extending, history.snapshot],
  );
  const unchangedExtension = extending && canvasKey !== null && canvasKey === sourceKeyRef.current;
  const { nodes, edges } = history.snapshot;
  const ink = history.snapshot.ink ?? [];
  const paths = history.snapshot.paths ?? [];
  const arrows = history.snapshot.arrows ?? [];
  // Worded as the footer words them, for the bar the studio minimises to when
  // somebody peeks at the board. Connections and standalone arrows are one
  // count, as they are to whoever drew them.
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  useReportStudioStatus([
    plural(nodes.length, 'element', 'elements'),
    plural(edges.length + arrows.length, 'arrow', 'arrows'),
    ...(ink.length > 0 ? [plural(ink.length, 'stroke', 'strokes')] : []),
    ...(paths.length > 0 ? [plural(paths.length, 'path', 'paths')] : []),
    ...(history.snapshot.tables?.length
      ? [plural(history.snapshot.tables.length, 'table', 'tables')]
      : []),
  ]);
  const paintOrder = studioPaintOrder(history.snapshot);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  // The picker opened from a shape's extend button: which shape, which side.
  const [extendPicker, setExtendPicker] = useState<{ sourceId: string; side: ExtendSide } | null>(
    null,
  );
  // A press on an extend button, until it is known to be a click or a drag.
  const extendPressRef = useRef<{
    pointerId: number;
    sourceId: string;
    side: ExtendSide;
    startClient: DiagramPoint;
    dragging: boolean;
  } | null>(null);
  const extendHandleRefs = useRef(new Map<ExtendSide, HTMLButtonElement>());
  /**
   * An arrow that has just been left pointing at nothing, and where it ends.
   *
   * The arrow is already placed and already valid; this only offers to put
   * something at the end of it. A ref beside the state because the picker's own
   * click handler runs after a render that may have moved on.
   */
  const [shapePicker, setShapePicker] = useState<{ arrowId: string; at: DiagramPoint } | null>(
    null,
  );
  const shapePickerRef = useRef<{ arrowId: string; at: DiagramPoint } | null>(null);
  shapePickerRef.current = shapePicker;
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  // Where the element being placed would land. Following the cursor lets it be
  // positioned before it exists, rather than dropped somewhere and dragged.
  const [ghostCursor, setGhostCursor] = useState<DiagramPoint | null>(null);
  // The shape being dragged in from the palette, if any. A drag's payload can
  // only be read on the drop, so the palette says what it is carrying up front
  // — otherwise there is nothing to preview until it lands.
  const [paletteDrag, setPaletteDrag] = useState<DiagramNodeShape | null>(null);
  /**
   * The rectangle being dragged out for a new shape, if one is.
   *
   * State rather than a ref alone because the ghost has to redraw as it grows;
   * the ref beside it is what the pointer handlers read, for the same reason
   * every other gesture here keeps one.
   */
  const [shapeDraft, setShapeDraft] = useState<{
    origin: DiagramPoint;
    current: DiagramPoint;
  } | null>(null);
  const shapeDraftRef = useRef<{ pointerId: number; origin: DiagramPoint; moved: boolean } | null>(
    null,
  );
  /** Whether shift was held on the last move, which constrains the drag to a square. */
  /**
   * Whether the drag-out is constrained to a square.
   *
   * State, not a ref: the preview has to redraw the moment Shift goes down, and
   * a ref read during render never triggers that. Held down without moving the
   * pointer, the rectangle simply stayed a rectangle until the next movement.
   */
  const [shapeDraftSquare, setShapeDraftSquare] = useState(false);
  // Which of the two arrow tiles is armed, and the arrow being drawn. The draft
  // is the whole of the placement state: a press sets `from`, the pointer sets
  // `to`, and the second press turns it into an element.
  const [pendingArrowRoute, setPendingArrowRoute] = useState<ArrowRoute>('elbow');
  const [arrowDraft, setArrowDraftState] = useState<ArrowDraft | null>(null);
  // Mirrored in a ref: a press and the release that follows it can land in one
  // React batch, and the release has to see what the move just wrote.
  const arrowDraftRef = useRef<ArrowDraft | null>(null);
  // What the pointer is currently over, so the feedback dot can say what an
  // endpoint dropped here would bind to — before as well as during a drag.
  const [arrowSnap, setArrowSnap] = useState<ArrowSnap | null>(null);
  // A press that has not yet travelled far enough to be a drag. Lifting before
  // it does leaves the draft open, which is the click-then-click gesture.
  const arrowPressRef = useRef<{ pointerId: number; committed: boolean } | null>(null);
  // Re-pointing one end of an existing arrow, or sliding an elbow's middle leg.
  const arrowEditRef = useRef<{
    pointerId: number;
    arrowId: string;
    handle: 'from' | 'to' | 'bend' | 'label';
    previous: DiagramSnapshot;
    moved: boolean;
  } | null>(null);
  // Which of the properties bar's controls has its choices open.
  const [openBarMenu, setOpenBarMenu] = useState<string | null>(null);
  const [shortcutSheetOpen, setShortcutSheetOpen] = useState(false);
  const shortcutTriggerRef = useRef<HTMLButtonElement>(null);
  // Which shape the palette armed. Only meaningful under the `shape` tool.
  const [pendingShape, setPendingShape] = useState<DiagramNodeShape>('box');
  // A table or a starter frame that has been picked up but not put down. Both
  // are null until a size or a frame is chosen: arming the tool alone must not
  // make a stray press on the canvas produce something.
  const [pendingTable, setPendingTable] = useState<{ rows: number; cols: number } | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<StudioTemplate | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [view, setView] = useState<DiagramView>(DIAGRAM_DEFAULT_VIEW);
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [clipboard, setClipboard] = useState<StudioFragment | null>(null);
  const [marquee, setMarquee] = useState<MarqueeSession | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingContainerDelete, setPendingContainerDelete] = useState<string | null>(null);
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
  const [selectedArrowIds, setSelectedArrowIds] = useState<string[]>([]);
  // Which arrow's label is open for typing. An arrow has no inside to type in,
  // so its label is edited in a field floated over the middle of the line.
  const [editingArrowId, setEditingArrowId] = useState<string | null>(null);
  const arrowLabelInputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * The arrow label as it is being typed, before it is committed.
   *
   * Held here rather than read back off the stored arrow so the field and the
   * box around it grow with the text. Deliberately not previewed into history
   * on every keystroke the way a node label is: `commitArrowLabel` is a single
   * entry, and per-keystroke previews would churn the undo stack for nothing.
   */
  const [arrowLabelDraft, setArrowLabelDraft] = useState('');
  // Closing the editor unmounts the field, which fires its own blur. Without
  // this flag that blur commits the very text Escape just abandoned — the same
  // reason the table cell keeps one.
  const arrowLabelCancelledRef = useRef(false);
  // A canvas element's native dblclick never arrives — pointer capture eats the
  // compatibility events — so a second press is detected the same way every
  // other element on this canvas detects one.
  const lastArrowPressRef = useRef<NodePress | null>(null);
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
    /** How far, in scene units, the pointer has to travel before this is a drag. */
    slop: number;
    /** What a press that never became a drag does instead. */
    onClick?: () => void;
  } | null>(null);
  // A press inside a table's cells, dragged across them to pick a block.
  const cellRangeDragRef = useRef<{ pointerId: number; tableId: string; anchor: CellRef } | null>(
    null,
  );
  // The selected table's add buttons and grips, woken by the pointer directly.
  const tableChromeRef = useRef<TableChromeHandle>(null);
  // Whole rows or columns picked up by their handle and being carried.
  const trackDragRef = useRef<{
    pointerId: number;
    tableId: string;
    axis: TableAxis;
    start: number;
    end: number;
    origin: DiagramPoint;
    moved: boolean;
    boundary: number | null;
    /** The canvas at the press: the reflow is previewed from it and undone to it. */
    previous: DiagramSnapshot;
    /** The table at the press. */
    original: TableElement;
    /** How far into the carried block the pointer took hold, along the drag. */
    grab: number;
    /** The carried rows or columns on their own, taken once when the drag starts. */
    lifted: TableElement | null;
  } | null>(null);
  // What is drawn while they are carried: the gap they will drop into, and the
  // rows themselves under the pointer.
  const [trackDrag, setTrackDrag] = useState<{
    tableId: string;
    axis: TableAxis;
    /** Where the block sits in the reflowed table. */
    first: number;
    count: number;
    /** The carried rows or columns on their own, from the table at the press. */
    lifted: TableElement;
    /** Where the block's leading edge follows the pointer to, along the drag. */
    at: number;
  } | null>(null);
  // A second press on a table's line fits the row or column to its text.
  const lastTableLinePressRef = useRef<NodePress | null>(null);
  // Table creation size, and which cell of which table is in hand.
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  // Pen and line styling, kept apart from the freehand ink's own pen.
  const [pathColor, setPathColor] = useState<DiagramStrokeKey>('ink');
  const [pathWidth, setPathWidth] = useState<DiagramStrokeWidthPreset>('regular');
  const [pathStyle, setPathStyle] = useState<DiagramStrokeStyle>('solid');
  // Whether a closed shape is filled. Which colour is not a separate choice:
  // the fill takes the line's own, so the control is a yes/no.
  const [pathFilled, setPathFilled] = useState(false);
  const pathFillColor = pathFilled ? FILL_FOR_STROKE[pathColor] : null;
  const selectedPathId = selectedPathIds.length === 1 ? (selectedPathIds[0] ?? null) : null;
  const selectedTableId = selectedTableIds.length === 1 ? (selectedTableIds[0] ?? null) : null;
  // The bar edits one thing at a time, so its controls read from this rather
  // than from the set a marquee may have swept up.
  const selectedArrowId = selectedArrowIds.length === 1 ? (selectedArrowIds[0] ?? null) : null;
  const [cellRange, setCellRange] = useState<CellRange | null>(null);
  const [editingCell, setEditingCell] = useState<CellRef | null>(null);
  const cellInputRef = useRef<HTMLTextAreaElement>(null);
  // Closing the editor unmounts the input, which fires its own blur. Without
  // this flag that blur would commit the very text Escape just abandoned.
  const cellEditCancelledRef = useRef(false);
  // Opening a cell to edit it selects what is there, so typing replaces it.
  // Opening it *by* typing must not: the first character is already in the box
  // and selecting it would make the second keystroke overwrite it.
  const cellEditSelectAllRef = useRef(true);
  /**
   * The cell's text as it is being typed.
   *
   * Controlled for the same reason the arrow label is: `rows` and the box round
   * it are worked out from this, so the field grows with what is in it instead
   * of staying the size the cell was when it opened.
   */
  const [cellDraft, setCellDraft] = useState('');
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
  // The box the floating toolbars are positioned inside; the canvas is centred
  // within it, so the two do not share an origin.
  const canvasFrameRef = useRef<HTMLElement>(null);
  const inlineLabelInputRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const resizeRef = useRef<ResizeSession | null>(null);
  const rotateRef = useRef<RotateSession | null>(null);
  const panRef = useRef<PanSession | null>(null);
  const marqueeRef = useRef<MarqueeSession | null>(null);
  const lastNodePressRef = useRef<NodePress | null>(null);
  const nodeLabelStartRef = useRef<DiagramSnapshot | null>(null);
  const edgeLabelStartRef = useRef<DiagramSnapshot | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  // The shape of the surface, watched rather than assumed: the canvas fills the
  // window, so it changes with the window.
  const [canvasAspect, setCanvasAspect] = useState(DIAGRAM_CANVAS_WIDTH / DIAGRAM_CANVAS_HEIGHT);
  // The surface's size in CSS pixels, so chrome that should stay the same size
  // on screen can be converted into scene units. Zero until first measured.
  const [canvasPixels, setCanvasPixels] = useState({ width: 0, height: 0 });
  // What is actually drawn. Wider or taller than the view being manipulated, by
  // exactly the difference between the view's shape and the surface's, so the
  // space around the sheet is visible instead of letterboxed away.
  const renderedView = expandViewToAspect(view, canvasAspect);
  const renderedViewRef = useRef(renderedView);
  renderedViewRef.current = renderedView;
  /** One CSS pixel, in scene units at the current zoom. */
  const pixel = scenePerPixel(renderedView, canvasPixels);
  /** How far every selection frame sits outside what it surrounds. */
  const frameOutset = CHROME.frameOutset * pixel;
  // More than one element selected, of whatever kinds: the group's frame takes
  // over from each element's own grips.
  const multiSelected =
    selectedIds.length +
      selectedInkIds.length +
      selectedPathIds.length +
      selectedTableIds.length +
      selectedArrowIds.length >
    1;
  // Read once: whether the primary pointer is a finger, which wants bigger grips.
  const [coarsePointer] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true,
  );

  const selectedId = selectedIds.length === 1 ? selectedIds[0]! : null;
  const selectedNode = selectedNodeById(nodes, selectedId);
  // The extend picker belongs to one shape. Selecting anything else — or more
  // than it — puts the offer away rather than leaving it pointing elsewhere.
  useEffect(() => {
    if (!extendPicker) return;
    if (selectedId !== extendPicker.sourceId || multiSelected) setExtendPicker(null);
  }, [extendPicker, selectedId, multiSelected]);
  const selectedEdge = selectedEdgeByKey(edges, selectedEdgeKey);
  const isSubmitting = submissionStatus === 'submitting';
  // Controls grey out only for a send that is taking a while; see
  // `useSlowSubmission`. `isSubmitting` still refuses input from the start.
  const showSubmitting = useSlowSubmission(isSubmitting);
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
  const canvasHasContent =
    nodes.length + edges.length + ink.length + paths.length + tables.length + arrows.length > 0;
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const arrowById = new Map(arrows.map((arrow) => [arrow.id, arrow]));
  const selectedArrow = selectedArrowId ? (arrowById.get(selectedArrowId) ?? null) : null;
  const editingArrow = editingArrowId ? (arrowById.get(editingArrowId) ?? null) : null;
  // Bound endpoints are resolved against the whole canvas, so an arrow follows
  // whatever it points at as that element is moved, resized or reshaped. Built
  // once and read two ways: by id when drawing, and swept when snapping.
  const arrowTargetMap = arrowTargets({ nodes, ink, paths, tables });
  const arrowTargetsById: ArrowTargetLookup = (id) => arrowTargetMap.get(id);
  const selectedTable = selectedTableId ? (tableById.get(selectedTableId) ?? null) : null;
  // The cells in hand, grown to take in whole any merged cell they touch. The
  // range as stored is where the presses and keys put it; this is what is
  // drawn as selected and what every action on the cells acts on, so none of
  // them can ever work on part of a merged cell.
  const heldRange =
    selectedTable && cellRange ? expandRangeToMerges(selectedTable, cellRange) : null;
  const edgeIndexByKey = new Map(edges.map((edge, index) => [edgeKey(edge), index]));
  const edgeArrowColors = [...new Set(edges.map((edge) => diagramEdgeStroke(edge)))];
  // Routing is derived from the edge set, never stored: a reciprocal pair bows
  // apart so both directions stay readable.
  const edgeRoutes = diagramEdgeRoutes(nodes, edges);
  const edgeArrowId = (color: string) => `diagram-editor-arrow-${color.replace('#', '')}`;
  const marqueeRect: DiagramRect | null = marquee
    ? normalizeRect(marquee.origin, marquee.current)
    : null;
  // The box a drag-out is asking for, once the press has actually travelled: a
  // plain click must still place the default size, as it always has.
  const shapeDragRect =
    shapeDraft && shapeDraftRef.current?.moved
      ? canvasTool === 'text'
        ? textRectFromDrag(shapeDraft.origin, shapeDraft.current)
        : shapeRectFromDrag(shapeDraft.origin, shapeDraft.current, shapeDraftSquare)
      : null;
  // What is being carried, if anything. Everything placed by pressing the
  // canvas is previewed the same way, and the ghost sits exactly where the
  // element will land, so "where will this go" is always answered by the thing
  // under the cursor rather than something near it.
  const ghost = ((): Ghost | null => {
    // A drag from the palette previews exactly as a click-placed shape does.
    if (paletteDrag) return { kind: 'node', shape: paletteDrag, size: newNodeSize(paletteDrag) };
    if (canvasTool === 'text') {
      return {
        kind: 'node',
        shape: 'text',
        size: shapeDragRect
          ? { width: shapeDragRect.width, height: shapeDragRect.height }
          : DIAGRAM_NEW_TEXT_SIZE,
      };
    }
    if (canvasTool === 'shape') {
      // Mid drag-out the preview is the rectangle being dragged, so what grows
      // under the cursor is exactly what lands when the button comes up.
      return {
        kind: 'node',
        shape: pendingShape,
        size: shapeDragRect
          ? { width: shapeDragRect.width, height: shapeDragRect.height }
          : diagramNodeSize(pendingShape),
      };
    }
    if (canvasTool === 'table' && pendingTable) {
      return { kind: 'table', ...pendingTable, size: emptyTableSize(pendingTable) };
    }
    if (canvasTool === 'template' && pendingTemplate) {
      const bounds = templateBounds(pendingTemplate);
      return {
        kind: 'template',
        size: { width: bounds.width, height: bounds.height },
        scene: templateFragment(pendingTemplate),
        origin: { x: bounds.x, y: bounds.y },
      };
    }
    return null;
  })();
  // A dragged-out shape grows from the corner the press started at, so it is
  // placed at that corner rather than centred under the cursor the way a
  // single-click placement is.
  const ghostAt =
    ghost && shapeDragRect
      ? placeNodePosition(shapeDragRect, ghost.size, snapEnabled)
      : ghost && ghostCursor
        ? placeNodePosition(centredOnCursor(ghostCursor, ghost.size), ghost.size, snapEnabled)
        : { x: 0, y: 0 };

  /**
   * Shift squares a drag-out the moment it is pressed, not on the next move.
   *
   * Pointer events are the only place the modifier was read, so holding Shift
   * still showed a rectangle until the pointer happened to move again.
   */
  useEffect(() => {
    if (!shapeDraft) return;

    function onShift(event: globalThis.KeyboardEvent) {
      if (event.key === 'Shift') setShapeDraftSquare(event.type === 'keydown');
    }

    document.addEventListener('keydown', onShift);
    document.addEventListener('keyup', onShift);
    return () => {
      document.removeEventListener('keydown', onShift);
      document.removeEventListener('keyup', onShift);
    };
  }, [shapeDraft]);

  /**
   * Escape puts down whatever is being carried, from wherever the key is
   * pressed.
   *
   * Listened for on the document rather than on the canvas: a shape is armed by
   * pressing a button on the rail, which is where focus stays, so a handler that
   * waited for canvas focus would never run — which is exactly what happened.
   * Bubble phase, so an open popover still gets first refusal on the key and
   * closes itself before anything is put down.
   */
  // An arrow has no ghost — its preview is the rubber band itself — but Escape
  // has to put it down all the same. So does the offer at an arrow's loose end,
  // which can be raised from a connection handle while the tool is back on
  // Select: that left it dismissable only with focus in the form.
  //
  // Any armed tool counts too, holding something or not: Escape steps back to
  // Select before it steps out of the studio. Without this a brush or a pen
  // with nothing in hand let the key straight through to the overlay, which
  // left the studio when all that was wanted was to put the tool down.
  const somethingToPutDown =
    ghost !== null ||
    canvasTool !== 'select' ||
    shapePicker !== null ||
    extendPicker !== null ||
    arrowDraft !== null;
  // Read through a ref so the listener is attached once per carry rather than
  // on every render of the whole editor.
  const cancelPlacementRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!somethingToPutDown) return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // Deliberately not checking `defaultPrevented`. A popover that wants this
      // key stops it in the capture phase, so this never runs for one — while
      // the overlay marks every Escape as handled to stop the browser treating
      // it as a request to close the studio, which would switch this off.
      const target = event.target as HTMLElement | null;
      // Not while something is being typed into: Escape belongs to the field.
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true
      ) {
        return;
      }
      // Tucked away on the board, the editor stays mounted but its canvas is
      // inert, and Escape there brings the studio back — it must not also put
      // the armed tool down behind the user's back.
      if (canvasRef.current?.closest('[inert]')) return;
      event.preventDefault();
      cancelPlacementRef.current();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [somethingToPutDown]);

  /**
   * Ctrl/Cmd with +, - or 0 zooms the canvas, not the page.
   *
   * These are the keys everyone already reaches for, and without this they
   * zoomed the whole browser tab — rail, bar and all — around a canvas that
   * stayed exactly as it was. On the document because focus is as often on the
   * rail as on the canvas. The pinboard's own handler stands aside inside the
   * studio dialog, so the two never both act on one key — and this one stands
   * aside while the studio is tucked away: the editor stays mounted then, but
   * its canvas is inert and the keys belong to the board.
   */
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const canvas = canvasRef.current;
      if (!canvas || canvas.closest('[inert]')) return;
      const direction =
        event.key === '=' || event.key === '+'
          ? 'in'
          : event.key === '-' || event.key === '_'
            ? 'out'
            : event.key === '0'
              ? 'reset'
              : null;
      if (!direction) return;
      event.preventDefault();
      setView((current) =>
        direction === 'reset' ? DIAGRAM_DEFAULT_VIEW : stepDiagramView(current, direction),
      );
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    // Closing keeps the canvas now, so there is nothing to warn about: the
    // question this used to ask — discard your unsaved changes? — has no
    // truthful answer when the changes are not going anywhere.
    setCloseGuard(() => true);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // The draft lives with the tab, so closing the tab is the one exit that
      // still loses it.
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
      // A mouse wheel clicks: one notch is a line or page (Firefox) or a big
      // pixel jump (about 100 elsewhere). Scaling by that jump made one notch
      // about 1.65x. A notch now moves one zoom stop, the same step as the
      // buttons and keys. A trackpad pinch sends a stream of small deltas and
      // stays continuous, or it would stutter from stop to stop.
      const notch = event.deltaMode !== 0 || Math.abs(event.deltaY) >= WHEEL_NOTCH_DELTA;
      if (notch) {
        if (event.deltaY === 0) return;
        setView((current) => stepDiagramView(current, event.deltaY < 0 ? 'in' : 'out', anchor));
        return;
      }
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

  /** Open one cell for typing, with the draft seeded so the field starts right. */
  function openCellEditor(cell: CellRef, text: string, selectAll: boolean) {
    cellEditCancelledRef.current = false;
    cellEditSelectAllRef.current = selectAll;
    setCellDraft(text);
    // Only a cell that shows can be typed into: a covered one has no editor.
    setEditingCell(selectedTable ? resolveCell(selectedTable, cell) : cell);
  }

  function clearError() {
    setValidationError(null);
    if (submissionError) resetSubmission();
  }

  function surfacePoint(event: { clientX: number; clientY: number }): DiagramPoint {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    const point = clientPointToDiagramPoint(
      { x: event.clientX, y: event.clientY },
      { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
      renderedViewRef.current,
    );
    // Held on the sheet. The canvas reaches the window now, so a press can land
    // well outside the drawing surface, and nothing may be made out there —
    // clamping here covers every tool at once rather than each one separately.
    // Panning is unaffected: it works from raw client deltas, not from this.
    return {
      x: Math.min(Math.max(point.x, 0), DIAGRAM_CANVAS_WIDTH),
      y: Math.min(Math.max(point.y, 0), DIAGRAM_CANVAS_HEIGHT),
    };
  }

  /**
   * Select one element and nothing else.
   *
   * These three deliberately set each kind rather than going through
   * `applySelection`: that also steps out of the path and table editing
   * sub-modes, and a caller here is often about to step *into* one. Every kind
   * still has to be named, though — arrows were added to the selection and
   * missed here, which is why picking a shape used to leave an arrow lit up.
   */
  function selectOnly(id: string | null) {
    setSelectedIds(id ? [id] : []);
    setSelectedEdgeKey(null);
    setSelectedInkIds([]);
    setSelectedArrowIds([]);
    clearPathSelection();
    clearTableSelection();
  }

  function addElement(
    shape: DiagramNodeShape,
    at?: DiagramPoint,
    size?: DiagramNodeSize,
    parentId: string | null = null,
  ) {
    clearError();
    const result = addNode(history.snapshotRef.current.nodes, shape, at, snapEnabled, size);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    const nodes = parentId ? reparentNodes(result.nodes, [result.addedId], parentId) : result.nodes;
    const graph = history.snapshotRef.current;
    const order = paintOrderWithNewestOnTop(graph, result.addedId);
    history.commit({ nodes, edges: graph.edges, ...(order ? { z: order } : {}) });
    // Placing something is the end of that gesture: whatever tool was armed,
    // the next thing anyone wants is to move or type into what they just made.
    setCanvasTool('select');
    selectOnly(result.addedId);
    setSelectedEdgeKey(null);
  }

  /**
   * Places a text element under the cursor and opens it for typing.
   *
   * Kept as a preview rather than a commit until the text is finished: placing
   * it and typing into it is one gesture, so it is one undo step — and one that
   * left no text behind is dropped entirely rather than leaving an empty box.
   */
  function placeTextElement(at: DiagramPoint, size: DiagramNodeSize = DIAGRAM_NEW_TEXT_SIZE) {
    clearError();
    const before = history.snapshotRef.current;
    const result = addNode(before.nodes, 'text', at, snapEnabled, size);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }

    const order = paintOrderWithNewestOnTop(before, result.addedId);
    history.preview({ nodes: result.nodes, edges: before.edges, ...(order ? { z: order } : {}) });
    setCanvasTool('select');
    setGhostCursor(null);
    const placed = result.nodes.find((node) => node.id === result.addedId);
    if (!placed) return;
    // Set before opening the editor, which only fills this in if it is empty.
    nodeLabelStartRef.current = before;
    beginInlineNodeEdit(placed);
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

  /**
   * Applies one style to everything selected, whatever kinds are in it.
   *
   * The bar only ever offers a control the whole selection supports, so this is
   * never a partial action — each kind takes the keys it has and ignores the
   * rest, and it all lands in one history entry.
   */
  function applySelectionStyle(style: {
    strokeColor?: DiagramStrokeKey;
    strokeWidthPreset?: DiagramStrokeWidthPreset;
    strokeStyle?: DiagramStrokeStyle;
    fillColor?: DiagramFillKey | null;
    fontSizePreset?: DiagramFontSizePreset;
    labelBold?: boolean;
    labelColor?: DiagramStrokeKey;
    labelAlign?: DiagramTextAlign;
  }) {
    clearError();
    const graph = history.snapshotRef.current;
    const nodeIds = new Set(selectedIds);
    const inkIds = new Set(selectedInkIds);
    const pathIds = new Set(selectedPathIds);
    const tableIds = new Set(selectedTableIds);
    const arrowIds = new Set(selectedArrowIds);

    const withFill = <T extends { fillColor?: DiagramFillKey }>(element: T): T => {
      if (style.fillColor === undefined) return element;
      if (style.fillColor === null) {
        // Rebuilt without the key: an explicit `undefined` is still a property,
        // and the write path rejects one.
        const next = { ...element };
        delete next.fillColor;
        return next;
      }
      return { ...element, fillColor: style.fillColor };
    };

    const strokeKeys = {
      ...(style.strokeColor ? { strokeColor: style.strokeColor } : {}),
      ...(style.strokeWidthPreset ? { strokeWidthPreset: style.strokeWidthPreset } : {}),
    };

    history.commit({
      nodes: graph.nodes.map((node) => {
        if (!nodeIds.has(node.id)) return node;
        const styled = withFill({
          ...node,
          ...strokeKeys,
          ...(style.fontSizePreset ? { fontSizePreset: style.fontSizePreset } : {}),
          ...(style.labelBold === undefined ? {} : { labelBold: style.labelBold }),
          ...(style.labelColor ? { labelColor: style.labelColor } : {}),
          ...(style.labelAlign ? { labelAlign: style.labelAlign } : {}),
        });
        // Nothing may be painted out of existence entirely. A shape with no
        // fill *and* no outline is invisible while its hit area goes on
        // catching presses, and the only way back is an undo the user has no
        // reason to know they need. Whichever of the two was just chosen wins;
        // the other goes back to its default rather than the choice being
        // refused, so the click still does something.
        const painted =
          styled.fillColor === 'transparent' && styled.strokeColor === 'transparent'
            ? (() => {
                const next = { ...styled };
                if (style.fillColor === 'transparent') delete next.strokeColor;
                else delete next.fillColor;
                return next;
              })()
            : styled;

        // A textbox is sized by its words, so changing the size of those words
        // has to resize it. Fitted only on a label edit, a box bumped to the
        // largest text kept the height it had and the text spilled out of its
        // own outline until someone happened to open the label again.
        if (painted.shape !== 'text' || !style.fontSizePreset) return painted;
        return { ...painted, height: diagramTextBoxHeight(painted) };
      }),
      edges: selectedEdge
        ? styleEdge(graph.edges, selectedEdge, {
            ...strokeKeys,
            ...(style.strokeStyle ? { strokeStyle: style.strokeStyle } : {}),
          })
        : graph.edges,
      ink: (graph.ink ?? []).map((stroke) =>
        inkIds.has(stroke.id) ? { ...stroke, ...strokeKeys } : stroke,
      ),
      paths: (graph.paths ?? []).map((path) =>
        pathIds.has(path.id)
          ? withFill({
              ...path,
              ...strokeKeys,
              ...(style.strokeStyle ? { strokeStyle: style.strokeStyle } : {}),
            })
          : path,
      ),
      tables: (graph.tables ?? []).map((table) => {
        if (!tableIds.has(table.id)) return table;
        const styled = {
          ...table,
          ...strokeKeys,
          ...(style.fontSizePreset ? { fontSizePreset: style.fontSizePreset } : {}),
        };
        // Larger text needs taller rows, here as much as from the text panel.
        const sized = style.fontSizePreset ? fitRowsToContent(styled, null, 'grow') : styled;
        // A table has no fill of its own — it is a grid of cells — so filling
        // one means filling all of them.
        if (style.fillColor === undefined) return sized;
        return fillCellRange(sized, wholeTableRange(sized), style.fillColor);
      }),
      arrows: (graph.arrows ?? []).map((arrow) =>
        arrowIds.has(arrow.id)
          ? {
              ...arrow,
              ...strokeKeys,
              ...(style.strokeStyle ? { strokeStyle: style.strokeStyle } : {}),
              ...(style.fontSizePreset ? { fontSizePreset: style.fontSizePreset } : {}),
              ...(style.labelBold === undefined ? {} : { labelBold: style.labelBold }),
              ...(style.labelColor ? { labelColor: style.labelColor } : {}),
            }
          : arrow,
      ),
    });
  }

  /**
   * Open the selected arrow's label for typing.
   *
   * Both the "Add text" control and a double press on the line come here, the
   * same two ways a shape's label is reached.
   */
  function beginArrowLabelEdit(arrowId: string | null = selectedArrowId) {
    if (!arrowId) return;
    const arrow = (history.snapshotRef.current.arrows ?? []).find(
      (candidate) => candidate.id === arrowId,
    );
    arrowLabelCancelledRef.current = false;
    setArrowLabelDraft(arrow?.label ?? '');
    setEditingArrowId(arrowId);
  }

  function commitArrowLabel(arrowId: string, text: string) {
    const graph = history.snapshotRef.current;
    const trimmed = prepareArrowLabel(text);
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      arrows: (graph.arrows ?? []).map((arrow) => {
        if (arrow.id !== arrowId) return arrow;
        // An empty label is no label: stored as an absent key, the way every
        // other optional field on this contract is.
        if (trimmed === '') {
          const next = { ...arrow };
          delete next.label;
          return next;
        }
        return { ...withNewLabelSize(arrow), label: trimmed };
      }),
    });
    setEditingArrowId(null);
  }

  /** One arrow's own settings: its caps, its shape, and where its label sits. */
  function applyArrowSetting(change: Partial<ArrowElement>) {
    if (selectedArrowIds.length === 0) return;
    clearError();
    const graph = history.snapshotRef.current;
    const wanted = new Set(selectedArrowIds);
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      arrows: (graph.arrows ?? []).map((arrow) => {
        if (!wanted.has(arrow.id)) return arrow;
        const next = { ...arrow, ...change };
        // A bend belongs to an elbow. Carrying one onto a straight arrow is a
        // shape the write path refuses, so the switch drops it.
        if (next.route !== 'elbow') delete next.bend;
        return next;
      }),
    });
  }

  function renderPropertyControl(property: StudioPropertyDescriptor): ReactNode {
    switch (property.id) {
      case 'fillColor':
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={<PaintBucket aria-hidden="true" size={15} />}
          >
            {(close) => (
              <ColorChoices
                row
                itemName="fill"
                keys={FILL_KEYS_WITH_TRANSPARENT}
                colorFor={(key) => DIAGRAM_FILL_COLORS[key]}
                activeKey={
                  selectedNode?.fillColor ??
                  selectedPath?.fillColor ??
                  (selectedTable ? (tableCellAt(selectedTable, 0, 0)?.fill ?? null) : null)
                }
                disabled={showSubmitting}
                onSelect={(key) => {
                  applySelectionStyle({ fillColor: key });
                  close();
                }}
              />
            )}
          </BarMenu>
        );

      case 'cellFill':
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={<PaintBucket aria-hidden="true" size={15} />}
          >
            {(close) => (
              <ColorChoices
                row
                itemName="cell fill"
                keys={FILL_KEYS_WITH_TRANSPARENT}
                colorFor={(key) => DIAGRAM_FILL_COLORS[key]}
                activeKey={null}
                disabled={showSubmitting}
                onSelect={(key) => {
                  if (selectedTable && heldRange) {
                    replaceTable(fillCellRange(selectedTable, heldRange, key), selectedTable.id);
                  }
                  close();
                }}
              />
            )}
          </BarMenu>
        );

      case 'tableRows':
      case 'tableColumns': {
        if (!selectedTable || !heldRange) return null;
        const table = selectedTable;
        const axis: TableAxis = property.id === 'tableRows' ? 'row' : 'col';
        const span = trackSpan(heldRange, axis);
        const count = span.end - span.start + 1;
        const total = axis === 'row' ? tableRowCount(table) : tableColCount(table);
        const limit = axis === 'row' ? TABLE_MAX_ROWS : TABLE_MAX_COLS;
        const full = total >= limit;
        const noun = axis === 'row' ? 'row' : 'column';
        const nouns = count > 1 ? `${count} ${noun}s` : noun;
        // Picked whole, by their handles: they can be copied as well.
        const whole = heldRange.whole === axis;
        const actions = [
          {
            label: axis === 'row' ? 'Insert row above' : 'Insert column left',
            disabled: full,
            run: () => insertTableTrack(table, axis, span.start),
          },
          {
            label: axis === 'row' ? 'Insert row below' : 'Insert column right',
            disabled: full,
            run: () => insertTableTrack(table, axis, span.end + 1),
          },
          ...(whole
            ? [
                {
                  label: `Duplicate ${nouns}`,
                  disabled: total + count > limit,
                  run: () => duplicateTableTracks(table, axis, span.start, span.end),
                },
              ]
            : []),
          {
            label: `Delete ${nouns}`,
            // A table keeps at least one of each; deleting the table is Delete
            // with the table itself selected.
            disabled: count >= total,
            run: () => deleteTableTracks(table, axis, span.start, span.end),
          },
        ];
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={
              axis === 'row' ? (
                <Rows3 aria-hidden="true" size={15} />
              ) : (
                <Columns3 aria-hidden="true" size={15} />
              )
            }
          >
            {(close) => (
              <div className="flex w-44 flex-col gap-0.5">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={showSubmitting || action.disabled}
                    onClick={() => {
                      action.run();
                      close();
                      canvasRef.current?.focus({ preventScroll: true });
                    }}
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-rt-ink transition-colors hover:bg-rt-primary-tint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </BarMenu>
        );
      }

      case 'strokeColor': {
        const current =
          selectedNode?.strokeColor ??
          selectedPath?.strokeColor ??
          selectedEdge?.strokeColor ??
          null;
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={
              // The swatch is the icon: a line-shaped glyph says which control
              // this is, but not what pressing it would do.
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full border border-rt-ink/20"
                style={{ backgroundColor: DIAGRAM_STROKE_COLORS[current ?? 'ink'] }}
              />
            }
          >
            {(close) => (
              <ColorChoices
                row
                itemName="line"
                // A shape or a table keeps its body without an outline, so it
                // may drop one. Everything drawn *as* a line may not: a path,
                // a stroke of ink, an arrow and an edge all are their stroke,
                // so a transparent one is an element that has vanished while
                // its hit target goes on swallowing presses — an arrow's is 18
                // units wide, so it becomes an invisible bar across the canvas.
                keys={
                  selectedPath ||
                  selectedInkIds.length > 0 ||
                  selectedArrowIds.length > 0 ||
                  selectedEdge
                    ? QUICK_STROKE_KEYS
                    : OUTLINE_KEYS_WITH_TRANSPARENT
                }
                colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
                activeKey={selectedNode?.strokeColor ?? selectedPath?.strokeColor ?? null}
                disabled={showSubmitting}
                onSelect={(key) => {
                  applySelectionStyle({ strokeColor: key });
                  close();
                }}
              />
            )}
          </BarMenu>
        );
      }

      case 'strokeStyle':
        // Folded into the width control when both are offered: they are one
        // decision about how a line looks, and two buttons for it crowds a bar
        // that has to fit above a selection.
        return null;

      case 'strokeWidth':
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={<StrokeWeightIcon weight={3.5} />}
          >
            {(close) => (
              <div className="flex items-center">
                <ToolStripGroup label="Line width" row>
                  {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
                    <PresetButton
                      key={preset}
                      label={<StrokeWeightIcon weight={STROKE_WIDTH_SAMPLE[preset]} />}
                      name={`${STROKE_WIDTH_LABELS[preset]} width`}
                      active={selectedNode?.strokeWidthPreset === preset}
                      disabled={showSubmitting}
                      onSelect={() => {
                        applySelectionStyle({ strokeWidthPreset: preset });
                        close();
                      }}
                    />
                  ))}
                </ToolStripGroup>
                {barProperties.some((entry) => entry.id === 'strokeStyle') ? (
                  <ToolStripGroup label="Line style" row>
                    {DIAGRAM_STROKE_STYLES.map((style) => (
                      <PresetButton
                        key={style}
                        label={<StrokeStyleIcon dash={STROKE_STYLE_DASH[style]} />}
                        name={`${STROKE_STYLE_LABELS[style]} style`}
                        active={(selectedPath?.strokeStyle ?? selectedEdge?.strokeStyle) === style}
                        disabled={showSubmitting}
                        onSelect={() => {
                          applySelectionStyle({ strokeStyle: style });
                          close();
                        }}
                      />
                    ))}
                  </ToolStripGroup>
                ) : null}
              </div>
            )}
          </BarMenu>
        );

      case 'tableMerge': {
        if (!selectedTable || !heldRange) return null;
        const table = selectedTable;
        const range = heldRange;
        const splitting = mergeAction(table, range) === 'unmerge';
        const label = splitting ? 'Unmerge cells' : 'Merge cells';
        return (
          <Tooltip label={label} placement="bottom">
            <button
              type="button"
              aria-label={label}
              disabled={showSubmitting}
              onClick={() => {
                clearError();
                const next = splitting ? unmergeCells(table, range) : mergeCells(table, range);
                if (next === table) {
                  if (!splitting)
                    setValidationError('This table cannot hold any more merged cells.');
                  return;
                }
                replaceTable(next, table.id);
                // The merged cell is what is held: one cell now, where the block was.
                const area = expandRangeToMerges(next, range);
                setCellRange({ anchor: area.anchor, focus: area.anchor });
                canvasRef.current?.focus({ preventScroll: true });
              }}
              className={BAR_CONTROL}
            >
              {splitting ? (
                <TableCellsSplit aria-hidden="true" size={15} />
              ) : (
                <TableCellsMerge aria-hidden="true" size={15} />
              )}
            </button>
          </Tooltip>
        );
      }

      case 'addText':
        return (
          <Tooltip label={property.label} placement="bottom">
            <button
              type="button"
              aria-label={property.label}
              disabled={showSubmitting}
              onClick={() => beginArrowLabelEdit()}
              className={BAR_CONTROL}
            >
              <Type aria-hidden="true" size={15} />
            </button>
          </Tooltip>
        );

      case 'startCap':
      case 'endCap': {
        const end = property.id === 'startCap' ? 'startCap' : 'endCap';
        const current = selectedArrow
          ? end === 'startCap'
            ? arrowStartCap(selectedArrow)
            : arrowEndCap(selectedArrow)
          : null;
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={
              <span className={end === 'startCap' ? 'rotate-180' : undefined}>
                <CapTile cap={current ?? 'none'} />
              </span>
            }
          >
            {(close) => (
              <div role="group" aria-label={`${property.label} shapes`} className="flex gap-1">
                {ARROW_CAPS.map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    aria-label={`${ARROW_CAP_LABELS[cap]} ${end === 'startCap' ? 'start' : 'end'}`}
                    aria-pressed={current === cap}
                    disabled={showSubmitting}
                    onClick={() => {
                      applyArrowSetting({ [end]: cap });
                      close();
                    }}
                    className={tileClass(current === cap)}
                  >
                    <span className={end === 'startCap' ? 'rotate-180' : undefined}>
                      <CapTile cap={cap} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </BarMenu>
        );
      }

      case 'arrowRoute': {
        const current = selectedArrow ? arrowRoute(selectedArrow) : 'straight';
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={
              current === 'elbow' ? (
                <CornerDownRight aria-hidden="true" size={15} />
              ) : (
                <MoveRight aria-hidden="true" size={15} />
              )
            }
          >
            {(close) => (
              <div role="group" aria-label="Line shapes" className="flex gap-1">
                {(
                  [
                    ['straight', 'Straight line', MoveRight],
                    ['elbow', 'Elbowed line', CornerDownRight],
                  ] as const
                ).map(([value, name, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={name}
                    aria-pressed={current === value}
                    disabled={showSubmitting}
                    onClick={() => {
                      applyArrowSetting({ route: value });
                      close();
                    }}
                    className={tileClass(current === value)}
                  >
                    <Icon aria-hidden="true" size={14} />
                  </button>
                ))}
              </div>
            )}
          </BarMenu>
        );
      }

      case 'textFormat': {
        const cellStyleTarget = selectedTable
          ? (heldRange ?? wholeTableRange(selectedTable))
          : null;

        /**
         * Whether every cell the change would touch is already bold — as drawn,
         * so a heading row, bold without being told to be, shows as bold.
         */
        const cellsAllBold =
          selectedTable && cellStyleTarget
            ? anchorCellsInRange(selectedTable, cellStyleTarget).every((ref) =>
                tableCellBold(selectedTable, tableCellAt(selectedTable, ref.row, ref.col), ref.row),
              )
            : false;

        function styleCells(style: Parameters<typeof styleCellRange>[2]) {
          if (!selectedTable || !cellStyleTarget) return;
          const styled = styleCellRange(selectedTable, cellStyleTarget, style);
          // Larger text needs taller rows; the ones it touches make room.
          const rows = trackSpan(cellStyleTarget, 'row');
          replaceTable(
            style.fontSizePreset
              ? fitRowsToContent(
                  styled,
                  Array.from(
                    { length: rows.end - rows.start + 1 },
                    (_, index) => rows.start + index,
                  ),
                  'grow',
                )
              : styled,
            selectedTable.id,
          );
        }

        const bold = selectedTable
          ? cellsAllBold
          : Boolean(selectedNode?.labelBold ?? selectedArrow?.labelBold);
        // A cell with no alignment of its own is drawn left-aligned, so that
        // is what the control says; claiming centre lit the wrong button.
        // What the controls show is read from the cell that shows at the
        // range's end — a merged cell's top-left, never a cell it covers.
        const shownCell =
          selectedTable && cellStyleTarget
            ? rangeFocusCell(selectedTable, cellStyleTarget)
            : { row: 0, col: 0 };
        const align: DiagramTextAlign = selectedTable
          ? (tableCellAt(selectedTable, shownCell.row, shownCell.col)?.align ?? 'left')
          : (selectedNode?.labelAlign ?? 'center');

        function setBold(next: boolean) {
          if (selectedTable) styleCells({ bold: next });
          else applySelectionStyle({ labelBold: next });
        }

        function setAlign(next: DiagramTextAlign) {
          if (selectedTable && cellStyleTarget) {
            replaceTable(alignCellRange(selectedTable, cellStyleTarget, next), selectedTable.id);
            return;
          }
          applySelectionStyle({ labelAlign: next });
        }

        function setTextColor(next: DiagramStrokeKey) {
          if (selectedTable) styleCells({ color: next });
          else applySelectionStyle({ labelColor: next });
        }

        // Whatever is selected has to answer this, or the control cannot show
        // which size is already chosen — an arrow fell through to the default
        // and so never lit up the size it was actually set to.
        //
        // Nothing set means the older 11px, which is none of the presets, so no
        // button lights up. Claiming Medium there showed a size that was not
        // the one being drawn. A cell with no size of its own uses its table's.
        const size: DiagramFontSizePreset | null = selectedTable
          ? (tableCellAt(selectedTable, shownCell.row, shownCell.col)?.fontSizePreset ??
            selectedTable.fontSizePreset ??
            null)
          : (selectedNode?.fontSizePreset ?? selectedArrow?.fontSizePreset ?? null);

        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={showSubmitting}
            label={property.label}
            icon={<Type aria-hidden="true" size={15} />}
          >
            {() => (
              <div className="flex items-center">
                <ToolStripGroup label="Text size" row>
                  {DIAGRAM_FONT_SIZE_PRESETS.map((preset) => (
                    <PresetButton
                      key={preset}
                      label={
                        <span className="text-[10px] font-semibold">
                          {FONT_SIZE_LABELS[preset]}
                        </span>
                      }
                      name={`${preset} text`}
                      active={size === preset}
                      disabled={showSubmitting}
                      onSelect={() => {
                        if (selectedTable) styleCells({ fontSizePreset: preset });
                        else applySelectionStyle({ fontSizePreset: preset });
                      }}
                    />
                  ))}
                </ToolStripGroup>

                <ToolStripGroup label="Text weight" row>
                  <PresetButton
                    label={<Bold aria-hidden="true" size={15} />}
                    name="Bold cell text"
                    active={bold}
                    disabled={showSubmitting}
                    onSelect={() => setBold(!bold)}
                  />
                </ToolStripGroup>

                {selectedArrow ? (
                  <ToolStripGroup label="Label position" row>
                    {(
                      [
                        ['above', 'Above the line', ArrowUpFromLine],
                        ['on', 'On the line', Minus],
                        ['below', 'Below the line', ArrowDownFromLine],
                      ] as const
                    ).map(([side, name, SideIcon]) => (
                      <PresetButton
                        key={side}
                        label={<SideIcon aria-hidden="true" size={15} />}
                        name={name}
                        active={arrowLabelSide(selectedArrow) === side}
                        disabled={showSubmitting}
                        onSelect={() => applyArrowSetting({ labelSide: side })}
                      />
                    ))}
                  </ToolStripGroup>
                ) : null}

                {/* Alignment inside a box means nothing on a line: an arrow's
                    label is placed along it instead, by dragging it. */}
                {selectedArrow ? null : (
                  <ToolStripGroup label="Text alignment" row>
                    {DIAGRAM_TEXT_ALIGNS.map((option) => {
                      const AlignIcon: LucideIcon = CELL_ALIGN_ICONS[option];
                      return (
                        <PresetButton
                          key={option}
                          label={<AlignIcon aria-hidden="true" size={15} />}
                          name={`Align ${option}`}
                          active={align === option}
                          disabled={showSubmitting}
                          onSelect={() => setAlign(option)}
                        />
                      );
                    })}
                  </ToolStripGroup>
                )}

                <ColorChoices
                  row
                  itemName="cell text"
                  keys={QUICK_STROKE_KEYS}
                  colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
                  activeKey={
                    selectedTable
                      ? null
                      : (selectedNode?.labelColor ?? selectedArrow?.labelColor ?? null)
                  }
                  disabled={showSubmitting}
                  onSelect={setTextColor}
                />
              </div>
            )}
          </BarMenu>
        );
      }
    }
  }

  /** The selection described the way the property registry asks about it. */
  function selectionTargets(): StudioTarget[] {
    const graph = history.snapshotRef.current;
    const targets: StudioTarget[] = [];

    for (const node of graph.nodes) {
      if (selectedIds.includes(node.id)) targets.push({ kind: 'node', element: node });
    }
    if (selectedEdge) targets.push({ kind: 'edge', element: selectedEdge });
    for (const stroke of graph.ink ?? []) {
      if (selectedInkIds.includes(stroke.id)) targets.push({ kind: 'ink', element: stroke });
    }
    for (const path of graph.paths ?? []) {
      if (selectedPathIds.includes(path.id)) targets.push({ kind: 'path', element: path });
    }
    for (const arrow of graph.arrows ?? []) {
      if (selectedArrowIds.includes(arrow.id)) targets.push({ kind: 'arrow', element: arrow });
    }
    for (const table of graph.tables ?? []) {
      if (!selectedTableIds.includes(table.id)) continue;
      // A table is two different things to style depending on whether the
      // selection has gone inside it.
      const inCellMode = tableEditing && selectedTableId === table.id && cellRange !== null;
      targets.push({
        kind: 'table',
        element: table,
        inCellMode,
        wholeTracks: inCellMode ? (cellRange?.whole ?? null) : null,
        mergeAction: inCellMode && heldRange ? mergeAction(table, heldRange) : null,
        cellsHaveText:
          inCellMode && heldRange
            ? anchorCellsInRange(table, heldRange).some((ref) =>
                Boolean(tableCellAt(table, ref.row, ref.col)?.text?.trim()),
              )
            : false,
      });
    }
    return targets;
  }

  /** Where the selection appears on screen, for the bar to hang off. */
  function selectionClientRect(): DiagramRect | null {
    const boxes = selectionBoundsBoxes();
    if (boxes.length === 0) return null;
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height));

    // The bar is placed clear of whatever it is given, so it is given the
    // selection's frame and its grips rather than the bare elements: the frame
    // sits outside them, and a table's add buttons sit outside that. In scene
    // units, so the clearance holds at any zoom rather than only at the one a
    // fixed pixel gap was chosen for.
    const reach = selectedTableIds.length > 0 ? TABLE_CHROME_REACH_PX * pixel : frameOutset;

    return diagramRectToClientRect(
      {
        x: left - reach,
        y: top - reach,
        width: right - left + reach * 2,
        height: bottom - top + reach * 2,
      },
      surfaceBounds(),
      renderedView,
    );
  }

  /** Every selected element's bounding box, whatever kind it is. */
  function selectionBoxes(): ArrangeBox[] {
    const graph = history.snapshotRef.current;
    const boxes: ArrangeBox[] = [];

    for (const node of graph.nodes) {
      if (selectedIds.includes(node.id)) boxes.push({ key: node.id, ...nodeBounds(node) });
    }
    for (const stroke of graph.ink ?? []) {
      if (!selectedInkIds.includes(stroke.id)) continue;
      const bounds = inkBounds(stroke);
      if (bounds) boxes.push({ key: stroke.id, ...bounds });
    }
    for (const path of graph.paths ?? []) {
      if (!selectedPathIds.includes(path.id)) continue;
      const bounds = pathBounds(path);
      if (bounds) boxes.push({ key: path.id, ...bounds });
    }
    for (const table of graph.tables ?? []) {
      if (selectedTableIds.includes(table.id)) boxes.push({ key: table.id, ...tableBounds(table) });
    }
    if (selectedArrowIds.length > 0) {
      const boundsOf = arrowBoundsIn(graph);
      for (const arrow of graph.arrows ?? []) {
        if (!selectedArrowIds.includes(arrow.id)) continue;
        const bounds = boundsOf(arrow);
        if (bounds) boxes.push({ key: arrow.id, ...bounds });
      }
    }
    return boxes;
  }

  /**
   * The same boxes, plus the ends of a selected arrow. Only for positioning: an
   * arrow cannot be arranged, but its properties still have to appear somewhere,
   * and the nodes it joins are where anyone would look.
   */
  function selectionBoundsBoxes(): ArrangeBox[] {
    const boxes = selectionBoxes();
    if (!selectedEdge) return boxes;
    const graph = history.snapshotRef.current;
    for (const node of graph.nodes) {
      if (node.id === selectedEdge.from || node.id === selectedEdge.to) {
        boxes.push({ key: `edge-end-${node.id}`, ...nodeBounds(node) });
      }
    }
    return boxes;
  }

  /**
   * Arranges whatever is selected.
   *
   * Alignment is the one thing every kind has in common — a stroke and a table
   * share no property to style, but they both occupy a rectangle — so this is
   * offered to any multi-selection, and each kind is moved the way that kind
   * moves.
   */
  function arrangeSelection(compute: (boxes: ArrangeBox[]) => Map<string, ArrangeOffset>) {
    const boxes = selectionBoxes();
    const offsets = compute(boxes);
    if (offsets.size === 0) return;

    clearError();
    const graph = history.snapshotRef.current;
    const shift = (key: string) => offsets.get(key);
    history.commit({
      nodes: graph.nodes.map((node) => {
        const offset = shift(node.id);
        if (!offset) return node;
        return {
          ...node,
          ...placeNodePosition(
            { x: node.x + offset.x, y: node.y + offset.y },
            effectiveDiagramNodeSize(node),
            false,
            node,
          ),
        };
      }),
      edges: graph.edges,
      ink: (graph.ink ?? []).map((stroke) => {
        const offset = shift(stroke.id);
        if (!offset) return stroke;
        return {
          ...stroke,
          points: stroke.points.map((point) => ({
            x: point.x + offset.x,
            y: point.y + offset.y,
          })),
        };
      }),
      paths: (graph.paths ?? []).map((path) => {
        const offset = shift(path.id);
        return offset ? movePathBy(path, offset.x, offset.y) : path;
      }),
      tables: (graph.tables ?? []).map((table) => {
        const offset = shift(table.id);
        return offset ? moveTableBy(table, offset.x, offset.y) : table;
      }),
      // Arrows are offered to the sweep and measured by it, so they have to
      // move with it. A bound end is drawn from the element it names and only
      // its stored fallback shifts, which is the same thing a drag does.
      arrows: (graph.arrows ?? []).map((arrow) => {
        const offset = shift(arrow.id);
        return offset ? offsetArrow(arrow, offset.x, offset.y) : arrow;
      }),
    });
  }

  function alignSelection(mode: DiagramAlignMode) {
    arrangeSelection((boxes) => alignOffsets(boxes, mode));
  }

  function distributeSelection(axis: DiagramDistributeAxis) {
    arrangeSelection((boxes) => distributeOffsets(boxes, axis));
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
      arrows: result.arrows,
    });
    // What just landed is what you want to move, so it is what is selected.
    applySelection(result.selection);
  }

  function duplicateSelection() {
    pasteFragment(copySelection());
  }

  function normalizeSelectedLabel() {
    // Only after an edit that actually happened. `nodeLabelStartRef` is the undo
    // baseline stashed when the editor opens, so it is exactly the signal for
    // "a label was being typed". Without this the submit path ran it on a
    // merely *selected* textbox and stamped an auto-fitted size onto it,
    // throwing away a height the user had dragged for themselves.
    if (!selectedNode || !nodeLabelStartRef.current) return;
    const graph = history.snapshotRef.current;
    const tidied = renameNode(graph.nodes, selectedNode.id, prepareNodeLabel(selectedNode.label));
    history.preview({
      // A textbox is grown to hold what was typed. Only a textbox: every other
      // shape has a form of its own, and quietly resizing a flowchart box
      // because someone wrote a long label would rearrange the diagram.
      nodes: tidied.map((node) => {
        if (node.id !== selectedNode.id || node.shape !== 'text') return node;
        const width = effectiveDiagramNodeSize(node).width;
        return { ...node, width, height: diagramTextBoxHeight(node) };
      }),
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
    cancelNodeLabelEdit();
    cancelEdgeLabelEdit();
    // Undo can be what removes the very arrow the offer belongs to.
    setShapePicker(null);
    history.undo();
  }

  function redoDiagram() {
    cancelNodeLabelEdit();
    cancelEdgeLabelEdit();
    setShapePicker(null);
    history.redo();
  }

  function beginInlineNodeEdit(node: DiagramNode) {
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
    const graph = history.snapshotRef.current;
    const editing = editingNodeId
      ? graph.nodes.find((node) => node.id === editingNodeId)
      : undefined;
    // A text element is nothing but its text. With none typed there is nothing
    // to leave behind — an invisible box that can only be found by hunting for
    // it is worse than no box at all.
    if (editing?.shape === 'text' && !prepareNodeLabel(editing.label)) {
      const start = nodeLabelStartRef.current;
      nodeLabelStartRef.current = null;
      setEditingNodeId(null);
      const wasJustPlaced = Boolean(start) && !start!.nodes.some((node) => node.id === editing.id);
      if (start && wasJustPlaced) {
        // Placed and abandoned in the one gesture: it never happened.
        history.restorePreview(start);
      } else {
        if (start) history.restorePreview(start);
        const from = start ?? graph;
        history.commit({
          nodes: from.nodes.filter((node) => node.id !== editing.id),
          edges: from.edges,
        });
      }
      clearAllSelection();
      canvasRef.current?.focus({ preventScroll: true });
      return;
    }

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

  function zoomStep(direction: 'in' | 'out') {
    setView((current) => stepDiagramView(current, direction));
  }

  function resetView() {
    setView(DIAGRAM_DEFAULT_VIEW);
  }

  function onNodePointerDown(event: PointerEvent<SVGGElement>, node: DiagramNode) {
    if (event.button !== 0 || dragRef.current || isSubmitting) return;
    // A press with a tool armed belongs to the tool. Left unhandled rather than
    // swallowed, so it reaches the canvas and starts the mark it was meant to.
    if (canvasTool !== 'select') return;
    event.preventDefault();
    event.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus();

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

    // A mixed selection moves as one. The node-only drag path knows how to drop
    // a shape into a container, which a mixed group has no business doing, so
    // that stays for selections made purely of shapes.
    const mixedSelection =
      selectedIds.includes(node.id) &&
      selectedInkIds.length +
        selectedPathIds.length +
        selectedTableIds.length +
        selectedArrowIds.length >
        0;
    if (mixedSelection) {
      event.preventDefault();
      event.stopPropagation();
      beginElementMove(event, 'node', node.id);
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
    // highlighted is always what a Delete or a drag would act on. Arrows are
    // part of "any": leaving them out is what kept one lit up after a shape was
    // picked up, with the bar still offering arrow controls for it.
    setSelectedInkIds([]);
    setSelectedArrowIds([]);
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
    event: PointerEvent<SVGElement>,
    kind: ResizableKind,
    id: string,
    handle: DiagramResizeHandle,
  ) {
    if (event.button !== 0 || isSubmitting) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });
    lastNodePressRef.current = null;

    const graph = history.snapshotRef.current;
    // A table's outer edge is its outermost row's or column's line, and a
    // second press on it fits that row or column, as an inside line's does.
    if (kind === 'table' && isEdgeHandle(handle)) {
      const table = (graph.tables ?? []).find((candidate) => candidate.id === id);
      if (table) {
        const axis: TableAxis = handle === 'e' || handle === 'w' ? 'col' : 'row';
        const last = (axis === 'col' ? tableColCount(table) : tableRowCount(table)) - 1;
        const track = handle === 'e' || handle === 's' ? last : 0;
        if (fitOnSecondLinePress(event, table, axis, track)) return;
      }
    }

    const node = kind === 'node' ? graph.nodes.find((candidate) => candidate.id === id) : undefined;
    const size = node ? effectiveDiagramNodeSize(node) : { width: 0, height: 0 };
    // A table is scaled as a group of one: the group's rules for its tracks are
    // the table's rules, and there is then only one way a table grows.
    const selection =
      kind === 'group'
        ? currentSelection()
        : { ...EMPTY_STUDIO_SELECTION, ...(kind === 'table' ? { tableIds: [id] } : {}) };
    const frame = kind === 'group' || kind === 'table' ? groupFrame(graph, selection) : null;
    if ((kind === 'group' || kind === 'table') && !frame) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      kind,
      id,
      handle,
      start: { x: node?.x ?? 0, y: node?.y ?? 0, width: size.width, height: size.height },
      frame: frame ?? { x: 0, y: 0, width: 0, height: 0 },
      selection,
      origin: surfacePoint(event),
      previous: graph,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateResize(event: PointerEvent<SVGSVGElement>): boolean {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const point = surfacePoint(event);
    const delta = { x: point.x - resize.origin.x, y: point.y - resize.origin.y };
    if (!resize.moved && delta.x === 0 && delta.y === 0) return true;
    resize.moved = true;
    const fromCentre = event.altKey;
    const graph = history.snapshotRef.current;
    const before = resize.previous;

    if (resize.kind === 'node') {
      const node = before.nodes.find((candidate) => candidate.id === resize.id);
      // A text box is as tall as its text: only its width is pulled, and the
      // height follows the wrapping as it is dragged.
      const heightFor =
        node?.shape === 'text'
          ? (width: number) => diagramTextBoxHeight({ ...node, width })
          : undefined;
      history.preview({
        nodes: resizeNode(
          graph.nodes,
          resize.id,
          resize.handle,
          resize.start,
          delta,
          snapEnabled,
          event.shiftKey,
          { fromCentre, heightFor },
        ),
        edges: graph.edges,
      });
      return true;
    }

    // Everything scaled from a frame lands its pulled edge on the grid, as a
    // shape's own resize does. Shift is the free, proportional pull, and it
    // stays free — rounding an edge is exactly what breaks a ratio.
    const snapPull = (frame: DiagramRect | null, uniform: boolean, rotated = false) =>
      snapEnabled && !event.shiftKey && frame && !rotated
        ? snapResizePull(frame, resize.handle, delta, { uniform, fromCentre })
        : delta;

    // A table's own edge moves its outermost row or column; only its corners
    // scale the whole grid.
    if (resize.kind === 'table' && isEdgeHandle(resize.handle)) {
      const start = (before.tables ?? []).find((table) => table.id === resize.id);
      if (!start) return true;
      const side = resize.handle;
      const pull = snapPull(resize.frame, false);
      const across = side === 'e' || side === 'w';
      const pulled = resizeOuterTrack(start, side, across ? pull.x : pull.y);
      // A narrower column wraps its text onto more lines, so its rows make room.
      const next = across ? fitRowsToContent(pulled, null, 'grow') : pulled;
      history.preview({
        nodes: graph.nodes,
        edges: graph.edges,
        tables: (graph.tables ?? []).map((table) => (table.id === resize.id ? next : table)),
      });
      return true;
    }

    if (resize.kind === 'group' || resize.kind === 'table') {
      const pull = snapPull(resize.frame, groupMustScaleUniformly(before, resize.selection));
      const scaled = scaleGroup(before, resize.selection, resize.handle, resize.frame, pull, {
        lockAspect: event.shiftKey,
        fromCentre,
      });
      // A table scaled down keeps its text size, so its rows make room for
      // whatever now wraps rather than clipping it.
      const scaledTables = scaled.tables?.map((table) =>
        resize.selection.tableIds.includes(table.id)
          ? fitRowsToContent(table, null, 'grow')
          : table,
      );
      history.preview({
        nodes: scaled.nodes,
        edges: graph.edges,
        ink: scaled.ink,
        paths: scaled.paths,
        tables: scaledTables,
        arrows: scaled.arrows,
      });
      return true;
    }

    // A drawing is scaled from how it was at the press, every move, so a long
    // drag is one scale rather than a pile of rounded ones.
    if (resize.kind === 'ink') {
      const source = (before.ink ?? []).find((stroke) => stroke.id === resize.id);
      if (!source) return true;
      const pull = snapPull(inkLocalBounds(source), true, Boolean(source.rotation));
      const scaled = scaleInk(source, resize.handle, pull, fromCentre);
      history.preview({
        nodes: graph.nodes,
        edges: graph.edges,
        ink: (graph.ink ?? []).map((stroke) => (stroke.id === resize.id ? scaled : stroke)),
      });
      return true;
    }

    const source = (before.paths ?? []).find((path) => path.id === resize.id);
    if (!source) return true;
    const pull = snapPull(pathFrameBounds(source), true, Boolean(source.rotation));
    const scaled = scalePath(source, resize.handle, pull, fromCentre);
    history.preview({
      nodes: graph.nodes,
      edges: graph.edges,
      paths: (graph.paths ?? []).map((path) => (path.id === resize.id ? scaled : path)),
    });
    return true;
  }

  function endResize(event: PointerEvent<SVGSVGElement>): boolean {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return false;
    updateResize(event);
    resizeRef.current = null;
    releaseCapture(event);
    if (!resize.moved) return true;

    if (resize.kind === 'node') {
      const graph = history.snapshotRef.current;
      const clamped = clampNodesInsideContainer(graph.nodes, resize.id);
      if (clamped.some((node, index) => node !== graph.nodes[index])) {
        history.preview({ nodes: clamped, edges: graph.edges });
      }
    }

    history.recordPreview(resize.previous);
    return true;
  }

  /**
   * One frame around everything selected, with the same grips a single element
   * has: pulling it scales the whole group (see `scaleGroup`).
   *
   * Only for a real group — two or more elements — and not while a gesture that
   * owns the selection is under way, or the frame would chase the move.
   */
  function renderGroupFrame() {
    if (!multiSelected || canvasTool !== 'select' || isSubmitting || marquee) return null;
    const frame = groupFrame(history.snapshotRef.current, currentSelection());
    if (!frame) return null;
    return (
      <g data-testid="group-frame">
        <SelectionFrame bounds={frame} pixel={pixel} />
        {renderResizeChrome('group', 'group', frame)}
      </g>
    );
  }

  /**
   * The grips that resize a selected element: a square on each corner of its
   * frame and an invisible band along each edge, the way every drawing tool
   * lets a box be pulled from its side as well as its corner.
   *
   * Drawn in the element's own frame, inside whatever turn it carries, so a
   * turned element's grips sit on its turned frame; the cursor over each is
   * turned to match. Sized in pixels, so they are the same to see and to hit at
   * every zoom. Edge bands go first so a corner, drawn over the end of two of
   * them, always wins where they meet.
   */
  function renderResizeChrome(
    kind: ResizableKind,
    id: string,
    bounds: DiagramRect,
    {
      rotation = 0,
      widthOnly = false,
      outset = frameOutset,
    }: { rotation?: number; widthOnly?: boolean; outset?: number } = {},
  ) {
    const frame = {
      x: bounds.x - outset,
      y: bounds.y - outset,
      width: bounds.width + outset * 2,
      height: bounds.height + outset * 2,
    };
    const band = (coarsePointer ? RESIZE_EDGE_COARSE_PX : RESIZE_EDGE_PX) * pixel;
    const edges = RESIZE_EDGE_HANDLES.filter((handle) => {
      // A text box's height follows its text, so its top and bottom are not
      // grips. Nor is an edge of a mark with no extent across it: the top of a
      // perfectly flat line has nothing to pull.
      const vertical = handle === 'n' || handle === 's';
      if (vertical) return !widthOnly && bounds.height >= 1;
      return bounds.width >= 1;
    });

    return (
      <g data-testid="resize-chrome">
        {edges.map((handle) => {
          const vertical = handle === 'n' || handle === 's';
          const x = handle === 'e' ? frame.x + frame.width : frame.x;
          const y = handle === 's' ? frame.y + frame.height : frame.y;
          return (
            <rect
              key={handle}
              role="button"
              aria-label={RESIZE_HANDLE_LABELS[handle]}
              tabIndex={-1}
              data-testid={`resize-handle-${handle}`}
              x={vertical ? frame.x : x - band / 2}
              y={vertical ? y - band / 2 : frame.y}
              width={vertical ? frame.width : band}
              height={vertical ? band : frame.height}
              fill="transparent"
              style={{ cursor: resizeCursorFor(handle, rotation) }}
              onPointerDown={(event) => onResizePointerDown(event, kind, id, handle)}
            />
          );
        })}
        {RESIZE_CORNER_HANDLES.map((handle) => {
          const x = handle === 'nw' || handle === 'sw' ? frame.x : frame.x + frame.width;
          const y = handle === 'nw' || handle === 'ne' ? frame.y : frame.y + frame.height;
          const side = CHROME.gripSize * pixel;
          return (
            <g
              key={handle}
              role="button"
              aria-label={RESIZE_HANDLE_LABELS[handle]}
              tabIndex={-1}
              data-testid={`resize-handle-${handle}`}
              style={{ cursor: resizeCursorFor(handle, rotation) }}
              onPointerDown={(event) => onResizePointerDown(event, kind, id, handle)}
            >
              <circle cx={x} cy={y} r={CHROME.gripReach * pixel} fill="transparent" />
              <rect
                x={x - side / 2}
                y={y - side / 2}
                width={side}
                height={side}
                fill="#FFFFFF"
                stroke={STUDIO_ACCENT}
                strokeWidth={CHROME.gripStroke * pixel}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </g>
    );
  }

  /**
   * The grip that turns an element, floating above the middle of its top edge.
   *
   * Inside the element's own transform, so it orbits with the shape and always
   * marks the same corner of it — dragging from wherever the grip has got to is
   * what makes the gesture read as turning rather than as scrubbing a value.
   */
  /**
   * The four places you can grab to turn an element.
   *
   * Just outside each corner rather than one grip on a stem: that is where a
   * hand already is after resizing, it needs no extra chrome on the canvas, and
   * it gives four places to start the gesture instead of one. Each zone is the
   * quadrant *outside* its corner, so it never covers the element itself and a
   * press on the body still selects and drags as before.
   *
   * Rendered before the resize handles, so where the two overlap the resize
   * handle is on top and the corner still resizes. The rotate ring is the part
   * of the quadrant beyond it.
   */
  function renderRotateZones(kind: RotatableKind, id: string, bounds: DiagramRect) {
    const left = bounds.x;
    const top = bounds.y;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const reach = CHROME.rotateReach * pixel;

    const zones: { corner: string; x: number; y: number }[] = [
      { corner: 'nw', x: left - reach, y: top - reach },
      { corner: 'ne', x: right, y: top - reach },
      { corner: 'se', x: right, y: bottom },
      { corner: 'sw', x: left - reach, y: bottom },
    ];

    return zones.map(({ corner, x, y }) => (
      <rect
        key={`rotate-${corner}`}
        role="button"
        aria-label="Rotate this element"
        tabIndex={-1}
        data-testid={`rotate-zone-${corner}`}
        x={x}
        y={y}
        width={reach}
        height={reach}
        fill="transparent"
        style={{ cursor: ROTATE_CURSOR }}
        onPointerDown={(event) => onRotatePointerDown(event, kind, id)}
      />
    ));
  }

  /** The pointer's bearing from a centre, in degrees, matching `rotation`. */
  function pointerAngle(centre: DiagramPoint, point: DiagramPoint): number {
    return (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;
  }

  /** The unrotated box a rotatable element turns about, in scene units. */
  function localBoundsFor(kind: RotatableKind, id: string): DiagramRect | null {
    const graph = history.snapshotRef.current;
    if (kind === 'node') {
      const node = graph.nodes.find((candidate) => candidate.id === id);
      return node ? nodeLocalBounds(node) : null;
    }
    if (kind === 'ink') {
      const stroke = (graph.ink ?? []).find((candidate) => candidate.id === id);
      return stroke ? inkLocalBounds(stroke) : null;
    }
    const path = (graph.paths ?? []).find((candidate) => candidate.id === id);
    return path ? pathLocalBounds(path) : null;
  }

  function rotationOf(kind: RotatableKind, id: string): number {
    const graph = history.snapshotRef.current;
    if (kind === 'node') return graph.nodes.find((n) => n.id === id)?.rotation ?? 0;
    if (kind === 'ink') return (graph.ink ?? []).find((n) => n.id === id)?.rotation ?? 0;
    return (graph.paths ?? []).find((n) => n.id === id)?.rotation ?? 0;
  }

  /**
   * Write an angle onto one element.
   *
   * Zero deletes the key rather than storing it: an unrotated element should be
   * indistinguishable from one authored before rotation existed, and the write
   * path rejects an explicit `undefined`.
   */
  function withRotation<T extends { rotation?: number }>(element: T, degrees: number): T {
    if (degrees === 0) {
      const next = { ...element };
      delete next.rotation;
      return next;
    }
    return { ...element, rotation: degrees };
  }

  function previewRotation(kind: RotatableKind, id: string, degrees: number) {
    const graph = history.snapshotRef.current;
    if (kind === 'node') {
      history.preview({
        nodes: graph.nodes.map((node) => (node.id === id ? withRotation(node, degrees) : node)),
        edges: graph.edges,
      });
      return;
    }
    if (kind === 'ink') {
      history.preview({
        nodes: graph.nodes,
        edges: graph.edges,
        ink: (graph.ink ?? []).map((stroke) =>
          stroke.id === id ? withRotation(stroke, degrees) : stroke,
        ),
      });
      return;
    }
    history.preview({
      nodes: graph.nodes,
      edges: graph.edges,
      paths: (graph.paths ?? []).map((path) =>
        path.id === id ? withRotation(path, degrees) : path,
      ),
    });
  }

  /**
   * Whether a shape or text press has travelled far enough to be sizing
   * something rather than placing it.
   *
   * The same on-screen slop the arrow and line tools use, so a hand that
   * wobbles while clicking still gets the default size, at any zoom. A text box
   * only takes its width from the drag, so only sideways travel counts: a
   * wobble up or down would otherwise make a narrow box nobody asked for.
   */
  function shapeDraftTravelled(origin: DiagramPoint, current: DiagramPoint): boolean {
    const slop = travelSlop();
    if (canvasTool === 'text') return Math.abs(current.x - origin.x) > slop;
    return Math.hypot(current.x - origin.x, current.y - origin.y) > slop;
  }

  function updateShapeDraft(event: PointerEvent<SVGSVGElement>): boolean {
    const draft = shapeDraftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return false;
    event.preventDefault();

    const current = surfacePoint(event);
    if (!draft.moved && shapeDraftTravelled(draft.origin, current)) {
      draft.moved = true;
    }
    setShapeDraftSquare(event.shiftKey);
    setShapeDraft({ origin: draft.origin, current });
    return true;
  }

  function endShapeDraft(event: PointerEvent<SVGSVGElement>): boolean {
    const draft = shapeDraftRef.current;
    if (!draft || draft.pointerId !== event.pointerId) return false;
    event.preventDefault();

    const current = surfacePoint(event);
    const dragged = draft.moved || shapeDraftTravelled(draft.origin, current);
    // What is held at the release, and nothing else. Falling back to the last
    // move's flag squared a drag that had never previewed as square.
    const square = event.shiftKey;

    shapeDraftRef.current = null;
    setShapeDraftSquare(false);
    setShapeDraft(null);
    setGhostCursor(null);
    releaseCapture(event);

    if (canvasTool === 'text') {
      // Dragged, the width is the one asked for; a plain click keeps the
      // default box centred under the cursor, as it always has.
      if (dragged) {
        const rect = textRectFromDrag(draft.origin, current);
        placeTextElement(rect, { width: rect.width, height: rect.height });
      } else {
        placeTextElement(centredOnCursor(draft.origin, DIAGRAM_NEW_TEXT_SIZE));
      }
      return true;
    }

    if (dragged) {
      const rect = shapeRectFromDrag(draft.origin, current, square);
      addElement(pendingShape, rect, { width: rect.width, height: rect.height });
      return true;
    }

    // A press that never travelled is the old click-to-place: the default size,
    // centred where the cursor was.
    const size = diagramNodeSize(pendingShape);
    addElement(pendingShape, centredOnCursor(draft.origin, size));
    return true;
  }

  function onRotatePointerDown(event: PointerEvent<SVGGElement>, kind: RotatableKind, id: string) {
    if (event.button !== 0 || isSubmitting) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    const local = localBoundsFor(kind, id);
    if (!canvas || !local) return;
    canvas.focus({ preventScroll: true });
    lastNodePressRef.current = null;

    const centre = { x: local.x + local.width / 2, y: local.y + local.height / 2 };
    rotateRef.current = {
      pointerId: event.pointerId,
      kind,
      id,
      centre,
      startPointerAngle: pointerAngle(centre, surfacePoint(event)),
      startRotation: rotationOf(kind, id),
      previous: history.snapshotRef.current,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function updateRotate(event: PointerEvent<SVGSVGElement>): boolean {
    const rotate = rotateRef.current;
    if (!rotate || rotate.pointerId !== event.pointerId) return false;
    event.preventDefault();

    // Measured from where the drag started rather than from the handle's own
    // position, so the shape does not snap round to meet the pointer on the
    // first pixel of movement.
    const swept = pointerAngle(rotate.centre, surfacePoint(event)) - rotate.startPointerAngle;
    const step = event.shiftKey ? DIAGRAM_ROTATION_COARSE_STEP : DIAGRAM_ROTATION_STEP;
    const stepped = Math.round((rotate.startRotation + swept) / step) * step;
    const next = normalizeRotation(stepped);

    if (next === rotationOf(rotate.kind, rotate.id) && !rotate.moved) return true;
    rotate.moved = true;
    previewRotation(rotate.kind, rotate.id, next);
    return true;
  }

  function endRotate(event: PointerEvent<SVGSVGElement>): boolean {
    const rotate = rotateRef.current;
    if (!rotate || rotate.pointerId !== event.pointerId) return false;
    updateRotate(event);
    // One history entry for the whole turn, the way a resize or a drag is one.
    if (rotate.moved) history.recordPreview(rotate.previous);
    rotateRef.current = null;
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
    if (isSelectionEmpty(selection) && !selectedEdge) return;
    const graph = history.snapshotRef.current;
    const moving = new Set<string>([
      ...selection.inkIds,
      ...selection.pathIds,
      ...selection.tableIds,
      ...selection.arrowIds,
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
  function applyTemplate(template: StudioTemplate, at?: DiagramPoint) {
    clearError();
    const graph = history.snapshotRef.current;
    const fragment = templateFragment(template);
    // Laid out at absolute positions. Dropped somewhere, the template moves as
    // a whole to land its top-left there; without a point it takes the canvas
    // as designed, stepped clear of anything already on it.
    const bounds = templateBounds(template);
    const offset = at
      ? { x: at.x - bounds.x, y: at.y - bounds.y }
      : graph.nodes.length === 0 && graph.edges.length === 0
        ? { x: 0, y: 0 }
        : DIAGRAM_PASTE_OFFSET;

    // The studio's own paster, so the shapes, the tables and the arrows between
    // them all come across, every id new and every arrow still bound to the
    // shape it was drawn to.
    const pasted = pasteStudioFragment(graph, fragment, offset, snapEnabled);
    if (!pasted.ok) {
      setValidationError(pasted.error);
      return;
    }

    history.commit({
      nodes: pasted.nodes,
      edges: pasted.edges,
      ink: pasted.ink,
      paths: pasted.paths,
      tables: pasted.tables,
      arrows: pasted.arrows,
    });
    setCanvasTool('select');
    setPendingTemplate(null);
    setGhostCursor(null);
    applySelection(pasted.selection);
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

  /**
   * Scene-unit close target, scaled so it stays a constant size on screen.
   *
   * By pixels on screen rather than by zoom alone: dividing by the zoom left
   * out how far the sheet is stretched to fit the window, so the target was a
   * different size in every window — as the arrow snap and the travel slop
   * already are not.
   */
  function closeTolerance() {
    return PATH_CLOSE_TOLERANCE * scenePerPixel(renderedViewRef.current, surfaceBounds());
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
  function commitPathDraft(
    anchors: readonly PathAnchor[],
    closed: boolean,
    returnToSelect = false,
  ) {
    const path = finishPathDraft(anchors, closed, {
      strokeColor: pathColor,
      strokeWidthPreset: pathWidth,
      strokeStyle: pathStyle,
      ...(pathFillColor ? { fillColor: pathFillColor } : {}),
    });
    clearPathDraft();
    if (!path) {
      // A single anchor is not a path, so there is nothing to commit — but
      // Escape still meant "I am finished with this tool".
      if (returnToSelect) setCanvasTool('select');
      return;
    }

    const graph = history.snapshotRef.current;
    commitPaths([...(graph.paths ?? []), path], paintOrderWithNewestOnTop(graph, path.id));

    // The line tool stays armed, the way the brush does: these are tools you
    // draw several of in a row, and going back to Select after each one makes
    // the second line cost two clicks more than the first. The pen finishes a
    // whole shape in one go, so it hands that shape back ready to move.
    //
    // Escape is the exception for both: it means "I am done here", not "give me
    // another one", so it always lands in Select whichever tool drew the path.
    if (canvasTool === 'line' && !returnToSelect) {
      clearAllSelection();
      return;
    }
    setCanvasTool('select');
    applySelection({ ...EMPTY_STUDIO_SELECTION, pathIds: [path.id] });
  }

  /**
   * Put down whatever the pen or line tool is holding.
   *
   * `returnToSelect` is what Escape passes: an abandoned path still commits what
   * was drawn, but hands the canvas back in Select rather than re-arming a tool
   * the user has just said they are finished with.
   */
  function finishPenDraft(returnToSelect = false) {
    const anchors = pathAnchorsRef.current;
    if (anchors.length === 0) {
      clearPathDraft();
      if (returnToSelect) setCanvasTool('select');
      return;
    }
    commitPathDraft(anchors, false, returnToSelect);
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
    setSelectedArrowIds([]);
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
    setSelectedArrowIds([]);
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
      arrowIds: selectedArrowIds,
    };
  }

  /**
   * Replace the selection wholesale, and step out of every editing sub-mode.
   *
   * Use this for a sweep, a paste or a clear. `selectOnly`, `selectPath` and
   * `selectTable` stay separate because they are often called on the way *into*
   * a sub-mode, which this would immediately undo.
   */
  function applySelection(next: StudioSelection) {
    setSelectedIds(next.nodeIds);
    setSelectedInkIds(next.inkIds);
    setSelectedPathIds(next.pathIds);
    setSelectedTableIds(next.tableIds);
    setSelectedArrowIds(next.arrowIds);
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
    if (isSelectionEmpty(selection) && !selectedEdge) return;
    // The arrow the offer belongs to may be part of what is going.
    setShapePicker(null);
    const graph = history.snapshotRef.current;

    // Deleting a container is two different intentions — lose what is inside it,
    // or keep it — so it asks before doing either.
    if (selection.nodeIds.length === 1 && selectionSize(selection) === 1) {
      const target = graph.nodes.find((node) => node.id === selection.nodeIds[0]);
      if (
        target &&
        diagramCanParent(target.shape) &&
        diagramDescendantIds(graph.nodes, target.id).length > 0
      ) {
        setPendingContainerDelete(target.id);
        return;
      }
    }

    const inkGone = new Set(selection.inkIds);
    const pathGone = new Set(selection.pathIds);
    const tableGone = new Set(selection.tableIds);
    const arrowGone = new Set(selection.arrowIds);
    const gone = new Set([...inkGone, ...pathGone, ...tableGone, ...arrowGone]);

    // An arrow takes precedence: completing a connection leaves both the arrow
    // and the element it landed on selected, and deleting then means the arrow.
    if (selectedEdge) {
      clearError();
      history.commit({ nodes: graph.nodes, edges: deleteEdge(graph.edges, selectedEdge) });
      setSelectedEdgeKey(null);
      return;
    }

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
      // Arrows bound to something deleted here keep the binding: the route
      // already falls back to the stored point, so it looks right either way,
      // and keeping it means undo reattaches the arrow. `prepareDiagram` drops
      // whatever is still stale when the canvas is actually proposed.
      arrows: (graph.arrows ?? []).filter((arrow) => !arrowGone.has(arrow.id)),
      ...(graph.z ? { z: graph.z.filter((key) => !gone.has(key)) } : {}),
    });
    clearAllSelection();
  }

  /**
   * Grab one end of a selected arrow, or the handle on its middle leg.
   *
   * One history entry per drag, recorded on release, so re-pointing an arrow
   * undoes in one go rather than a step per pointer move.
   */
  function beginArrowEdit(
    event: PointerEvent<SVGElement>,
    arrowId: string,
    handle: 'from' | 'to' | 'bend' | 'label',
  ) {
    const canvas = canvasRef.current;
    if (!canvas || canvasTool !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    // Every handle but the label captures the pointer, so a drag can leave the
    // canvas and come back. The label must not: capture retargets the press
    // that follows to the canvas, and the second press on a label is how it is
    // opened for typing. A label is dragged along its own line, so it has no
    // reason to leave the surface anyway.
    if (handle !== 'label') canvas.setPointerCapture(event.pointerId);
    arrowEditRef.current = {
      pointerId: event.pointerId,
      arrowId,
      handle,
      previous: history.snapshotRef.current,
      moved: false,
    };
  }

  function updateArrowEdit(event: PointerEvent<SVGSVGElement>): boolean {
    const session = arrowEditRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    event.preventDefault();
    session.moved = true;

    const graph = history.snapshotRef.current;
    const point = surfacePoint(event);
    const arrows = (graph.arrows ?? []).map((arrow) => {
      if (arrow.id !== session.arrowId) return arrow;
      if (session.handle === 'label') {
        // Where along the route the pointer is, as the fraction the contract
        // stores — so the label keeps its place when the arrow is re-routed.
        const geometry = arrowGeometry(arrow, arrowTargetsById);
        return { ...arrow, labelT: nearestTOnRoute(geometry.points, point) };
      }
      if (session.handle === 'bend') {
        // The leg lands on the grid, so an elbow lines up with the artwork it
        // is routed between rather than sitting a few units off it.
        const aim = snapEnabled ? { x: snapToGrid(point.x), y: snapToGrid(point.y) } : point;
        return { ...arrow, bend: bendForPointer(arrow, aim, arrowTargetsById) };
      }
      const endpoint = arrowEndpointFor(point);
      setArrowSnap(endpoint.elementId ? { elementId: endpoint.elementId, point: endpoint } : null);
      return { ...arrow, [session.handle]: endpoint };
    });

    history.preview({ nodes: graph.nodes, edges: graph.edges, arrows });
    return true;
  }

  function endArrowEdit(event: PointerEvent<SVGSVGElement>): boolean {
    const session = arrowEditRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    arrowEditRef.current = null;
    setArrowSnap(null);
    // A drag that left the arrow as it was — a leg that would not slide there, a
    // label already in place — records nothing, so Undo never steps through a
    // change nobody can see.
    const before = session.previous.arrows?.find((arrow) => arrow.id === session.arrowId);
    const after = history.snapshotRef.current.arrows?.find((arrow) => arrow.id === session.arrowId);
    if (session.moved && JSON.stringify(before) !== JSON.stringify(after)) {
      history.recordPreview(session.previous);
    } else if (session.moved) {
      history.restorePreview(session.previous);
    }
    releaseCapture(event);
    return true;
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

  /**
   * The pointer in a path's own frame.
   *
   * Anchors are stored unturned and drawn turned, so every question asked about
   * them — which one is under the cursor, where this drag is putting one — has
   * to be asked where they actually live. Shared by the grab and the drag so
   * the two cannot answer differently.
   */
  function pathPointerSpace(path: PathElement, event: PointerEvent<SVGElement>): DiagramPoint {
    const point = surfacePoint(event);
    const local = pathLocalBounds(path);
    return path.rotation && local ? toElementSpace(point, local, path.rotation) : point;
  }

  function updatePathEdit(event: PointerEvent<SVGSVGElement>): boolean {
    const session = pathEditRef.current;
    if (!session || session.pointerId !== event.pointerId) return false;
    event.preventDefault();

    const graph = history.snapshotRef.current;
    const path = (graph.paths ?? []).find((current) => current.id === session.pathId);
    if (!path) return true;

    // Anchors are stored unturned, but a turned path is *drawn* turned, so the
    // pointer has to be brought back into the path's own frame before it is
    // compared with them. Without this, dragging a point on a turned path sends
    // it off at the angle of the turn.
    const point = pathPointerSpace(path, event);
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

  /** Picks a table up; the press that follows says where it goes. */
  function pickUpTable(rows: number, cols: number) {
    setPendingTable({ rows, cols });
    selectCanvasTool('table');
  }

  function placeTable(at: DiagramPoint, rows = tableRows, cols = tableCols) {
    clearError();
    const graph = history.snapshotRef.current;
    const over = studioLimitError({ tables: (graph.tables ?? []).length + 1 });
    if (over) {
      setValidationError(over);
      return;
    }
    const table = createTable(rows, cols, at);
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      tables: [...(graph.tables ?? []), table],
      ...((order) => (order ? { z: order } : {}))(paintOrderWithNewestOnTop(graph, table.id)),
    });
    setCanvasTool('select');
    setPendingTable(null);
    setGhostCursor(null);
    // Deliberately unselected. A press on it both selects and starts a drag, so
    // the first thing anyone can do with a new table is put it where they want
    // it; opening it for typing straight away made that impossible.
    clearAllSelection();
    canvasRef.current?.focus({ preventScroll: true });
  }

  /** The one cell a keystroke acts on: the focus end of the current range. */
  function activeCell(): CellRef | null {
    if (!cellRange) return null;
    // The cell that shows at the range's end: a whole row picked by its handle
    // can end inside a merged cell, and typing there went into a cell that is
    // never drawn.
    return selectedTable ? rangeFocusCell(selectedTable, cellRange) : cellRange.focus;
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

  function commitCellText(table: TableElement, cell: CellRef, typed: string) {
    // Blank lines left at the end are not kept: nothing is drawn on them, and
    // stored they would hold the row open around nothing.
    const text = typed.replace(/\s+$/, '');
    const before = tableCellAt(table, cell.row, cell.col)?.text ?? '';
    const withText = setCell(table, cell.row, cell.col, { text });
    // Opened and closed without a change is not an edit: it adds nothing to
    // undo, and it leaves alone a row that was sized by hand.
    if ((tableCellAt(withText, cell.row, cell.col)?.text ?? '') === before) return;
    // The row grows to hold what its cells now say, and never shrinks by
    // itself: a row someone opened up by hand stays that tall however its text
    // is edited. Bringing a row back down to its text is a double-click on its
    // line. (This used to pass the *change* in height to a resize that expects
    // the height itself, so a second line shrank the row and clipped both.)
    replaceTable(fitRowsToContent(withText, [cell.row], 'grow'), table.id);
  }

  /**
   * A table as it is drawn: while one of its cells is being typed into, its row
   * already as tall as the text so far needs. Worked out on every keystroke
   * and never stored — committing applies the same growth — so the field never
   * runs over the rows below it and nothing jumps when the edit lands.
   */
  function tableAsShown(table: TableElement): TableElement {
    if (!editingCell || selectedTableId !== table.id) return table;
    // Measured the way the field shows it. Laying text out trims it, so the
    // empty line Enter has just made — nothing typed on it yet — would not be
    // counted, and the row would only grow once something was. A placeholder
    // holds an empty first or last line open for the measuring.
    const measured = cellDraft.replace(/^[^\S\n]*\n/, '.\n').replace(/\n[^\S\n]*$/, '\n.');
    return fitRowsToContent(
      setCell(table, editingCell.row, editingCell.col, { text: measured }),
      [editingCell.row],
      'grow',
    );
  }

  /** Into a table's cells, with one cell in hand. */
  function enterTableCells(tableId: string, cell: CellRef) {
    selectTable(tableId);
    setTableEditing(true);
    setCellRange({ anchor: cell, focus: cell });
  }

  /** A row or column added at `index`, with the selection kept on its cells. */
  function insertTableTrack(table: TableElement, axis: TableAxis, index: number) {
    const next = axis === 'row' ? insertRow(table, index) : insertColumn(table, index);
    if (next === table) {
      setValidationError(
        axis === 'row'
          ? `A table can hold ${TABLE_MAX_ROWS} rows at most.`
          : `A table can hold ${TABLE_MAX_COLS} columns at most.`,
      );
      return;
    }
    clearError();
    replaceTable(next, table.id);
    if (cellRange && selectedTableId === table.id) {
      setCellRange(shiftRangeForInsert(cellRange, axis, index));
    }
  }

  /** Rows or columns copied in straight after themselves, and selected. */
  function duplicateTableTracks(table: TableElement, axis: TableAxis, start: number, end: number) {
    const next = duplicateTracks(table, axis, start, end);
    if (next === table) {
      setValidationError(
        axis === 'row'
          ? `A table can hold ${TABLE_MAX_ROWS} rows at most.`
          : `A table can hold ${TABLE_MAX_COLS} columns at most.`,
      );
      return;
    }
    clearError();
    replaceTable(next, table.id);
    const count = end - start + 1;
    setCellRange(wholeTracksRange(next, axis, end + 1, end + count));
  }

  /**
   * A press on a row's or column's handle. It takes that row or column whole —
   * or, with Shift, everything from the one already held to this one — and a
   * drag from there carries them, the way FigJam's handles do. Grabbing one of
   * several already held carries them all.
   */
  function onTableHandleDown(
    event: PointerEvent<SVGGElement>,
    table: TableElement,
    axis: TableAxis,
    track: number,
  ) {
    const canvas = canvasRef.current;
    if (!canvas || isSubmitting) return;
    canvas.focus({ preventScroll: true });
    clearError();
    lastNodePressRef.current = null;
    const held = selectedTableId === table.id ? wholeTracks(cellRange) : null;
    let start = track;
    let end = track;
    if (held && held.axis === axis) {
      if (event.shiftKey) {
        start = Math.min(held.start, track);
        end = Math.max(held.end, track);
      } else if (track >= held.start && track <= held.end) {
        start = held.start;
        end = held.end;
      }
    }
    // Rows a merged cell runs down go together: half of one cannot be taken.
    ({ start, end } = trackSpan(
      expandRangeToMerges(table, wholeTracksRange(table, axis, start, end)),
      axis,
    ));
    selectTable(table.id);
    setTableEditing(true);
    setEditingCell(null);
    setCellRange(wholeTracksRange(table, axis, start, end));
    canvas.setPointerCapture(event.pointerId);
    const origin = surfacePoint(event);
    const offsets = axis === 'row' ? tableRowOffsets(table) : tableColumnOffsets(table);
    const along = axis === 'row' ? origin.y - table.y : origin.x - table.x;
    trackDragRef.current = {
      pointerId: event.pointerId,
      tableId: table.id,
      axis,
      start,
      end,
      origin,
      moved: false,
      boundary: null,
      previous: history.snapshotRef.current,
      original: table,
      grab: along - (offsets[start] ?? 0),
      lifted: null,
    };
  }

  /**
   * Carrying rows or columns, the way FigJam does it: the block lifts off the
   * table and follows the pointer, and the rest of the table reflows round it,
   * opening the gap it will drop into. The reflow is a preview of the moved
   * table, worked out afresh from the table at the press each time the gap
   * changes place, so letting go only has to keep what is already shown.
   */
  function updateTrackDrag(event: PointerEvent<SVGSVGElement>): boolean {
    const drag = trackDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const point = surfacePoint(event);
    if (!drag.moved) {
      if (Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) < travelSlop()) return true;
      drag.moved = true;
      drag.lifted = tracksAsTable(bakeHeaderRow(drag.original), drag.axis, drag.start, drag.end);
    }
    const { original, axis, start, end } = drag;
    // The gap goes to the boundary of the table-as-pressed nearest the pointer:
    // past the middle of the next row, the carried one swaps with it.
    const offsets = axis === 'row' ? tableRowOffsets(original) : tableColumnOffsets(original);
    const along = axis === 'row' ? point.y - original.y : point.x - original.x;
    let boundary = 0;
    offsets.forEach((offset, index) => {
      if (Math.abs(along - offset) < Math.abs(along - (offsets[boundary] ?? 0))) boundary = index;
    });
    const moved = moveTracks(original, axis, start, end, boundary);
    if (boundary !== drag.boundary) {
      drag.boundary = boundary;
      const graph = drag.previous;
      history.preview({
        nodes: graph.nodes,
        edges: graph.edges,
        tables: (graph.tables ?? []).map((table) => (table.id === original.id ? moved : table)),
      });
    }
    setTrackDrag({
      tableId: original.id,
      axis,
      first: moved === original ? start : movedTrackStart(start, end, boundary),
      count: end - start + 1,
      lifted: drag.lifted ?? tracksAsTable(bakeHeaderRow(original), axis, start, end),
      at: along - drag.grab,
    });
    return true;
  }

  function endTrackDrag(event: PointerEvent<SVGSVGElement>): boolean {
    const drag = trackDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    trackDragRef.current = null;
    setTrackDrag(null);
    releaseCapture(event);
    if (!drag.moved) return true;
    // What is shown is what is kept, as one step — or none, if it was put back
    // where it started.
    history.recordPreview(drag.previous);
    if (drag.boundary === null) return true;
    const moved = moveTracks(drag.original, drag.axis, drag.start, drag.end, drag.boundary);
    if (moved === drag.original) return true;
    // The selection goes with them, so they can be carried again or deleted.
    const first = movedTrackStart(drag.start, drag.end, drag.boundary);
    setCellRange(wholeTracksRange(moved, drag.axis, first, first + drag.end - drag.start));
    return true;
  }

  /** A carry abandoned — the pointer lost, or Escape — puts everything back. */
  function cancelTrackDrag() {
    const drag = trackDragRef.current;
    if (!drag) return;
    trackDragRef.current = null;
    setTrackDrag(null);
    if (drag.moved) history.restorePreview(drag.previous);
  }

  /**
   * A second quick press on a table's line: the column before it is fitted to
   * its text, or the row above it to its lines — the double-click every
   * spreadsheet has. True when it was that second press, and nothing else
   * should happen.
   */
  function fitOnSecondLinePress(
    event: PointerEvent<SVGElement>,
    table: TableElement,
    axis: TableAxis,
    track: number,
  ): boolean {
    const press: NodePress = {
      key: `${table.id}:${axis}:${track}`,
      time: event.timeStamp,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    if (!isDoublePress(lastTableLinePressRef.current, press.key, press)) {
      lastTableLinePressRef.current = press;
      return false;
    }
    lastTableLinePressRef.current = null;
    event.preventDefault();
    event.stopPropagation();
    const fitted = axis === 'col' ? fitColumnWidth(table, track) : fitRowHeight(table, track);
    if (fitted !== table) {
      clearError();
      replaceTable(fitted, table.id);
    }
    return true;
  }

  /** Text pasted into a table's cells: a spreadsheet's block, or one value. */
  function pasteIntoCells(table: TableElement, range: CellRange, text: string) {
    const grid = parseTabularText(text);
    if (grid.length === 0) return;
    const rows = trackSpan(range, 'row');
    const cols = trackSpan(range, 'col');
    const top = { row: rows.start, col: cols.start };
    clearError();

    // One value over a block fills every cell of it, as a spreadsheet does —
    // every cell that shows, so a merged cell takes it once, in its top-left,
    // and nothing lands in the cells it covers.
    const shown = anchorCellsInRange(table, range);
    if (grid.length === 1 && grid[0]!.length === 1 && cellsInRange(range).length > 1) {
      const value = grid[0]![0]!.slice(0, TABLE_CELL_TEXT_LIMIT);
      let next = table;
      for (const ref of shown) next = setCell(next, ref.row, ref.col, { text: value });
      const touched = Array.from({ length: rows.end - rows.start + 1 }, (_, i) => rows.start + i);
      replaceTable(fitRowsToContent(next, touched, 'grow'), table.id);
      return;
    }

    const pasted = pasteGrid(table, top, grid);
    replaceTable(pasted.table, table.id);
    setCellRange(pasted.range);
    if (pasted.truncated) {
      setValidationError(
        `Only part of it fitted: a table holds ${TABLE_MAX_ROWS} rows, ${TABLE_MAX_COLS} columns and ${TABLE_CELL_TEXT_LIMIT} characters a cell.`,
      );
    }
  }

  /** In a table's cells, with nothing being typed: where copy and paste mean cells. */
  function workingInCells(): boolean {
    return Boolean(selectedTable && cellRange && tableEditing && !editingCell);
  }

  function onFormPaste(event: ClipboardEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (!workingInCells() || !selectedTable || !heldRange) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    // Nothing in the system clipboard to lay into cells: an element copied in
    // the studio is pasted as one, the way it always has been.
    if (!text) {
      pasteFragment(clipboard);
      return;
    }
    pasteIntoCells(selectedTable, heldRange, text);
  }

  function onFormCopy(event: ClipboardEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (!workingInCells() || !selectedTable || !heldRange) return;
    // The cells in hand go out as spreadsheet text, so they can be pasted into
    // a spreadsheet — or back into another table here.
    event.preventDefault();
    event.clipboardData.setData('text/plain', rangeAsTabularText(selectedTable, heldRange));
  }

  /** Rows or columns `start`..`end` taken out. A table always keeps one. */
  function deleteTableTracks(table: TableElement, axis: TableAxis, start: number, end: number) {
    const next = deleteTracks(table, axis, start, end);
    if (!next) return;
    clearError();
    replaceTable(next, table.id);
    if (cellRange && selectedTableId === table.id) {
      setCellRange(rangeAfterDelete(next, cellRange, axis, start, end));
    }
  }

  /**
   * A press in a table's cells dragged across them: the block it sweeps is the
   * range, the way it is in any spreadsheet.
   */
  function beginCellRangeDrag(
    event: PointerEvent<SVGElement>,
    table: TableElement,
    anchor: CellRef,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    cellRangeDragRef.current = { pointerId: event.pointerId, tableId: table.id, anchor };
  }

  function updateCellRangeDrag(event: PointerEvent<SVGSVGElement>): boolean {
    const drag = cellRangeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const table = tableById.get(drag.tableId);
    if (!table) return true;
    const focus = cellAtPoint(table, surfacePoint(event), true);
    if (!focus) return true;
    // Only when the pointer crosses into another cell: a move within one would
    // otherwise re-render the whole editor for a range that has not changed.
    setCellRange((current) =>
      current &&
      current.focus.row === focus.row &&
      current.focus.col === focus.col &&
      current.anchor.row === drag.anchor.row &&
      current.anchor.col === drag.anchor.col
        ? current
        : { anchor: drag.anchor, focus },
    );
    return true;
  }

  function endCellRangeDrag(event: PointerEvent<SVGSVGElement>): boolean {
    const drag = cellRangeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    cellRangeDragRef.current = null;
    releaseCapture(event);
    return true;
  }

  function beginTableResize(
    event: PointerEvent<SVGElement>,
    table: TableElement,
    axis: TableAxis,
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
    // Worked out from the table as it was at the press, every move, so rows
    // grown to fit a narrow column come back down if it is widened again in
    // the same drag.
    const table = (session.previous.tables ?? []).find((current) => current.id === session.tableId);
    if (!table) return true;

    const point = surfacePoint(event);
    // The line lands on the grid, as every other edge being pulled does.
    const at = (value: number) => (snapEnabled ? snapToGrid(value) : value);
    // The boundary being dragged is measured from where its own track starts,
    // so the neighbouring columns keep the widths their authors chose.
    const next =
      session.axis === 'col'
        ? fitRowsToContent(
            resizeColumn(
              table,
              session.index,
              at(point.x) - (table.x + (tableColumnOffsets(table)[session.index] ?? 0)),
            ),
            null,
            'grow',
          )
        : resizeRow(
            table,
            session.index,
            at(point.y) - (table.y + (tableRowOffsets(table)[session.index] ?? 0)),
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
    kind: 'path' | 'table' | 'ink' | 'node' | 'arrow',
    id: string,
    { slop = 0, onClick }: { slop?: number; onClick?: () => void } = {},
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Belt to the `pointer-events` brace: with a tool armed the elements do not
    // take presses at all, and nothing should move one by another route either.
    if (canvasTool !== 'select') return;
    canvas.setPointerCapture(event.pointerId);

    // Grabbing something already in the selection drags the whole selection;
    // grabbing anything else drags only that, which is how every canvas editor
    // behaves and stops a stray click hauling the rest of the board along.
    const current = currentSelection();
    const key =
      kind === 'path'
        ? 'pathIds'
        : kind === 'table'
          ? 'tableIds'
          : kind === 'ink'
            ? 'inkIds'
            : kind === 'arrow'
              ? 'arrowIds'
              : 'nodeIds';
    const selection: StudioSelection = current[key].includes(id)
      ? {
          ...current,
          // A container carries what is nested inside it, so the group keeps
          // its shape however it was grabbed.
          nodeIds: [
            ...new Set(
              current.nodeIds.flatMap((nodeId) => [
                nodeId,
                ...diagramDescendantIds(history.snapshotRef.current.nodes, nodeId),
              ]),
            ),
          ],
        }
      : { ...EMPTY_STUDIO_SELECTION, [key]: [id] };

    const previous = history.snapshotRef.current;
    elementMoveRef.current = {
      pointerId: event.pointerId,
      selection,
      start: surfacePoint(event),
      startBounds: unionBounds(boundsOfSelection(previous, selection)),
      previous,
      moved: false,
      slop,
      onClick,
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
    // A press that has not gone far enough might still be a click, which means
    // something else (a table's cells) — so the artwork stays put until it has.
    if (!session.moved && Math.hypot(rawTotal.x, rawTotal.y) < session.slop) return true;
    // Snapped by the group's outer box, so a multi-element drag keeps its
    // internal spacing rather than each member rounding independently.
    const snapped = session.startBounds
      ? snapDragToGrid(offsetRect(session.startBounds, rawTotal), rawTotal, snapEnabled)
      : rawTotal;
    // Snap first, then hold the result on the sheet: clamping a snapped delta
    // can only move it back onto the grid's edge, whereas snapping a clamped one
    // could push it straight back off.
    const total = session.startBounds
      ? clampDragToCanvas(offsetRect(session.startBounds, snapped), snapped)
      : snapped;

    if (total.x === 0 && total.y === 0 && !session.moved) return true;
    session.moved = true;

    const origin = session.previous;
    const moving = session.selection;
    const nodeGoing = new Set(moving.nodeIds);
    const inkGoing = new Set(moving.inkIds);
    const pathGoing = new Set(moving.pathIds);
    const tableGoing = new Set(moving.tableIds);
    const arrowGoing = new Set(moving.arrowIds);

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
      // A bound end is drawn from its element, so dragging an arrow moves only
      // the ends that are free — which is what binding means.
      arrows: (origin.arrows ?? []).map((arrow) =>
        arrowGoing.has(arrow.id) ? offsetArrow(arrow, total.x, total.y) : arrow,
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
    if (!session.moved) session.onClick?.();
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
    if (selection.arrowIds.length > 0) {
      // Without this an arrow dragged on its own has no bounds to snap by, so
      // it was the one thing on the canvas the grid did not apply to.
      const boundsOf = arrowBoundsIn(scene);
      for (const arrow of scene.arrows ?? []) {
        if (!selection.arrowIds.includes(arrow.id)) continue;
        const bounds = boundsOf(arrow);
        if (bounds) rects.push(bounds);
      }
    }
    return rects;
  }

  /**
   * Arms a tool. Leaving the select tool drops the selection — its handles would
   * otherwise sit under the pen — so every route to a tool goes through here,
   * whether that is the rail or a button inside one of its sub-toolbars.
   */
  function selectCanvasTool(next: CanvasTool) {
    // Changing tools is the end of what the last one was drawing. A path in hand
    // is kept, the way Escape keeps it — it was being drawn on purpose — while an
    // arrow with only its first end down is dropped, as Escape drops it: its far
    // end would land wherever the pointer happened to leave the canvas. Picking
    // the tool already armed changes nothing, so the path carries on.
    if (next !== canvasTool) {
      if (pathAnchorsRef.current.length > 0) finishPenDraft();
      setArrowDraft(null);
      setArrowSnap(null);
      arrowPressRef.current = null;
    }
    setCanvasTool(next);
    setShapePicker(null);
    // A shape being dragged out does not survive the tool it was started under:
    // the ghost disappears the moment the tool changes, and a release that
    // still placed a node would put down something nobody could see coming.
    shapeDraftRef.current = null;
    setShapeDraftSquare(false);
    setShapeDraft(null);
    if (next !== 'select') clearAllSelection();
  }

  function renderFreehandOptions() {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <ToolStripGroup label="Freehand mode">
          {(
            [
              ['draw', 'Brush', Pencil],
              ['erase', 'Erase', Eraser],
            ] as const
          ).map(([mode, modeLabel, ModeIcon]) => (
            <PresetButton
              key={mode}
              name={modeLabel}
              active={canvasTool === mode}
              disabled={showSubmitting}
              onSelect={() => selectCanvasTool(mode)}
              label={<ModeIcon aria-hidden="true" size={14} />}
            />
          ))}
        </ToolStripGroup>

        {/* The eraser takes neither a width nor a colour: it removes strokes
            rather than laying them down, so both go quiet while it is on. */}
        <ToolStripGroup label="Ink width">
          {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
            <PresetButton
              key={preset}
              label={<StrokeWeightIcon weight={STROKE_WIDTH_SAMPLE[preset]} />}
              name={`${STROKE_WIDTH_LABELS[preset]} pen`}
              active={inkWidth === preset}
              disabled={showSubmitting || canvasTool === 'erase'}
              onSelect={() => setInkWidth(preset)}
            />
          ))}
        </ToolStripGroup>

        <ColorChoices
          itemName="ink"
          keys={QUICK_STROKE_KEYS}
          colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
          activeKey={inkColor}
          disabled={showSubmitting || canvasTool === 'erase'}
          onSelect={setInkColor}
        />
      </div>
    );
  }

  function renderPenOptions() {
    const filled = selectedPath ? Boolean(selectedPath.fillColor) : pathFilled;

    function setFilled(next: boolean) {
      setPathFilled(next);
      if (!selectedPath) return;
      if (next) {
        replacePath(
          { ...selectedPath, fillColor: FILL_FOR_STROKE[selectedPath.strokeColor ?? pathColor] },
          selectedPath.id,
        );
        return;
      }
      // Rebuilt without the key: an explicit `undefined` would still be a
      // property, and the write path rejects one.
      const rest = { ...selectedPath };
      delete rest.fillColor;
      replacePath(rest, selectedPath.id);
    }

    return (
      <div className="flex flex-col items-center gap-1.5">
        <ToolStripGroup label="Line width">
          {DIAGRAM_STROKE_WIDTH_PRESETS.map((preset) => (
            <PresetButton
              key={preset}
              label={<StrokeWeightIcon weight={STROKE_WIDTH_SAMPLE[preset]} />}
              name={`${STROKE_WIDTH_LABELS[preset]} line`}
              active={
                selectedPath ? selectedPath.strokeWidthPreset === preset : pathWidth === preset
              }
              disabled={showSubmitting}
              onSelect={() => {
                setPathWidth(preset);
                if (selectedPath) {
                  replacePath({ ...selectedPath, strokeWidthPreset: preset }, selectedPath.id);
                }
              }}
            />
          ))}
        </ToolStripGroup>

        <ToolStripGroup label="Line style">
          {DIAGRAM_STROKE_STYLES.map((style) => (
            <PresetButton
              key={style}
              label={<StrokeStyleIcon dash={STROKE_STYLE_DASH[style]} />}
              name={`${STROKE_STYLE_LABELS[style]} line`}
              active={
                selectedPath ? (selectedPath.strokeStyle ?? 'solid') === style : pathStyle === style
              }
              disabled={showSubmitting}
              onSelect={() => {
                setPathStyle(style);
                if (selectedPath) {
                  replacePath({ ...selectedPath, strokeStyle: style }, selectedPath.id);
                }
              }}
            />
          ))}
        </ToolStripGroup>

        {/* A fill only means anything once the shape encloses an area, so it is
            offered for a closed path and for the pen that can close one. It is
            a yes/no: the fill takes the line's own colour. */}
        {canvasTool === 'pen' || selectedPath?.closed ? (
          <ToolStripGroup label="Fill">
            <PresetButton
              label={<PaintBucket aria-hidden="true" size={14} />}
              name="Fill the shape"
              active={filled}
              disabled={showSubmitting}
              onSelect={() => setFilled(true)}
            />
            <PresetButton
              label={<DropletOff aria-hidden="true" size={14} />}
              name="Leave the shape transparent"
              active={!filled}
              disabled={showSubmitting}
              onSelect={() => setFilled(false)}
            />
          </ToolStripGroup>
        ) : null}

        <ColorChoices
          itemName="line"
          keys={QUICK_STROKE_KEYS}
          colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
          activeKey={selectedPath ? (selectedPath.strokeColor ?? null) : pathColor}
          disabled={showSubmitting}
          onSelect={(key) => {
            setPathColor(key);
            if (!selectedPath) return;
            const next = { ...selectedPath, strokeColor: key };
            // The fill follows the line, so recolouring recolours both.
            if (selectedPath.fillColor) next.fillColor = FILL_FOR_STROKE[key];
            replacePath(next, selectedPath.id);
          }}
        />

        {selectedPath ? (
          <ToolStripGroup label="Points">
            <PresetButton
              label={<Spline aria-hidden="true" size={14} />}
              name={pathEditing ? 'Done editing points' : 'Edit points'}
              active={pathEditing}
              onSelect={() => setPathEditing((current) => !current)}
            />
            {pathEditing && selectedAnchor !== null ? (
              <PresetButton
                label={
                  isSmoothAnchor(selectedPath.anchors[selectedAnchor]!) ? (
                    <PenTool aria-hidden="true" size={14} />
                  ) : (
                    <Spline aria-hidden="true" size={14} />
                  )
                }
                name={
                  isSmoothAnchor(selectedPath.anchors[selectedAnchor]!)
                    ? 'Make corner'
                    : 'Make curve'
                }
                active={false}
                onSelect={() =>
                  replacePath(toggleAnchorSmooth(selectedPath, selectedAnchor), selectedPath.id)
                }
              />
            ) : null}
          </ToolStripGroup>
        ) : null}
      </div>
    );
  }

  /**
   * The palette of things to place: shapes, a line, the two arrows.
   *
   * Nothing here closes the palette. These are all tools used more than once —
   * three boxes and an arrow between them is four trips back to the rail if
   * picking one puts the palette away — so it stays up until it is dismissed,
   * by the rail button or by a press somewhere that is not the canvas.
   */
  function renderShapeOptions() {
    const disabled = nodes.length >= DIAGRAM_NODE_LIMIT || showSubmitting;
    return (
      <div role="group" aria-label="Elements" className="flex flex-col items-center gap-1">
        {DIAGRAM_SHAPE_PALETTE_ORDER.map((shape) => {
          // Lit while it is the shape being carried, as the line and arrow
          // tiles below already are — a picked-up shape showed nothing.
          const armed = canvasTool === 'shape' && pendingShape === shape;
          return (
            <Tooltip
              key={shape}
              label={DIAGRAM_SHAPE_LABELS[shape]}
              {...(shape === 'box' ? { shortcut: shortcutLabelFor('shape') } : {})}
            >
              <button
                key={shape}
                type="button"
                draggable={!disabled}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DIAGRAM_SHAPE_MEDIA_TYPE, shape);
                  event.dataTransfer.effectAllowed = 'copy';
                  setPaletteDrag(shape);
                }}
                // Dropped anywhere, or abandoned with Escape: the preview goes.
                onDragEnd={endPaletteDrag}
                onClick={() => {
                  setPendingShape(shape);
                  selectCanvasTool('shape');
                }}
                disabled={disabled}
                aria-label={`Add ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`}
                aria-pressed={armed}
                className={tileClass(armed)}
              >
                <ShapeThumbnail shape={shape} />
              </button>
            </Tooltip>
          );
        })}
        {/* A line makes a form, so it belongs with the shapes — but unlike them
            it is a tool you draw with, not a node you place. */}
        <Tooltip label="Line" shortcut={shortcutLabelFor('line')}>
          <button
            type="button"
            aria-label="Line"
            aria-pressed={canvasTool === 'line'}
            disabled={showSubmitting}
            onClick={() => selectCanvasTool('line')}
            className={tileClass(canvasTool === 'line')}
          >
            <Minus aria-hidden="true" size={14} />
          </button>
        </Tooltip>
        {/* Arrows sit under the line for the same reason the line sits with the
            shapes: they are drawn rather than placed, but they make a form. */}
        {(
          [
            ['straight', 'Arrow', MoveRight],
            ['elbow', 'Elbowed arrow', CornerDownRight],
          ] as const
        ).map(([route, arrowLabel, ArrowIcon]) => (
          <Tooltip key={route} label={arrowLabel}>
            <button
              type="button"
              aria-label={arrowLabel}
              aria-pressed={canvasTool === 'arrow' && pendingArrowRoute === route}
              disabled={showSubmitting}
              onClick={() => {
                setPendingArrowRoute(route);
                setArrowDraft(null);
                selectCanvasTool('arrow');
              }}
              className={tileClass(canvasTool === 'arrow' && pendingArrowRoute === route)}
            >
              <ArrowIcon aria-hidden="true" size={14} />
            </button>
          </Tooltip>
        ))}
      </div>
    );
  }

  function renderTableOptions(close: () => void) {
    return (
      <div className="w-44">
        <PopoverSection label="New table">
          {/* The grid is the quick way to pick a size; the two number inputs
              below it are the same choice for anyone not using a pointer. */}
          <div
            className="grid gap-0.5"
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
                    pickUpTable(row, col);
                    close();
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
              <Rows3 aria-hidden="true" size={13} className="shrink-0" />
              <span className="sr-only">Rows</span>
              <input
                autoComplete="off"
                type="number"
                aria-label="Rows"
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
              <Columns3 aria-hidden="true" size={13} className="shrink-0" />
              <span className="sr-only">Columns</span>
              <input
                autoComplete="off"
                type="number"
                aria-label="Cols"
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
          {/* Past the grid the size is typed, and typing a number is not a
              decision to place anything — Place is. */}
          <Button
            variant="secondary"
            className="mt-2 w-full"
            onClick={() => {
              pickUpTable(tableRows, tableCols);
              close();
            }}
          >
            Place {tableRows} × {tableCols}
          </Button>
          <p className="mt-1.5 text-[10px] text-rt-ink-faint">
            Pick a size, then press the canvas where it should go
          </p>
        </PopoverSection>
      </div>
    );
  }

  /**
   * The question a container's delete has to ask: take what is inside it too,
   * or leave that on the canvas.
   */
  function renderContainerDeletePrompt() {
    return (
      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 w-72 -translate-x-1/2">
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
      </div>
    );
  }

  function renderTemplateOptions(close: () => void) {
    return (
      // Each shown as what it puts down, rather than as an icon standing for it.
      <div role="group" aria-label="Start from" className="grid w-[288px] grid-cols-2 gap-2">
        {STUDIO_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            title={template.hint}
            disabled={showSubmitting}
            onClick={() => {
              setPendingTemplate(template);
              selectCanvasTool('template');
              close();
            }}
            aria-label={template.label}
            className="group flex flex-col gap-1 rounded-lg border border-rt-tertiary bg-rt-surface p-1.5 text-left transition-colors hover:border-rt-primary hover:bg-rt-primary-tint focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span
              aria-hidden="true"
              data-testid="template-thumbnail"
              className="relative block aspect-[4/3] w-full overflow-hidden rounded-md border border-rt-tertiary/60 bg-white"
            >
              <TemplateThumbnail template={template} />
            </span>
            <span className="px-0.5 text-[11px] font-semibold text-rt-ink-muted group-hover:text-rt-ink">
              {template.label}
            </span>
          </button>
        ))}
      </div>
    );
  }

  /**
   * Watch the shape of the surface, so the drawn view follows the window.
   *
   * Measured once on mount and then by the observer below, which fires an
   * initial observation of its own and catches every later change.
   *
   * It used to measure on *every* render, with no dependency list — a setState
   * in the render's own commit. That only settles while two consecutive
   * measurements agree to within the tolerance; any layout that disagrees with
   * itself turns it into an unbounded update loop, which React ends by tearing
   * the tree down. That is the white screen this editor has already had once,
   * from the same pattern in the properties bar, and it is not worth keeping
   * for a first measurement the observer reports anyway.
   */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const next = bounds.width / bounds.height;
    setCanvasAspect((current) => (Math.abs(current - next) < 1e-3 ? current : next));
    setCanvasPixels((current) =>
      Math.abs(current.width - bounds.width) < 0.5 && Math.abs(current.height - bounds.height) < 0.5
        ? current
        : { width: bounds.width, height: bounds.height },
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const next = bounds.width / bounds.height;
      setCanvasAspect((current) => (Math.abs(current - next) < 1e-3 ? current : next));
      setCanvasPixels((current) =>
        Math.abs(current.width - bounds.width) < 0.5 &&
        Math.abs(current.height - bounds.height) < 0.5
          ? current
          : { width: bounds.width, height: bounds.height },
      );
    };

    // The window is the other way the surface changes shape, and the one an
    // element observer does not always see — a surface sized from the viewport
    // rather than from its own content changes without the element resizing in
    // any way the observer is told about.
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(canvas);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const graph = history.snapshot;
    const draft: DiagramArtifact = {
      type: 'diagram',
      nodes: graph.nodes,
      edges: graph.edges,
      ...(graph.ink?.length ? { ink: inkToData(graph.ink) } : {}),
      ...(graph.paths?.length ? { paths: graph.paths } : {}),
      ...(graph.tables?.length ? { tables: graph.tables } : {}),
      ...(graph.arrows?.length ? { arrows: graph.arrows } : {}),
      ...(graph.z?.length ? { z: graph.z } : {}),
    };

    // An empty canvas is not a draft. Clearing rather than storing it is what
    // lets someone throw a canvas away and have it stay thrown away.
    if (isDraftWorthKeeping(draft)) writeStudioDraft(draftStorage, draftKeyScope, draft);
    else clearStudioDraft(draftStorage, draftKeyScope);
  }, [history.snapshot]);

  /**
   * Empties the canvas, as the drawing studio's Clear does: one step, which Undo
   * brings back, so there is nothing to ask first.
   *
   * It closes nothing. Leaving is the back arrow, and an empty canvas is not
   * kept as a draft, so clearing and then leaving is how a canvas is thrown
   * away. Whatever was in hand is put down first, so nothing is left pointing
   * at an element that has gone.
   */
  function clearCanvas() {
    if (!canvasHasContent) return;
    clearError();
    cancelPlacement();
    clearAllSelection();
    setPendingContainerDelete(null);
    setEditingNodeId(null);
    setEditingCell(null);
    setEditingArrowId(null);
    history.commit({ nodes: [], edges: [], ink: [], paths: [], tables: [], arrows: [], z: [] });
  }

  /** Puts down whatever is being carried, without placing it. */
  function cancelPlacement() {
    setPendingTable(null);
    setPendingTemplate(null);
    setPaletteDrag(null);
    setGhostCursor(null);
    // The offer at an arrow's loose end is something being carried too. It
    // pointed at one arrow, so anything that puts work down has to put it down
    // as well — otherwise it hangs on the canvas naming an element that may
    // already be gone, swallowing presses where it sits.
    setShapePicker(null);
    setExtendPicker(null);
    extendPressRef.current = null;
    // A half-dragged shape is being carried too, and Escape puts down whatever
    // is being carried — without placing it.
    shapeDraftRef.current = null;
    setShapeDraftSquare(false);
    setShapeDraft(null);
    setArrowDraft(null);
    setArrowSnap(null);
    arrowPressRef.current = null;
    // A path in hand usually hears Escape first, through the form. With focus
    // outside the form this is the only handler that does, and switching to
    // Select without it left the anchors on the canvas under another tool.
    if (pathAnchorsRef.current.length > 0) {
      finishPenDraft(true);
      return;
    }
    setCanvasTool('select');
  }
  cancelPlacementRef.current = cancelPlacement;

  function setArrowDraft(next: ArrowDraft | null) {
    arrowDraftRef.current = next;
    setArrowDraftState(next);
  }

  /** Scene units, so the catchment is the same size on screen at any zoom. */
  function arrowSnapTolerance() {
    return arrowSnapToleranceForView(renderedViewRef.current, surfaceBounds());
  }

  /**
   * How far the pointer has to travel before a press is a drag rather than a
   * click. Shared by the arrow, the line and shape and text placement, so they
   * all read a wobble the same way.
   */
  function travelSlop() {
    return pointerTravelSlopForView(renderedViewRef.current, surfaceBounds());
  }

  /**
   * An endpoint for this pointer position, bound to whatever it landed on.
   *
   * A free end lands on the grid like every other piece of artwork, so an arrow
   * drawn between two empty spots lines up with the shapes around it. A bound
   * end does not: it belongs to the element it named, and the grid has no say
   * over where that element's edge is.
   */
  function arrowEndpointFor(point: DiagramPoint) {
    const endpoint = arrowEndpointAt(point, arrowTargetMap.values(), arrowSnapTolerance());
    if (endpoint.elementId !== undefined || !snapEnabled) return endpoint;
    return { ...endpoint, x: snapToGrid(endpoint.x), y: snapToGrid(endpoint.y) };
  }

  /**
   * Put the drafted arrow on the canvas, and stay on the tool.
   *
   * Drawing tools stay armed — the brush always has, and an arrow is rarely
   * the only one anybody wants. Select is one press away when it is time to
   * move something.
   */
  function placeArrow(
    draft: ArrowDraft,
    style: ArrowStyle = {
      strokeColor: pathColor,
      strokeWidthPreset: pathWidth,
      strokeStyle: pathStyle,
    },
  ) {
    const arrow = finishArrow(draft, style, travelSlop());
    if (!arrow) return null;

    const graph = history.snapshotRef.current;
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      arrows: [...(graph.arrows ?? []), arrow],
      ...((order) => (order ? { z: order } : {}))(paintOrderWithNewestOnTop(graph, arrow.id)),
    });
    setArrowDraft(null);
    setArrowSnap(null);
    arrowPressRef.current = null;
    // Armed, like the line and the brush: an arrow is rarely the only one.
    clearAllSelection();
    // Dropped on nothing: offer to put something there. The arrow stands on its
    // own either way — this is an offer, not a question that has to be answered.
    if (!arrow.to.elementId) setShapePicker({ arrowId: arrow.id, at: { ...arrow.to } });
    return arrow;
  }

  /**
   * Give the loose end of an arrow something to point at.
   *
   * The arrow already exists and is already valid — it ends in empty space, and
   * leaving it that way is a real answer, which is why dismissing the picker is
   * not a cancel. Choosing a shape places it where the arrow ends and binds the
   * end to it, in one entry so the two undo together.
   */
  function attachShapeToArrowEnd(shape: DiagramNodeShape) {
    const request = shapePickerRef.current;
    if (!request || isSubmitting) return;

    const graph = history.snapshotRef.current;
    // The arrow this offer belongs to may be gone: undone, deleted, or left
    // behind by a Clear. Without this the binding quietly found nothing and the
    // shape was committed anyway, so undoing an arrow and then taking the offer
    // put an orphan on the canvas and threw the redo away.
    const target = (graph.arrows ?? []).find((arrow) => arrow.id === request.arrowId);
    if (!target) {
      setShapePicker(null);
      return;
    }

    const size = newNodeSize(shape);
    const placed = addNode(
      graph.nodes,
      shape,
      // Where the arrow ends *now*, not where it ended when the offer opened:
      // the loose end can be dragged somewhere else while the picker is up, and
      // placing at the old point would yank the arrow back to it.
      { x: target.to.x - size.width / 2, y: target.to.y - size.height / 2 },
      snapEnabled,
    );
    if (!placed.ok) {
      // The offer stays up so the limit can be read and another answer given.
      setValidationError(placed.error);
      return;
    }
    setShapePicker(null);

    const attached = (graph.arrows ?? []).map((arrow) =>
      arrow.id === request.arrowId
        ? // No attachment fraction: the arrow aims at the new shape's centre and
          // meets whichever face it is approaching from, exactly as a connection
          // between two shapes does.
          { ...arrow, to: { ...arrow.to, elementId: placed.addedId } }
        : arrow,
    );

    history.commit({
      nodes: placed.nodes,
      edges: graph.edges,
      arrows: attached,
      ...((order) => (order ? { z: order } : {}))(paintOrderWithNewestOnTop(graph, placed.addedId)),
    });
    setCanvasTool('select');
    selectOnly(placed.addedId);
  }

  /**
   * A scene point in pixels within the canvas frame, for chrome drawn over the
   * canvas in HTML rather than inside it.
   */
  function sceneToFramePoint(point: DiagramPoint): DiagramPoint {
    const client = diagramRectToClientRect(
      { x: point.x, y: point.y, width: 0, height: 0 },
      surfaceBounds(),
      renderedView,
    );
    const frame = canvasFrameRef.current?.getBoundingClientRect();
    return { x: client.x - (frame?.left ?? 0), y: client.y - (frame?.top ?? 0) };
  }

  /** The canvas frame's size, which floating pickers are held inside. */
  function frameSize() {
    const frame = canvasFrameRef.current?.getBoundingClientRect();
    return { width: frame?.width ?? 0, height: frame?.height ?? 0 };
  }

  /** The node the extend buttons belong to, when they should be showing. */
  function extendSource(): DiagramNode | null {
    if (!selectedNode || multiSelected || selectedNode.shape === 'text') return null;
    if (canvasTool !== 'select' || editingNodeId || isSubmitting) return null;
    return selectedNode;
  }

  /**
   * Where each side's button sits, in pixels within the canvas frame.
   *
   * Outside the selection frame and past the resize band along it, so a press
   * on the button never lands on the band and the band never hides under the
   * button. Measured in pixels from the frame's edge, so the spacing is the
   * same at every zoom; turned with the shape, so each button stays opposite
   * its own side.
   */
  function extendHandlePositions(node: DiagramNode) {
    const size = effectiveDiagramNodeSize(node);
    const rotation = node.rotation ?? 0;
    const centre = { x: node.x + size.width / 2, y: node.y + size.height / 2 };
    const band = coarsePointer ? RESIZE_EDGE_COARSE_PX : RESIZE_EDGE_PX;
    const offset = band / 2 + EXTEND_HANDLE_CLEARANCE_PX + EXTEND_HANDLE_RADIUS_PX;
    return EXTEND_SIDES.map((side) => {
      const normal = extendSideNormal(side, rotation);
      const reach = (side === 'e' || side === 'w' ? size.width / 2 : size.height / 2) + frameOutset;
      const onFrame = sceneToFramePoint({
        x: centre.x + normal.x * reach,
        y: centre.y + normal.y * reach,
      });
      return {
        side,
        x: onFrame.x + normal.x * offset,
        y: onFrame.y + normal.y * offset,
        angle: EXTEND_SIDE_ANGLE[side] + rotation,
      };
    });
  }

  /**
   * Wakes the buttons the pointer is near.
   *
   * Written straight onto the buttons rather than through state: this runs on
   * every pointer move over the canvas, and re-rendering the whole editor that
   * often to fade a dot in would be the most expensive thing on the page.
   */
  function updateExtendProximity(clientX: number | null, clientY: number | null) {
    for (const button of extendHandleRefs.current.values()) {
      if (clientX === null || clientY === null) {
        delete button.dataset.near;
        continue;
      }
      const box = button.getBoundingClientRect();
      const near =
        Math.hypot(clientX - (box.left + box.width / 2), clientY - (box.top + box.height / 2)) <=
        EXTEND_NEAR_PX;
      if (near) button.dataset.near = 'true';
      else delete button.dataset.near;
    }
  }

  function onExtendPointerDown(
    event: PointerEvent<HTMLButtonElement>,
    node: DiagramNode,
    side: ExtendSide,
  ) {
    if (event.button !== 0 || isSubmitting) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.focus({ preventScroll: true });
    lastNodePressRef.current = null;
    setExtendPicker(null);
    extendPressRef.current = {
      pointerId: event.pointerId,
      sourceId: node.id,
      side,
      startClient: { x: event.clientX, y: event.clientY },
      dragging: false,
    };
    // The canvas takes the rest of the gesture, as it does for every drag: the
    // pointer will leave this small button long before it is let go.
    canvas.setPointerCapture(event.pointerId);
  }

  /**
   * A press on an extend button that travels becomes an arrow being drawn out
   * of the shape: it binds to whatever it is let go over, exactly as the arrow
   * tool does, and let go over nothing it offers a shape to end on.
   */
  function updateExtendPress(event: PointerEvent<SVGSVGElement>): boolean {
    const press = extendPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return false;
    event.preventDefault();
    const point = surfacePoint(event);
    if (!press.dragging) {
      const travelled = Math.hypot(
        event.clientX - press.startClient.x,
        event.clientY - press.startClient.y,
      );
      if (travelled < POINTER_TRAVEL_SLOP) return true;
      const source = history.snapshotRef.current.nodes.find((node) => node.id === press.sourceId);
      if (!source) {
        extendPressRef.current = null;
        return true;
      }
      press.dragging = true;
      const size = effectiveDiagramNodeSize(source);
      setArrowDraft({
        // Aimed at the centre, like a connection between two shapes, so it
        // leaves from whichever face the far end ends up on.
        from: { x: source.x + size.width / 2, y: source.y + size.height / 2, elementId: source.id },
        to: arrowEndpointFor(point),
        // Square, like every arrow grown out of a shape.
        route: 'elbow',
      });
      return true;
    }
    const draft = arrowDraftRef.current;
    if (draft) setArrowDraft({ ...draft, to: arrowEndpointFor(point) });
    setArrowSnap(snapArrowPoint(point, arrowTargetMap.values(), arrowSnapTolerance()));
    return true;
  }

  function endExtendPress(event: PointerEvent<SVGSVGElement>): boolean {
    const press = extendPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return false;
    extendPressRef.current = null;
    releaseCapture(event);

    // A click: offer the shapes to add on that side.
    if (!press.dragging) {
      setExtendPicker({ sourceId: press.sourceId, side: press.side });
      return true;
    }

    const draft = arrowDraftRef.current;
    setArrowSnap(null);
    if (!draft) return true;
    const to = arrowEndpointFor(surfacePoint(event));
    // Dragged out and back onto the shape it came from: a loop, leaving from
    // the side whose button was pulled and going round the shape to where it
    // was let go. Aimed at the centre, the start would have no face to leave by.
    const from =
      to.elementId === press.sourceId
        ? { ...draft.from, at: EXTEND_SIDE_ATTACH[press.side] }
        : draft.from;
    // Plain, like a connection made any other way: the pen's colours belong to
    // lines drawn with the pen.
    const placed = placeArrow({ ...draft, from, to }, {});
    if (!placed) setArrowDraft(null);
    // Joined to something, it is the thing just made, so it is what is selected
    // — ready to be labelled or restyled. Left pointing at nothing, the offer at
    // its loose end is what matters next, and the selection stays clear for it.
    else if (placed.to.elementId) {
      applySelection({ ...EMPTY_STUDIO_SELECTION, arrowIds: [placed.id] });
    }
    return true;
  }

  /** Puts the chosen shape beside the source, joined to it, as one step. */
  function extendWith(shape: DiagramNodeShape) {
    const request = extendPicker;
    if (!request || isSubmitting) return;
    const graph = history.snapshotRef.current;
    const source = graph.nodes.find((node) => node.id === request.sourceId);
    if (!source) {
      setExtendPicker(null);
      return;
    }
    if (graph.nodes.length >= DIAGRAM_NODE_LIMIT) {
      // The picker stays up so the limit can be read.
      setValidationError(`A diagram can hold ${DIAGRAM_NODE_LIMIT} elements at most.`);
      return;
    }

    clearError();
    const { node, arrow } = planExtension(graph.nodes, source, request.side, shape, {
      nodeId: createNodeId(graph.nodes),
      arrowId: createArrowId(),
    });
    const nodes = [...graph.nodes, node];
    const arrows = [...(graph.arrows ?? []), arrow];
    const withNode = paintOrderWithNewestOnTop({ ...graph, nodes }, node.id);
    const order = paintOrderWithNewestOnTop(
      { ...graph, nodes, arrows, ...(withNode ? { z: withNode } : {}) },
      arrow.id,
    );
    history.commit({ nodes, edges: graph.edges, arrows, ...(order ? { z: order } : {}) });
    setExtendPicker(null);
    setCanvasTool('select');
    // The new shape, so the next step in the flow is one more click away.
    selectOnly(node.id);
    canvasRef.current?.focus({ preventScroll: true });
  }

  /**
   * The four buttons that grow the diagram from the selected shape.
   *
   * Quiet until the pointer comes near — a dot, not four buttons, round every
   * shape that is selected — then an arrow pointing the way the new shape will
   * go, and lit under the pointer. Real buttons, so Tab reaches them and Enter
   * opens the same picker a click does.
   */
  function renderExtendHandles() {
    const source = extendSource();
    if (!source) return null;
    // Positioned directly and centred on their point by transform. Wrapped in
    // anything inline — a tooltip's span was — each one sat on a text baseline
    // and was pushed down, so the bottom button was further out than the top
    // and the side ones sat below the middle of their side.
    return extendHandlePositions(source).map(({ side, x, y, angle }) => (
      <button
        key={side}
        type="button"
        ref={(element) => {
          if (element) extendHandleRefs.current.set(side, element);
          else extendHandleRefs.current.delete(side);
        }}
        data-testid="connection-handle"
        aria-label={`Add a connected shape ${EXTEND_SIDE_LABELS[side]}`}
        aria-haspopup="true"
        aria-expanded={extendPicker?.side === side}
        data-open={extendPicker?.side === side ? 'true' : undefined}
        className={`rt-extend-handle absolute ${STUDIO_LAYER.chrome}`}
        style={{ left: x, top: y }}
        onPointerDown={(event) => onExtendPointerDown(event, source, side)}
        onClick={(event) => {
          // A pointer's click is handled on release, by the canvas, which has
          // the gesture by then. This is the keyboard's Enter or Space.
          if (event.detail !== 0) return;
          setExtendPicker({ sourceId: source.id, side });
        }}
      >
        <span aria-hidden="true" className="rt-extend-dot" />
        <span aria-hidden="true" className="rt-extend-face">
          <ArrowRight size={13} strokeWidth={2.25} style={{ transform: `rotate(${angle}deg)` }} />
        </span>
      </button>
    ));
  }

  function renderExtendPicker() {
    if (!extendPicker) return null;
    const source = selectedNodeById(nodes, extendPicker.sourceId);
    if (!source) return null;
    const handle = extendHandlePositions(source).find(({ side }) => side === extendPicker.side);
    if (!handle) return null;
    // Opens on whichever side of the button faces away from the shape, as the
    // shape is turned on screen.
    const normal = extendSideNormal(extendPicker.side, source.rotation ?? 0);
    const opens: ShapePickerSide =
      Math.abs(normal.x) >= Math.abs(normal.y)
        ? normal.x > 0
          ? 'e'
          : 'w'
        : normal.y > 0
          ? 's'
          : 'n';
    return (
      <StudioShapePicker
        key={`${source.id}-${extendPicker.side}`}
        label="Add a connected shape"
        testId="extend-shape-picker"
        anchor={{ x: handle.x, y: handle.y }}
        side={opens}
        container={frameSize()}
        shapes={extendShapeChoices(source.shape ?? 'box')}
        nameFor={(shape) =>
          shape === source.shape
            ? `Connect another ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`
            : `Connect a ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`
        }
        tooltipFor={(shape) =>
          shape === source.shape
            ? `Another ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`
            : DIAGRAM_SHAPE_LABELS[shape]
        }
        renderIcon={(shape) => <ShapeThumbnail shape={shape} />}
        tileClassName={TILE_BUTTON}
        disabled={showSubmitting}
        autoFocus
        onPick={extendWith}
        onDismiss={() => {
          setExtendPicker(null);
          // Focus was taken into the picker; give it back to the canvas so the
          // tool keys and arrows work again straight away. A press elsewhere
          // that closed it moves focus on its own afterwards.
          canvasRef.current?.focus({ preventScroll: true });
        }}
      />
    );
  }

  /**
   * Offered at the loose end of an arrow that points at nothing. Hung below the
   * end in HTML, so it is the same size at every zoom and follows the end as
   * the canvas pans.
   */
  function renderArrowEndPicker() {
    if (!shapePicker) return null;
    const anchor = sceneToFramePoint(shapePicker.at);
    return (
      <StudioShapePicker
        label="Add a shape at the end of this arrow"
        testId="arrow-shape-picker"
        anchor={anchor}
        side="s"
        container={frameSize()}
        shapes={DIAGRAM_NODE_SHAPES.filter((shape) => shape !== 'container')}
        nameFor={(shape) => `End with ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`}
        tooltipFor={(shape) => DIAGRAM_SHAPE_LABELS[shape]}
        renderIcon={(shape) => <ShapeThumbnail shape={shape} />}
        tileClassName={TILE_BUTTON}
        disabled={showSubmitting}
        dismissLabel="Leave this arrow pointing at nothing"
        onPick={attachShapeToArrowEnd}
        onDismiss={() => setShapePicker(null)}
      />
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
    const raw = activeStrokeRef.current;
    // Trimmed as it is put down, so nothing downstream has to cope with a
    // stroke the artifact cannot hold.
    const stroke = raw ? fitInkStroke(raw) : null;
    activeStrokeRef.current = null;
    setActiveStroke(null);
    if (!stroke) return;

    const graph = history.snapshotRef.current;
    commitInk([...(graph.ink ?? []), stroke], paintOrderWithNewestOnTop(graph, stroke.id));
  }

  function eraseAt(event: PointerEvent<SVGSVGElement>) {
    const graph = history.snapshotRef.current;
    const current = graph.ink ?? [];
    const radius = eraserRadiusForView(renderedViewRef.current, surfaceBounds());
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
    // Going anywhere else on the canvas is an answer to the offer: the arrow
    // stays as it is, pointing at nothing. The picker's own presses never reach
    // here — it stops them — so this only fires for a press outside it.
    setShapePicker(null);

    // Middle mouse or Space+drag pans; both leave the diagram itself untouched.
    if (event.button === 1 || (event.button === 0 && panReady)) {
      event.preventDefault();
      panRef.current = {
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startView: viewRef.current,
        startRendered: renderedViewRef.current,
      };
      setIsPanning(true);
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) return;

    if (canvasTool === 'arrow') {
      event.preventDefault();
      clearAllSelection();
      const point = surfacePoint(event);
      const draft = arrowDraftRef.current;
      if (draft) {
        // Second press of a click-then-click: this is the destination. The
        // element the arrow started on is a legitimate target — that is a
        // self-loop, and it draws as a loop around the element.
        placeArrow({ ...draft, to: arrowEndpointFor(point) });
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      const from = arrowEndpointFor(point);
      setArrowDraft({ from, to: { x: point.x, y: point.y }, route: pendingArrowRoute });
      arrowPressRef.current = { pointerId: event.pointerId, committed: false };
      return;
    }

    if (canvasTool === 'shape' || canvasTool === 'text') {
      // Nothing is placed yet: the press opens a drag-out, and the release
      // decides whether that was a size or just a click.
      event.preventDefault();
      clearAllSelection();
      const origin = surfacePoint(event);
      shapeDraftRef.current = { pointerId: event.pointerId, origin, moved: false };
      setShapeDraftSquare(false);
      setShapeDraft({ origin, current: origin });
      canvasRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (canvasTool === 'table') {
      // Arming the tool is not enough — a press only lands a table once a size
      // has been picked up, so a stray click on the canvas does nothing.
      if (!pendingTable) return;
      clearAllSelection();
      event.preventDefault();
      const size = emptyTableSize(pendingTable);
      placeTable(centredOnCursor(surfacePoint(event), size), pendingTable.rows, pendingTable.cols);
      return;
    }

    if (canvasTool === 'template') {
      if (!pendingTemplate) return;
      event.preventDefault();
      clearAllSelection();
      const size = templateSize(pendingTemplate);
      // Where its ghost is: centred on the press, on the grid and on the sheet.
      applyTemplate(
        pendingTemplate,
        placeNodePosition(centredOnCursor(surfacePoint(event), size), size, snapEnabled),
      );
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
      // The line is drawn by two gestures, like the arrow: press-drag-release,
      // or a click for each end. Starting over on every press is what broke
      // the second one — the first point was thrown away before the second
      // could arrive, so a click-then-click could never finish a line.
      const next =
        canvasTool === 'line'
          ? anchors.length === 0
            ? [{ x: placed.x, y: placed.y }]
            : [...anchors, placed]
          : [...anchors, placed];
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
        x: ((event.clientX - pan.startClient.x) / bounds.width) * pan.startRendered.width,
        y: ((event.clientY - pan.startClient.y) / bounds.height) * pan.startRendered.height,
      }),
    );
    return true;
  }

  function onCanvasPointerMove(event: PointerEvent<SVGSVGElement>) {
    updateExtendProximity(event.clientX, event.clientY);
    // Only measured when there is table chrome to wake: this runs on every move.
    if (tableChromeRef.current) tableChromeRef.current.updatePointer(surfacePoint(event));
    if (updateArrowEdit(event)) return;
    if (updateExtendPress(event)) return;

    if (canvasTool === 'arrow') {
      const point = surfacePoint(event);
      const draft = arrowDraftRef.current;
      const snap = snapArrowPoint(point, arrowTargetMap.values(), arrowSnapTolerance());
      setArrowSnap(snap);
      // Before the first press the dot is all there is to show; after it, the
      // preview arrow follows the pointer as well.
      if (draft) setArrowDraft({ ...draft, to: arrowEndpointFor(point) });
      return;
    }

    // A shape being dragged out takes the move before the ghost does: the ghost
    // follows the cursor only while nothing has been pressed yet, and once a
    // drag is under way the rectangle is what the preview should show.
    if (updateShapeDraft(event)) return;

    if (canvasTool === 'text' || canvasTool === 'shape' || canvasTool === 'template') {
      setGhostCursor(surfacePoint(event));
      return;
    }
    if (canvasTool === 'table' && pendingTable) {
      setGhostCursor(surfacePoint(event));
      return;
    }
    if (updatePan(event)) return;
    if (updateRotate(event)) return;
    if (updateResize(event)) return;
    if (updateElementMove(event)) return;
    if (updatePathEdit(event)) return;
    if (updateTableResize(event)) return;
    if (updateCellRangeDrag(event)) return;
    if (updateTrackDrag(event)) return;

    if (inkPointerRef.current === event.pointerId) {
      event.preventDefault();
      if (eraseStartRef.current) eraseAt(event);
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

    // Which gesture this was is what the press began, not the tool armed now:
    // Escape or a shortcut can change the tool while the button is still down,
    // and reading the tool then dropped the sweep's undo step on the floor.
    const previous = eraseStartRef.current;
    if (previous) {
      eraseStartRef.current = null;
      // One undo step for the whole sweep, however many strokes it took out.
      history.recordPreview(previous);
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

    if (canvasTool === 'line') {
      const anchors = pathAnchorsRef.current;
      const start = anchors[0];
      // Two anchors means the second press has landed: that is the line.
      if (anchors.length >= 2) {
        commitPathDraft(anchors.slice(0, 2), false);
        return true;
      }
      // Otherwise this is the release of a drag. If it travelled far enough,
      // the line is finished here; if it did not, the press was a click and the
      // first point stays put, waiting for a second one. Without that distance
      // check any wobble at all committed a line a pixel long — a dot.
      const end = pathCursor;
      if (start && end && Math.hypot(end.x - start.x, end.y - start.y) >= travelSlop()) {
        commitPathDraft([start, { x: end.x, y: end.y }], false);
      }
    }
    return true;
  }

  function onCanvasPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (endArrowEdit(event)) return;
    if (endExtendPress(event)) return;

    const arrowPress = arrowPressRef.current;
    if (arrowPress && arrowPress.pointerId === event.pointerId) {
      releaseCapture(event);
      const draft = arrowDraftRef.current;
      // Two gestures, one draft: a press-drag-release lands the arrow here, and
      // a press that never travelled leaves it open for a second click. Which
      // one happened is just whether the far end got far enough away.
      if (draft && placeArrow(draft)) return;
      arrowPressRef.current = null;
      return;
    }

    if (endPan(event)) return;
    if (endElementMove(event)) return;
    if (endPathEdit(event)) return;
    if (endTableResize(event)) return;
    if (endCellRangeDrag(event)) return;
    if (endTrackDrag(event)) return;
    if (endPath(event)) return;
    if (endShapeDraft(event)) return;
    if (endRotate(event)) return;
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
    // An arrow being drawn out of a shape is dropped, not placed: the release
    // is what says where it ends, and there was none.
    if (extendPressRef.current?.pointerId === event.pointerId) {
      extendPressRef.current = null;
      setArrowDraft(null);
      setArrowSnap(null);
    }
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
    // A drag-out that loses the pointer places nothing: the release is what
    // decides the size, and there was none.
    if (shapeDraftRef.current?.pointerId === event.pointerId) {
      shapeDraftRef.current = null;
      setShapeDraftSquare(false);
      setShapeDraft(null);
    }
    if (rotateRef.current?.pointerId === event.pointerId) {
      if (rotateRef.current.moved) history.recordPreview(rotateRef.current.previous);
      rotateRef.current = null;
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
    if (cellRangeDragRef.current?.pointerId === event.pointerId) cellRangeDragRef.current = null;
    // A carried row that loses the pointer stays where it was: the release is
    // what says where it goes, and there was none.
    if (trackDragRef.current?.pointerId === event.pointerId) cancelTrackDrag();
    const pathEdit = pathEditRef.current;
    if (pathEdit?.pointerId === event.pointerId) {
      history.recordPreview(pathEdit.previous);
      pathEditRef.current = null;
    }
    // Losing capture mid-gesture must still land the work, not discard it: a
    // half-drawn stroke is committed exactly as `pointerup` would commit it.
    if (inkPointerRef.current === event.pointerId) {
      inkPointerRef.current = null;
      // By the gesture, not the tool armed now — the same reason `endInk` gives.
      const previous = eraseStartRef.current;
      if (previous) {
        eraseStartRef.current = null;
        history.recordPreview(previous);
      } else {
        finishStroke();
      }
    }
    const resize = resizeRef.current;
    if (resize?.pointerId === event.pointerId) {
      if (resize.moved) history.recordPreview(resize.previous);
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

  function endPaletteDrag() {
    setPaletteDrag(null);
    setGhostCursor(null);
  }

  function onCanvasDragOver(event: DragEvent<SVGSVGElement>) {
    if (isSubmitting) return;
    if (!event.dataTransfer?.types?.includes(DIAGRAM_SHAPE_MEDIA_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (paletteDrag) setGhostCursor(surfacePoint(event));
  }

  function onCanvasDragLeave(event: DragEvent<SVGSVGElement>) {
    // Leaving for one of the canvas's own children is still over the canvas.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    if (paletteDrag) setGhostCursor(null);
  }

  function onCanvasDrop(event: DragEvent<SVGSVGElement>) {
    if (isSubmitting) return;
    const shape = event.dataTransfer?.getData(DIAGRAM_SHAPE_MEDIA_TYPE) as DiagramNodeShape | '';
    endPaletteDrag();
    if (!shape || !DIAGRAM_NODE_SHAPES.includes(shape)) return;
    event.preventDefault();
    const point = surfacePoint(event);
    const size = newNodeSize(shape);
    addElement(
      shape,
      { x: point.x - size.width / 2, y: point.y - size.height / 2 },
      undefined,
      containerAtPoint(history.snapshotRef.current.nodes, point)?.id ?? null,
    );
  }

  /**
   * Turn the selection by a step, from the keyboard.
   *
   * Rotation was reachable only by dragging a corner, so a keyboard user could
   * not turn anything — and, worse, could not straighten something that arrived
   * turned in someone else's proposal. This follows `nudgeSelection`: the same
   * kinds, the same one-entry-per-press, the same Shift-for-coarser rule the
   * drag already uses.
   *
   * Containers and tables are left out here exactly as they are left out of the
   * corner zones, so the two routes offer the same thing.
   */
  function rotateSelection(step: number) {
    const graph = history.snapshotRef.current;
    const turnable = new Set(
      graph.nodes.filter((node) => !diagramCanParent(node.shape)).map((node) => node.id),
    );
    const nodeIds = selectedIds.filter((id) => turnable.has(id));
    const inkIds = new Set(selectedInkIds);
    const pathIds = new Set(selectedPathIds);
    if (nodeIds.length + inkIds.size + pathIds.size === 0) return;

    const turn = <T extends { rotation?: number }>(element: T): T =>
      withRotation(element, normalizeRotation((element.rotation ?? 0) + step));

    const nodes = new Set(nodeIds);
    history.commit({
      nodes: graph.nodes.map((node) => (nodes.has(node.id) ? turn(node) : node)),
      edges: graph.edges,
      ink: (graph.ink ?? []).map((stroke) => (inkIds.has(stroke.id) ? turn(stroke) : stroke)),
      paths: (graph.paths ?? []).map((path) => (pathIds.has(path.id) ? turn(path) : path)),
    });
  }

  function nudgeSelection(offset: DiagramPoint) {
    const graph = history.snapshotRef.current;
    const inkGoing = new Set(selectedInkIds);
    const pathGoing = new Set(selectedPathIds);
    const tableGoing = new Set(selectedTableIds);
    const arrowGoing = new Set(selectedArrowIds);

    // Held to the sheet by the selection's outer box, exactly as a pointer drag
    // is. Without this a drawing could be nudged off the canvas a step at a time
    // and left somewhere it could never be selected again.
    const startBounds = unionBounds(boundsOfSelection(graph, currentSelection()));
    const delta = startBounds ? clampDragToCanvas(offsetRect(startBounds, offset), offset) : offset;
    if (delta.x === 0 && delta.y === 0) return;

    history.commit({
      // Nodes keep their own mover: it understands snapping and containers.
      nodes:
        selectedIds.length > 0
          ? moveNodesBy(
              graph.nodes,
              nodeOrigins(graph.nodes, selectedIds),
              delta,
              selectedIds[0]!,
              snapEnabled,
            )
          : graph.nodes,
      edges: graph.edges,
      ink: (graph.ink ?? []).map((stroke) =>
        inkGoing.has(stroke.id)
          ? {
              ...stroke,
              points: stroke.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })),
            }
          : stroke,
      ),
      paths: (graph.paths ?? []).map((path) =>
        pathGoing.has(path.id) ? movePathBy(path, delta.x, delta.y) : path,
      ),
      tables: (graph.tables ?? []).map((table) =>
        tableGoing.has(table.id) ? moveTableBy(table, delta.x, delta.y) : table,
      ),
      arrows: (graph.arrows ?? []).map((arrow) =>
        arrowGoing.has(arrow.id) ? offsetArrow(arrow, delta.x, delta.y) : arrow,
      ),
    });
  }

  function onCanvasKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (isSubmitting) return;

    // Rows being carried go back where they were, and nothing else happens.
    if (event.key === 'Escape' && trackDragRef.current) {
      event.preventDefault();
      cancelTrackDrag();
      return;
    }

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

    // Enter goes into a selected table, at its first cell: the keyboard's way
    // to the click that does the same.
    if (event.key === 'Enter' && selectedTable && !cellRange && !multiSelected) {
      event.preventDefault();
      enterTableCells(selectedTable.id, { row: 0, col: 0 });
      return;
    }

    if (event.key === '?' && !editingNodeId && !editingCell) {
      event.preventDefault();
      setShortcutSheetOpen(true);
      return;
    }

    // Tool shortcuts, before the table's own typing: `toolForShortcut` is what
    // decides which of the two a plain letter means, and it declines whenever
    // the canvas is busy with something the letter belongs to.
    const shortcutTool = toolForShortcut(event.key, {
      // An arrow label counts as typing too. The field stops the key itself,
      // so this rarely showed — but only while focus is actually inside it.
      editingText: editingNodeId !== null || editingCell !== null || editingArrowId !== null,
      inCellMode: Boolean(selectedTable && cellRange),
      submitting: isSubmitting,
      modifier: event.ctrlKey || event.metaKey || event.altKey,
    });
    if (shortcutTool) {
      event.preventDefault();
      if (shortcutTool === 'shape') setPendingShape('box');
      // G picks up a table the size last chosen in its menu (3x3 at first), the
      // way R picks up a box. Arming the tool alone left the rail lit with
      // nothing to preview and presses that did nothing, and the size menu is
      // on the rail, out of reach of the key. The button still arms without a
      // size, so a click meant to deselect never drops a table.
      if (shortcutTool === 'table') {
        pickUpTable(tableRows, tableCols);
        return;
      }
      selectCanvasTool(shortcutTool);
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
          openCellEditor(cell, tableCellAt(selectedTable, cell.row, cell.col)?.text ?? '', true);
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
        // Rows or columns picked whole go; a block of cells is emptied.
        const whole = wholeTracks(heldRange);
        if (whole) {
          // Every row there is, is the table.
          if (!deleteTracks(selectedTable, whole.axis, whole.start, whole.end)) {
            deleteSelection();
            return;
          }
          deleteTableTracks(selectedTable, whole.axis, whole.start, whole.end);
          return;
        }
        replaceTable(clearCellRange(selectedTable, heldRange ?? cellRange), selectedTable.id);
        return;
      }

      // Typing replaces the cell, exactly as it does in a spreadsheet. Nothing
      // is written until the edit is committed: writing the first character
      // straight away made the edit two undo steps, and left that character
      // behind when the edit was abandoned with Escape.
      if (cell && !withModifier && event.key.length === 1) {
        event.preventDefault();
        openCellEditor(cell, event.key, false);
        return;
      }
    }

    if (event.key === 'Escape') {
      // Carrying something is handled above the canvas, by `cancelPlacement`:
      // arming a tool from the rail leaves focus on the rail, so a handler that
      // needs canvas focus would never see the key.

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
      // An arrow has nothing inside it to delete first, so Delete always means
      // the whole arrow — unlike a path, where it takes an anchor if one is held.
      if (selection.arrowIds.length > 0) {
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

    // Brackets turn the selection, the way the arrow keys move it: the same
    // 5-degree step the corner zones use, and 45 with Shift held.
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const step = event.shiftKey ? DIAGRAM_ROTATION_COARSE_STEP : DIAGRAM_ROTATION_STEP;
      rotateSelection(event.key === '[' ? -step : step);
      return;
    }

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
      // Escape ends the session; Enter finishes this path and leaves the tool
      // armed for the next one.
      finishPenDraft(event.key === 'Escape');
      return;
    }

    // Backspace takes back the last point while a path is still being drawn.
    // The committed-path editor already binds these keys to `removeAnchor`, but
    // a draft is not a path yet, so it needs its own step back — without one the
    // only way to fix a mis-placed point was to finish and start over.
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      pathAnchorsRef.current.length > 0
    ) {
      const target = event.target as HTMLElement | null;
      // Not while something is being typed into: there the key means "delete a
      // character", as it does everywhere else.
      if (target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        event.stopPropagation();
        const next = pathAnchorsRef.current.slice(0, -1);
        pathAnchorsRef.current = next;
        setPathAnchors(next);
        // The rubber band trails the last point that is left, so taking the only
        // point back puts the pen down entirely rather than leaving it anchored
        // to somewhere the user has just removed.
        if (next.length === 0) clearPathDraft();
        else setPathCursor(next[next.length - 1]!);
        return;
      }
    }

    if (event.key === 'Escape' && pendingContainerDelete) {
      event.preventDefault();
      event.stopPropagation();
      setPendingContainerDelete(null);
      return;
    }

    if (event.key === 'Escape' && shapePickerRef.current) {
      event.preventDefault();
      event.stopPropagation();
      // The arrow stays: it was placed when it was dropped, and pointing at
      // nothing is a finished arrow, not an abandoned one.
      setShapePicker(null);
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
          arrowIds: (graph.arrows ?? []).map((arrow) => arrow.id),
        });
        return;
      }
      // In a table's cells, copy and paste are left to the browser, whose
      // clipboard events carry text in and out — to and from a spreadsheet.
      if ((key === 'c' || key === 'v') && workingInCells()) return;
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

  /**
   * A gesture still in the user's hand, if there is one.
   *
   * Every session here either previews into `history.snapshotRef` or commits on
   * release, and `onSubmit` reads that same snapshot — so proposing part-way
   * through one either serialises a half-finished state or silently drops work
   * that was never committed. Four of these were guarded and the rest were not,
   * which is the sort of gap a list in one place is meant to close.
   */
  function gestureInHand(): string | null {
    if (dragRef.current || elementMoveRef.current) {
      return 'Finish moving the element before proposing.';
    }
    if (resizeRef.current) return 'Finish resizing the element before proposing.';
    if (rotateRef.current) return 'Finish turning the element before proposing.';
    if (arrowEditRef.current) return 'Finish moving the arrow before proposing.';
    if (pathEditRef.current) return 'Finish moving the point before proposing.';
    if (tableResizeRef.current) return 'Finish resizing the table before proposing.';
    if (trackDragRef.current) return 'Finish moving the row or column before proposing.';
    if (shapeDraftRef.current) return 'Finish drawing the shape before proposing.';
    if (inkPointerRef.current !== null) return 'Finish the stroke before proposing.';
    // Uncommitted work, rather than a half-applied change: proposing over it
    // would drop it without saying so, which a submit must never do.
    if (arrowDraftRef.current) return 'Finish the arrow with Esc before proposing.';
    if (pathAnchorsRef.current.length > 0) {
      return 'Finish the path with Enter or Esc before proposing.';
    }
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const inHand = gestureInHand();
    if (inHand) {
      setValidationError(inHand);
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
      graph.arrows ?? [],
    );
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }
    // Ctrl+Enter submits without going through the disabled button. Checked on
    // the very artifact about to be sent, after any label being typed was
    // committed.
    if (extending && JSON.stringify(prepared.artifact) === sourceKeyRef.current) {
      setValidationError(EXTEND_UNCHANGED_HINT);
      return;
    }

    setValidationError(null);
    const sent = await submitArtifact(prepared.artifact);
    // The work is on the board now, so the copy held against losing it is done.
    if (sent) clearStudioDraft(draftStorage, draftKeyScope);
  }

  const error = validationError ?? submissionError;
  /**
   * The properties bar, or nothing.
   *
   * Withheld while a tool is armed or a label is being typed: it belongs to a
   * selection you are looking at, not to one you are in the middle of leaving.
   */
  const barTargets = selectionTargets();
  const barProperties = commonProperties(barTargets);
  const barSelectionRect = selectionClientRect();
  const barSurface = surfaceBounds();
  const barFrame = canvasFrameRef.current?.getBoundingClientRect();
  const propertiesBar =
    // Not while the extend picker is open. It hangs on the same side of the
    // shape the bar does, and the choice it offers is short: the bar steps away
    // for it and comes back, for the new shape, the moment it is answered.
    barTargets.length > 0 &&
    barSelectionRect &&
    canvasTool === 'select' &&
    !editingNodeId &&
    !extendPicker ? (
      <StudioPropertiesBar
        properties={barProperties}
        renderControl={renderPropertyControl}
        selection={barSelectionRect}
        // Clear of the extend buttons too, which sit outside the frame in
        // pixels, so the bar and the top button never overlap at any zoom.
        selectionPadding={extendSource() ? EXTEND_HANDLE_REACH_PX : 0}
        viewport={{
          x: barSurface.left,
          y: barSurface.top,
          width: barSurface.width,
          height: barSurface.height,
        }}
        origin={{ x: barFrame?.left ?? 0, y: barFrame?.top ?? 0 }}
        selectionSize={barTargets.length}
        onAlign={alignSelection}
        onDistribute={distributeSelection}
        actions={
          <>
            {selectedPath ? (
              <Tooltip
                label={pathEditing ? 'Done editing points' : 'Edit points'}
                placement="bottom"
              >
                <button
                  type="button"
                  aria-label={pathEditing ? 'Done editing points' : 'Edit points'}
                  aria-pressed={pathEditing}
                  disabled={showSubmitting}
                  onClick={() => setPathEditing((current) => !current)}
                  className={`${BAR_CONTROL} ${pathEditing ? 'bg-rt-primary-tint text-rt-ink' : ''}`}
                >
                  <Spline aria-hidden="true" size={15} />
                </button>
              </Tooltip>
            ) : null}
            {selectedPath && pathEditing && selectedAnchor !== null ? (
              <Tooltip
                label={
                  isSmoothAnchor(selectedPath.anchors[selectedAnchor]!)
                    ? 'Make corner'
                    : 'Make curve'
                }
                placement="bottom"
              >
                <button
                  type="button"
                  aria-label={
                    isSmoothAnchor(selectedPath.anchors[selectedAnchor]!)
                      ? 'Make corner'
                      : 'Make curve'
                  }
                  disabled={showSubmitting}
                  onClick={() =>
                    replacePath(toggleAnchorSmooth(selectedPath, selectedAnchor), selectedPath.id)
                  }
                  className={BAR_CONTROL}
                >
                  <PenTool aria-hidden="true" size={15} />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip label="Bring selection to front" placement="bottom">
              <button
                type="button"
                aria-label="Bring selection to front"
                disabled={showSubmitting}
                onClick={() => reorderSelection('front')}
                className={BAR_CONTROL}
              >
                <BringToFront aria-hidden="true" size={15} />
              </button>
            </Tooltip>
            <Tooltip label="Send selection to back" placement="bottom">
              <button
                type="button"
                aria-label="Send selection to back"
                disabled={showSubmitting}
                onClick={() => reorderSelection('back')}
                className={BAR_CONTROL}
              >
                <SendToBack aria-hidden="true" size={15} />
              </button>
            </Tooltip>
            <Tooltip label="Delete selection" placement="bottom">
              <button
                type="button"
                aria-label="Delete selection"
                disabled={showSubmitting}
                onClick={deleteSelection}
                className={BAR_CONTROL}
              >
                <Trash2 aria-hidden="true" size={15} />
              </button>
            </Tooltip>
          </>
        }
      />
    ) : null;

  // Every tool that puts something down says so under the pointer. Only ink
  // and the eraser used to, so with a shape or a pen armed the canvas looked
  // exactly as it does in Select, and a press did something the cursor had not
  // hinted at. A table or template shows it only once one is being carried —
  // until then a press does nothing, and a crosshair would promise otherwise.
  const placing =
    canvasTool === 'shape' ||
    canvasTool === 'pen' ||
    canvasTool === 'line' ||
    canvasTool === 'arrow' ||
    (canvasTool === 'table' && pendingTable !== null) ||
    (canvasTool === 'template' && pendingTemplate !== null);
  const canvasCursor = isPanning
    ? 'cursor-grabbing'
    : panReady
      ? 'cursor-grab'
      : canvasTool === 'draw' || placing
        ? 'cursor-crosshair'
        : canvasTool === 'text'
          ? 'cursor-text'
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
        aria-label={`Arrow from ${from.label || 'Unlabelled'} to ${to.label || 'Unlabelled'}`}
        tabIndex={-1}
        className="cursor-pointer"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          canvasRef.current?.focus();
          lastNodePressRef.current = null;
          // Every other kind goes too. This cleared only the nodes, so picking
          // an inherited edge left an arrow, a stroke, a path or a table still
          // lit up beside it — and a Delete would then take both. The edge key
          // is set after the clear, which nulls it.
          clearAllSelection();
          setSelectedEdgeKey(edgeKey(edge));
        }}
      >
        {/* The hit target follows the same path, so a bowed arrow is
                    grabbable where it is actually drawn. */}
        <path d={route.path} fill="none" stroke="transparent" strokeWidth={18} />
        <path
          d={route.path}
          fill="none"
          stroke={selected ? STUDIO_ACCENT : stroke}
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

  function renderArrow(arrow: ArrowElement) {
    const geometry = arrowGeometry(arrow, arrowTargetsById);
    const selected = selectedArrowIds.includes(arrow.id);
    const strokeWidth = arrowStrokeWidth(arrow);

    return (
      <g
        key={arrow.id}
        onPointerDown={(event) => {
          if (canvasTool !== 'select' || event.button !== 0) return;
          event.stopPropagation();
          canvasRef.current?.focus();
          // A second press on an arrow already selected opens its label, the
          // same gesture that types into a shape.
          const press = {
            key: arrow.id,
            time: event.timeStamp,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          if (!event.shiftKey && isDoublePress(lastArrowPressRef.current, arrow.id, press)) {
            lastArrowPressRef.current = null;
            beginArrowLabelEdit(arrow.id);
            return;
          }
          lastArrowPressRef.current = press;
          if (event.shiftKey) {
            setSelectedArrowIds((current) =>
              current.includes(arrow.id)
                ? current.filter((id) => id !== arrow.id)
                : [...current, arrow.id],
            );
            return;
          }
          if (!selected) applySelection({ ...EMPTY_STUDIO_SELECTION, arrowIds: [arrow.id] });
          beginElementMove(event, 'arrow', arrow.id);
        }}
      >
        {/* The hit target follows the route, so an arrow is grabbable where it
            is actually drawn rather than in the box around it. */}
        <path
          data-testid="studio-arrow-hit"
          d={geometry.d}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(18, strokeWidth + 12)}
        />
        <StudioArrowView
          arrow={arrow}
          geometry={geometry}
          hideLabel={editingArrowId === arrow.id}
          {...(selected
            ? { stroke: STUDIO_ACCENT, strokeWidth: Math.max(3, strokeWidth + 1) }
            : {})}
        />
        {selected && arrow.label && editingArrowId !== arrow.id ? (
          // A grab area over the label, so it can be slid along the line. Only
          // while the arrow is selected: otherwise it would swallow presses
          // meant for whatever the label happens to sit over.
          <rect
            role="button"
            aria-label="Move this arrow’s label along the line"
            {...labelGrabBox(arrow, geometry.label)}
            fill="transparent"
            style={{ cursor: 'grab' }}
            onPointerDown={(event) => beginArrowEdit(event, arrow.id, 'label')}
            // The label is the one place on this canvas where the browser's own
            // double click survives: dragging it deliberately does not capture
            // the pointer, and capture is what eats the follow-up events
            // everywhere else here.
            onDoubleClick={(event) => {
              event.stopPropagation();
              beginArrowLabelEdit(arrow.id);
            }}
          />
        ) : null}
      </g>
    );
  }

  /**
   * The area over an arrow's label that slides it along the line: the size the
   * label is drawn at, lines and all, rather than a fixed patch that missed the
   * ends of a long label and covered the line around a short one.
   */
  function labelGrabBox(arrow: ArrowElement, at: DiagramPoint) {
    const fontSize = arrowFontSize(arrow);
    const lines = arrowLabelLines(arrow.label ?? '');
    const longest = Math.max(1, ...lines.map((line) => line.length));
    const width = longest * fontSize * LABEL_GLYPH_ADVANCE + LABEL_GRAB_PADDING * 2;
    const height = Math.max(1, lines.length) * fontSize * 1.2 + LABEL_GRAB_PADDING;
    return { x: at.x - width / 2, y: at.y - height / 2, width, height };
  }

  /**
   * The grab points on a selected arrow: one per end, plus the middle leg of an
   * elbow. Only on a single selection — handles on every arrow of a group would
   * be a thicket, and none of them would mean anything to a group drag.
   */
  function renderArrowHandles(arrow: ArrowElement, geometry: ArrowGeometry) {
    const ends: { handle: 'from' | 'to' | 'bend'; point: ArrowPoint; label: string }[] = [
      { handle: 'from', point: geometry.points[0]!, label: 'Move the start of this arrow' },
      {
        handle: 'to',
        point: geometry.points[geometry.points.length - 1]!,
        label: 'Move the end of this arrow',
      },
    ];
    const bendAt = arrowRoute(arrow) === 'elbow' ? elbowHandlePoint(arrow, arrowTargetsById) : null;
    if (bendAt) ends.push({ handle: 'bend', point: bendAt, label: 'Slide this arrow’s bend' });

    // The same grip as every other point on the canvas, the same size at every
    // zoom, with a wider ring round it that also takes the press.
    return ends.map(({ handle, point, label }) => (
      <g
        key={handle}
        style={{ cursor: 'grab' }}
        onPointerDown={(event) => beginArrowEdit(event, arrow.id, handle)}
      >
        <circle cx={point.x} cy={point.y} r={CHROME.pointReach * pixel} fill="transparent" />
        <circle
          role="button"
          aria-label={label}
          cx={point.x}
          cy={point.y}
          r={CHROME.pointRadius * pixel}
          fill="#FFFFFF"
          stroke={STUDIO_ACCENT}
          strokeWidth={CHROME.gripStroke * pixel}
        />
      </g>
    ));
  }

  /**
   * A single selected arrow's grips, drawn over everything else.
   *
   * They used to be drawn with the arrow, at its place in the paint order — so
   * a shape painted later covered them, and the end handle sitting on a shape's
   * outline was half hidden under the very shape it was attached to.
   */
  function renderSelectedArrowHandles() {
    if (selectedArrowIds.length !== 1 || multiSelected || canvasTool !== 'select') return null;
    const arrow = arrows.find((candidate) => candidate.id === selectedArrowIds[0]);
    if (!arrow) return null;
    return (
      <g data-testid="arrow-handles">
        {renderArrowHandles(arrow, arrowGeometry(arrow, arrowTargetsById))}
      </g>
    );
  }

  function renderPath(path: PathElement, key?: string, isDraft = false) {
    const strokeWidth = pathStrokeWidth(path);
    const selected = !isDraft && selectedPathIds.includes(path.id);
    // Anchors are absolute scene points, so the turn is about a scene centre
    // rather than a local one — there is no translate underneath it to undo.
    const local = pathLocalBounds(path);
    const turn = local ? rotationTransform(local, path.rotation) : undefined;
    // The frame goes round what the path paints, bulges and all; the turn above
    // stays about the anchors, which is where a path has always pivoted.
    const frame = pathFrameBounds(path);

    return (
      <g key={key ?? path.id} transform={turn}>
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
                // Anchors are stored unturned but drawn turned, so the pointer
                // comes into the path's frame first — the same conversion
                // `updatePathEdit` makes, and for the same reason. Without it,
                // clicking a visible anchor on a turned path did nothing while
                // clicking bare canvas at its unturned position grabbed it.
                const hit = anchorAtPoint(path, pathPointerSpace(path, event), closeTolerance());
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
            stroke={STUDIO_ACCENT}
            strokeWidth={strokeWidth + SELECTION_HALO_GROW}
            strokeOpacity={SELECTION_HALO_OPACITY}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ) : null}
        {/* Not while the path is open for point editing: the anchors are the
            subject then, and a box round them is only clutter. */}
        {selected && !pathEditing && frame ? (
          <SelectionFrame bounds={frame} pixel={pixel} member={multiSelected} />
        ) : null}
        {selected && !pathEditing && frame && selectionSize(currentSelection()) === 1
          ? renderRotateZones('path', path.id, frame)
          : null}
        {/* Not while its points are open for editing: then a press near the
            frame is aimed at an anchor or a handle, not at the whole path. */}
        {selected &&
        !pathEditing &&
        frame &&
        selectionSize(currentSelection()) === 1 &&
        canvasTool === 'select'
          ? renderResizeChrome('path', path.id, frame, { rotation: path.rotation ?? 0 })
          : null}
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
                        stroke={STUDIO_ACCENT}
                        strokeWidth={CHROME.handleLine * pixel}
                        pointerEvents="none"
                      />
                      <circle
                        role="button"
                        aria-label={`Curve handle ${side} of point ${index + 1}`}
                        cx={handle.x}
                        cy={handle.y}
                        r={CHROME.pointReach * pixel}
                        fill="transparent"
                        className="cursor-grab"
                        onPointerDown={(event) => beginPathEdit(event, path, index, side)}
                      />
                      <circle
                        cx={handle.x}
                        cy={handle.y}
                        r={CHROME.handleDot * pixel}
                        fill={STUDIO_ACCENT}
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
                  r={CHROME.pointReach * pixel}
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
                  r={CHROME.pointRadius * pixel}
                  fill={selectedAnchor === index ? STUDIO_ACCENT : '#FFFFFF'}
                  stroke={STUDIO_ACCENT}
                  strokeWidth={CHROME.gripStroke * pixel}
                  pointerEvents="none"
                />
              </g>
            ))
          : null}
      </g>
    );
  }

  function renderTable(table: TableElement) {
    const inCells = tableEditing && selectedTableId === table.id;
    const editingHere = selectedTableId === table.id ? editingCell : null;
    // While rows are carried the range is theirs, and they are drawn lifted.
    const carrying = trackDrag?.tableId === table.id;
    return (
      <StudioTableView
        key={table.id}
        // Drawn as shown — a row growing as it is typed into — while the edit
        // itself works on the table as stored.
        table={tableAsShown(table)}
        hiddenText={editingHere}
        wash={
          inCells && heldRange && !carrying
            ? (box) =>
                isCellInRange(heldRange, box.row, box.col) ? (
                  <rect
                    key={`wash-${box.row}-${box.col}`}
                    data-testid="table-cell-selected"
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    fill={STUDIO_ACCENT_WASH}
                    pointerEvents="none"
                  />
                ) : null
            : undefined
        }
        overlay={(box) =>
          editingHere && editingHere.row === box.row && editingHere.col === box.col
            ? renderCellEditor(table, box)
            : canvasTool === 'select'
              ? renderCellTarget(table, box)
              : null
        }
      />
    );
  }

  /**
   * The press target over one cell.
   *
   * A table works the way FigJam's does. The first press takes the whole table
   * — and a drag from there moves it, from any cell. A click on a table that is
   * already selected goes inside it, to that cell; inside, a drag sweeps a block
   * of cells instead of moving anything. Two quick presses on a cell open it for
   * typing, from anywhere.
   */
  function renderCellTarget(
    table: TableElement,
    { row, col, x, y, width, height, rowSpan, colSpan, cell }: TableCellBox,
  ) {
    return (
      <rect
        key={`target-${row}-${col}`}
        role="button"
        aria-label={
          rowSpan > 1 || colSpan > 1
            ? `Merged cell rows ${row + 1}–${row + rowSpan}, columns ${col + 1}–${col + colSpan}`
            : `Cell row ${row + 1} column ${col + 1}`
        }
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
          const here = { row, col };
          const inCells = tableEditing && selectedTableId === table.id;

          // Outside the cells, shift builds a selection of whole tables rather
          // than a range of cells.
          if (event.shiftKey && !inCells) {
            toggleStudioSelection('table', table.id);
            return;
          }

          const press: NodePress = {
            key: `${table.id}:${row}:${col}`,
            time: event.timeStamp,
            clientX: event.clientX,
            clientY: event.clientY,
          };
          const isSecond = isDoublePress(lastNodePressRef.current, press.key, press);
          lastNodePressRef.current = isSecond ? null : press;
          if (isSecond) {
            enterTableCells(table.id, here);
            openCellEditor(here, cell?.text ?? '', true);
            return;
          }

          if (inCells) {
            const anchor = event.shiftKey && cellRange ? cellRange.anchor : here;
            selectCell(table, row, col, event.shiftKey);
            beginCellRangeDrag(event, table, anchor);
            return;
          }

          // Held on its own already, a click goes inside; one of several, a
          // click narrows the selection to it, as a click on a shape does.
          const alone = selectedTableId === table.id && selectionSize(currentSelection()) === 1;
          const held = selectedTableIds.includes(table.id);
          if (!held) selectTable(table.id);
          beginElementMove(event, 'table', table.id, {
            slop: travelSlop(),
            onClick: () => {
              if (alone) enterTableCells(table.id, here);
              else if (held) selectTable(table.id);
            },
          });
        }}
      />
    );
  }

  function renderCellEditor(
    table: TableElement,
    { row, col, x, y, width, height, cell }: TableCellBox,
  ) {
    const fontSize = tableCellFontSize(table, cell);
    const align = cell?.align ?? 'left';
    return (
      <foreignObject
        key={`editor-${row}-${col}`}
        x={x + 1}
        y={y + 1}
        width={Math.max(10, width - 2)}
        // As tall as the text in it. Sized to the cell, a value that
        // wrapped past one line was clipped away while it was being
        // typed and only appeared once the edit was committed.
        height={Math.max(
          height - 2,
          Math.ceil(Math.max(1, cellDraft.split('\n').length) * fontSize * INLINE_LINE_HEIGHT) + 6,
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex h-full w-full items-center"
          // The renderer wraps a cell at `colWidth - TABLE_CELL_PADDING`
          // and `wrapDiagramLabel` takes another `DIAGRAM_LABEL_PADDING`
          // off that. Matching it here stops text re-wrapping, and the
          // row growing, the instant the edit is committed.
          style={{
            padding: `0 ${(TABLE_CELL_PADDING + DIAGRAM_LABEL_PADDING - 2) / 2}px`,
          }}
        >
          <textarea
            ref={cellInputRef}
            aria-label={`Cell row ${row + 1} column ${col + 1}`}
            value={cellDraft}
            rows={Math.max(1, cellDraft.split('\n').length)}
            maxLength={TABLE_CELL_TEXT_LIMIT}
            onChange={(event) => setCellDraft(event.target.value)}
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
              // A composition in progress owns every key, Escape included.
              if (event.nativeEvent.isComposing) return;
              // Enter is a new line, as in FigJam's cells: a cell is often a
              // few lines long, and breaking one is the commonest thing typed
              // in it. The field takes the key itself.
              if (event.key === 'Enter') return;
              if (event.key === 'Escape') {
                event.preventDefault();
                // Escape finishes typing and keeps it. Nothing typed is thrown
                // away by a key; Undo is the way back.
                commitCellText(table, { row, col }, event.currentTarget.value);
                // The field is about to unmount, and its blur must not commit
                // a second time.
                cellEditCancelledRef.current = true;
                setEditingCell(null);
                canvasRef.current?.focus({ preventScroll: true });
                return;
              }
              if (event.key === 'Tab') {
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
            className={INLINE_EDITOR_CLASS}
            style={{
              fontSize: `${fontSize}px`,
              fontFamily: INLINE_FONT_FAMILY,
              fontWeight: tableCellBold(table, cell, row) ? 700 : 400,
              color: tableCellColor(cell),
              textAlign: align,
              lineHeight: INLINE_LINE_HEIGHT,
            }}
          />
        </div>
      </foreignObject>
    );
  }

  /**
   * The frame round each selected table, and, round one held on its own, its
   * grips and the controls that add rows and columns.
   *
   * Drawn after every element rather than inside the table's own place in the
   * paint order: drawn there, anything painted above the table covered the
   * very controls used to work on it. The frame sits on the table's edge like
   * every other element's; the add buttons sit outside it, so the frame no
   * longer has to be blown out to make room for them.
   */
  function renderTableSelection() {
    return tables
      .filter((table) => selectedTableIds.includes(table.id))
      .map((stored) => {
        const table = tableAsShown(stored);
        const size = tableSize(table);
        const bounds = { x: table.x, y: table.y, width: size.width, height: size.height };
        const sole = !multiSelected && canvasTool === 'select';
        const carrying = trackDrag?.tableId === table.id ? trackDrag : null;
        const inCells = tableEditing && selectedTableId === table.id;
        return (
          <g key={`table-selection-${table.id}`}>
            {/* The same frame every other kind shows, but no rotate grip: a
                turned table's cells would no longer line up with the rows and
                columns people read them by. */}
            <SelectionFrame bounds={bounds} pixel={pixel} member={multiSelected} />
            {inCells && heldRange && !carrying && !editingCell
              ? renderRangeOutline(table, heldRange)
              : null}
            {carrying ? renderCarriedTracks(table, carrying) : null}
            {sole ? renderResizeChrome('table', table.id, bounds) : null}
            {sole && !editingCell && !isSubmitting && !carrying ? (
              <TableChrome
                ref={tableChromeRef}
                table={table}
                pixel={pixel}
                disabled={showSubmitting}
                onInsert={(axis, index) => insertTableTrack(table, axis, index)}
                onResizeStart={(event, axis, track) => {
                  if (!fitOnSecondLinePress(event, table, axis, track)) {
                    beginTableResize(event, table, axis, track);
                  }
                }}
                onHandleDown={(event, axis, track) => onTableHandleDown(event, table, axis, track)}
                selectedTracks={
                  tableEditing && selectedTableId === table.id ? wholeTracks(heldRange) : null
                }
              />
            ) : null}
          </g>
        );
      });
  }

  /**
   * A border round the cells in hand, as a spreadsheet draws one: while a block
   * is being swept it shows exactly what the drag has taken so far.
   */
  function renderRangeOutline(table: TableElement, range: CellRange) {
    const rows = trackSpan(range, 'row');
    const cols = trackSpan(range, 'col');
    const colOffsets = tableColumnOffsets(table);
    const rowOffsets = tableRowOffsets(table);
    const left = colOffsets[cols.start] ?? 0;
    const top = rowOffsets[rows.start] ?? 0;
    return (
      <rect
        data-testid="table-range-outline"
        x={table.x + left}
        y={table.y + top}
        width={(colOffsets[cols.end + 1] ?? left) - left}
        height={(rowOffsets[rows.end + 1] ?? top) - top}
        rx={2 * pixel}
        fill="none"
        stroke={STUDIO_ACCENT}
        strokeWidth={2 * pixel}
        pointerEvents="none"
      />
    );
  }

  /**
   * Rows or columns being carried: the gap they will drop into, sunk into the
   * reflowed table, and the rows themselves, lifted on a shadow and following
   * the pointer along the table.
   */
  function renderCarriedTracks(table: TableElement, carrying: NonNullable<typeof trackDrag>) {
    const rows = carrying.axis === 'row';
    const offsets = rows ? tableRowOffsets(table) : tableColumnOffsets(table);
    const size = tableSize(table);
    const from = offsets[carrying.first] ?? 0;
    const to = offsets[carrying.first + carrying.count] ?? from;
    const lifted = {
      ...carrying.lifted,
      x: rows ? table.x : table.x + carrying.at,
      y: rows ? table.y + carrying.at : table.y,
    };
    const liftedSize = tableSize(lifted);
    return (
      <g pointerEvents="none">
        <rect
          data-testid="table-drop"
          x={rows ? table.x : table.x + from}
          y={rows ? table.y + from : table.y}
          width={rows ? size.width : to - from}
          height={rows ? to - from : size.height}
          fill={STUDIO_DROP_SLOT_FILL}
          stroke={STUDIO_ACCENT}
          strokeWidth={1.5 * pixel}
          strokeDasharray={chromeDash(CHROME.ghostDash, pixel)}
        />
        <g data-testid="table-drag-ghost" filter="url(#studio-lift-shadow)">
          <StudioTableView table={lifted} />
          <rect
            x={lifted.x}
            y={lifted.y}
            width={liftedSize.width}
            height={liftedSize.height}
            rx={TABLE_CORNER_RADIUS}
            fill="none"
            stroke={STUDIO_ACCENT}
            strokeWidth={2 * pixel}
          />
        </g>
      </g>
    );
  }

  function renderInk(stroke: StudioInkStroke) {
    const selected = selectedInkIds.includes(stroke.id);
    const local = inkLocalBounds(stroke);
    const turn = local ? rotationTransform(local, stroke.rotation) : undefined;
    return (
      <g key={stroke.id} transform={turn}>
        {selected ? (
          <path
            d={strokePathData(stroke.points)}
            fill="none"
            stroke={STUDIO_ACCENT}
            strokeWidth={inkStrokeWidth(stroke) + SELECTION_HALO_GROW}
            strokeOpacity={SELECTION_HALO_OPACITY}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ) : null}
        {/* The halo says which mark is selected when several overlap; the frame
            gives it the same box, and the same grip, as every other kind. */}
        {selected && local ? (
          <SelectionFrame bounds={local} pixel={pixel} member={multiSelected} />
        ) : null}
        {selected && local && selectionSize(currentSelection()) === 1
          ? renderRotateZones('ink', stroke.id, local)
          : null}
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
        {selected && local && selectionSize(currentSelection()) === 1 && canvasTool === 'select'
          ? renderResizeChrome('ink', stroke.id, local, { rotation: stroke.rotation ?? 0 })
          : null}
      </g>
    );
  }

  function renderNode(node: DiagramNode) {
    const shape = displayShape(node);
    const size = effectiveDiagramNodeSize(node);
    // New elements arrive empty so they can be typed into straight away. The
    // layout still needs a string to measure, and the hint it measures is what
    // a selected empty element shows in place of a label.
    const hasLabel = node.label.trim().length > 0;
    const labelStyle = diagramNodeLabelStyle(node, effectiveDiagramNodeSize(node).width);
    const labelLayout = diagramNodeLabelLayout({
      ...node,
      label: hasLabel ? node.label : NODE_LABEL_PLACEHOLDER,
    });
    const selected = selectedIds.includes(node.id);
    // The only thing selected, of any kind: with more, the group's frame is the
    // one that resizes, and each member's own grips would compete with it.
    const isOnlySelection = selectedId === node.id && !multiSelected;
    const isEditing = editingNodeId === node.id;
    // The editor is as tall as the text in it, even when that is taller than
    // the shape. A `foreignObject` clips, and the field inside it does not
    // scroll, so a field sized to the shape hid the start of a long label, the
    // end of it, and the caret being typed at — the opposite of what growing
    // the field was for. Overhanging the outline is correct while editing: it
    // shows what is being written before the shape truncates it.
    const editorRows = isEditing ? inlineLabelRows(node) : 1;
    const editorHeight = Math.max(
      size.height,
      Math.ceil(editorRows * diagramNodeFontSize(node) * INLINE_LINE_HEIGHT) + 8,
    );
    return (
      <g
        key={node.id}
        role="button"
        aria-label={`${DIAGRAM_SHAPE_LABELS[shape]}: ${node.label || 'Unlabelled'}`}
        aria-pressed={selected}
        tabIndex={-1}
        transform={placementTransform(node.x, node.y, size, node.rotation)}
        // With a tool armed a press here belongs to the tool, so the canvas's
        // cursor shows through rather than promising a move.
        className={canvasTool === 'select' ? 'cursor-move' : undefined}
        onPointerDown={(event) => onNodePointerDown(event, node)}
        onDoubleClick={() => beginInlineNodeEdit(node)}
      >
        {selected ? (
          <SelectionFrame
            bounds={{ x: 0, y: 0, width: size.width, height: size.height }}
            pixel={pixel}
            member={multiSelected}
          />
        ) : null}
        {dropTargetId === node.id ? (
          <SelectionFrame
            bounds={{ x: 0, y: 0, width: size.width, height: size.height }}
            pixel={pixel}
            target
            testId="container-drop-target"
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
            x={0}
            // Centred on the shape, so a field taller than its box overhangs
            // evenly rather than growing off one edge.
            y={(size.height - editorHeight) / 2}
            width={size.width}
            height={editorHeight}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {/* Centred the way the rendered label is, and the field is only as
                tall as its own text, so the two line up instead of the editor
                starting at the top of the shape. */}
            <div
              className="flex h-full w-full items-center"
              style={{ padding: `0 ${labelEditorInset(node)}px` }}
            >
              <textarea
                ref={inlineLabelInputRef}
                aria-label={`Edit ${shape} label`}
                value={node.label}
                rows={inlineLabelRows(node)}
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
                  // Mid-composition, Enter belongs to the IME: it picks the
                  // candidate. Committing here stored the raw reading instead
                  // of the word the user was choosing.
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelInlineNodeEdit();
                  } else if (event.key === 'Enter') {
                    // Shift-Enter breaks the line; plain Enter is still "done",
                    // which is what it has always meant here.
                    if (event.shiftKey) return;
                    event.preventDefault();
                    if (event.ctrlKey || event.metaKey) {
                      finishInlineNodeEdit();
                      event.currentTarget.form?.requestSubmit();
                    } else {
                      event.currentTarget.blur();
                    }
                  }
                }}
                className={INLINE_EDITOR_CLASS}
                style={inlineLabelStyle(node)}
              />
            </div>
          </foreignObject>
        ) : (
          <text
            textAnchor={labelStyle.anchor}
            fill={labelStyle.fill}
            // The hint is only offered to whoever has the element selected;
            // showing it on every empty element would read as content.
            opacity={hasLabel ? 1 : selected ? 0.35 : 0}
            style={{
              fontSize: `${labelLayout.fontSize}px`,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: labelStyle.fontWeight,
            }}
          >
            {labelLayout.lines.map((line, index) => (
              <tspan
                key={line + String(index)}
                x={labelStyle.x}
                y={labelLayout.firstBaselineY + index * labelLayout.lineHeight}
              >
                {line}
              </tspan>
            ))}
          </text>
        )}
        {/* A container does not turn, for the same reason a table does not: it
            is a group, and turning the frame without the shapes inside it reads
            as broken rather than as rotated. Turning them with it is a much
            larger feature — nested transforms, child bounds, arrow re-routing —
            and not one this offers. Leaving it out also means the drop test and
            the inside-the-container clamp keep the axis-aligned box they both
            assume. */}
        {isOnlySelection && !isEditing && !diagramCanParent(node.shape)
          ? renderRotateZones('node', node.id, {
              x: 0,
              y: 0,
              width: size.width,
              height: size.height,
            })
          : null}
        {isOnlySelection && !isEditing
          ? renderResizeChrome(
              'node',
              node.id,
              { x: 0, y: 0, width: size.width, height: size.height },
              { rotation: node.rotation ?? 0, widthOnly: node.shape === 'text' },
            )
          : null}
      </g>
    );
  }

  return (
    <form
      id={formId}
      // Not clipped on a wide screen: this box starts at the header's lower
      // edge, and the bar's panels open upward — so anything that had to reach
      // past the top of the canvas was cut off here and looked like it was
      // behind the header. The dialog around it still stops the page scrolling.
      // The narrow layout stacks and does need to scroll.
      className="grid min-h-0 flex-1 grid-rows-[minmax(300px,1fr)_auto] overflow-y-auto bg-rt-surface-sunken md:grid-rows-[minmax(0,1fr)_auto] md:overflow-visible"
      onKeyDown={onFormKeyDown}
      onPaste={onFormPaste}
      onCopy={onFormCopy}
      onSubmit={(event) => void onSubmit(event)}
    >
      <section ref={canvasFrameRef} className="relative min-h-0">
        {/* Top centre, not top right: the navigation cluster owns that corner,
            and this banner used to sit underneath it at the same offset and z,
            which put the zoom controls on top of the only thing telling you
            whose diagram you were about to extend. */}
        {extensionSource ? (
          <div
            role="status"
            className="rt-studio-rise pointer-events-none absolute top-3 left-1/2 z-20 flex max-w-[min(88%,28rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-rt-secondary bg-rt-surface px-3.5 py-1.5 text-[12px] text-rt-secondary-deep shadow-[0_6px_24px_rgba(8,12,21,0.14)] sm:top-4"
          >
            <GitBranch aria-hidden="true" size={13} className="shrink-0 text-rt-secondary" />
            <span className="min-w-0">
              {isReusing
                ? 'Reusing your diagram'
                : isExtendingOwn
                  ? 'Extending your diagram'
                  : `Extending ${extensionSource.authorName}'s diagram`}
            </span>
            {unchangedExtension ? (
              <>
                <span aria-hidden="true" className="text-rt-secondary-deep/50">
                  ·
                </span>
                <span className="min-w-0 text-rt-secondary-deep/80">{EXTEND_UNCHANGED_HINT}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {containerAwaitingDelete ? renderContainerDeletePrompt() : null}

        {renderExtendHandles()}
        {renderExtendPicker()}
        {renderArrowEndPicker()}

        {propertiesBar}

        <StudioToolRail
          tool={canvasTool}
          onToolChange={selectCanvasTool}
          disabled={showSubmitting}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((current) => !current)}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((current) => !current)}
          freehandOptions={renderFreehandOptions}
          shapeOptions={renderShapeOptions}
          penOptions={renderPenOptions}
          tableOptions={renderTableOptions}
          templateOptions={renderTemplateOptions}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={undoDiagram}
          onRedo={redoDiagram}
          canClear={canvasHasContent}
          onClear={clearCanvas}
        />

        {/* Navigation and help, top right: out of the way of the tools on the
            left and of the docked strip along the bottom of a small screen. */}
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 select-none sm:top-4 sm:right-4">
          <div className="rt-studio-rise pointer-events-auto flex items-center gap-0.5 rounded-xl border border-rt-tertiary bg-rt-surface p-1 shadow-[0_6px_24px_rgba(8,12,21,0.14)]">
            {(
              [
                ['Zoom out', ZoomOut, () => zoomStep('out'), zoomPercent <= DIAGRAM_MIN_ZOOM * 100],
                ['Zoom in', ZoomIn, () => zoomStep('in'), zoomPercent >= DIAGRAM_MAX_ZOOM * 100],
                ['Reset view', RotateCcw, resetView, isDefaultDiagramView(view)],
              ] as const
            ).map(([label, Icon, onClick, isDisabled]) => (
              <Tooltip key={label} label={label} placement="bottom">
                <button
                  type="button"
                  aria-label={label}
                  disabled={isDisabled}
                  onClick={onClick}
                  className={CHROME_ROUND_BUTTON}
                >
                  <Icon aria-hidden="true" size={14} />
                </button>
              </Tooltip>
            ))}
          </div>

          {/* Round, and on its own: help is not one of the tools. */}
          <span className={`relative inline-flex ${shortcutSheetOpen ? STUDIO_LAYER.open : ''}`}>
            <Tooltip label="Keyboard shortcuts" shortcut="?" placement="bottom">
              <button
                ref={shortcutTriggerRef}
                type="button"
                aria-label="Keyboard shortcuts"
                aria-expanded={shortcutSheetOpen}
                onClick={() => setShortcutSheetOpen((current) => !current)}
                className="rt-studio-rise pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-rt-tertiary bg-rt-surface text-[12px] font-semibold text-rt-ink-muted shadow-[0_6px_24px_rgba(8,12,21,0.14)] transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary-deep focus-visible:outline-none max-sm:h-10 max-sm:w-10"
              >
                ?
              </button>
            </Tooltip>
            <StudioShortcutSheet
              open={shortcutSheetOpen}
              onClose={() => setShortcutSheetOpen(false)}
              triggerRef={shortcutTriggerRef}
            />
          </span>
        </div>

        <svg
          ref={canvasRef}
          role="application"
          aria-label="Studio canvas"
          tabIndex={0}
          viewBox={diagramViewBoxAttribute(renderedView)}
          // Edge to edge. The sheet keeps its own proportions inside — SVG
          // scales the view to fit and centres the remainder, which is why every
          // conversion between screen and scene goes through `diagramSurfaceFit`.
          // No browser outline, whatever brought focus here. Every press on the
          // canvas focuses it so its keys work, and the browser outlined the
          // whole canvas in black each time it did.
          className={`h-full w-full touch-none bg-white outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rt-secondary-deep ${canvasCursor}`}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onPointerLeave={() => {
            setGhostCursor(null);
            updateExtendProximity(null, null);
            tableChromeRef.current?.updatePointer(null);
          }}
          onLostPointerCapture={onLostPointerCapture}
          onKeyDown={onCanvasKeyDown}
          onKeyUp={onCanvasKeyUp}
          onBlur={() => setPanReady(false)}
          onDragOver={onCanvasDragOver}
          onDragLeave={onCanvasDragLeave}
          onDrop={onCanvasDrop}
        >
          <defs>
            {/* The shadow a lifted row or column casts while it is carried. */}
            <filter id="studio-lift-shadow" x="-10%" y="-40%" width="120%" height="180%">
              <feDropShadow
                dx={0}
                dy={3 * pixel}
                stdDeviation={5 * pixel}
                floodColor="#080C15"
                floodOpacity={0.2}
              />
            </filter>
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
              <path d="M0,0 L8,4 L0,8 Z" fill={STUDIO_ACCENT} />
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
          {/* Everything outside the sheet is off the drawing surface, so it is
              painted as surround rather than as more canvas. */}
          <rect
            aria-hidden="true"
            x={renderedView.x}
            y={renderedView.y}
            width={renderedView.width}
            height={renderedView.height}
            fill="#EEF2F4"
          />
          <rect
            aria-hidden="true"
            data-testid="diagram-sheet"
            x={0}
            y={0}
            width={DIAGRAM_CANVAS_WIDTH}
            height={DIAGRAM_CANVAS_HEIGHT}
            fill="#FFFFFF"
            stroke="#C6D2D7"
            strokeWidth={1}
          />

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
              edges, nodes and ink cannot be drawn in three fixed layers.

              Deaf to the pointer unless the select tool is armed: a press with
              the pen or the brush is the start of a mark, not a change of
              selection, wherever on the board it happens to land. */}
          <g pointerEvents={canvasTool === 'select' ? undefined : 'none'}>
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
              if (ref.kind === 'arrow') {
                const arrow = arrowById.get(ref.key);
                return arrow ? renderArrow(arrow) : null;
              }
              const node = nodeById.get(ref.key);
              return node ? renderNode(node) : null;
            })}
          </g>

          {/* The arrow being drawn, and what its ends would bind to. Outside the
              ordered pass because it is not part of the artifact yet. */}
          {editingArrow
            ? (() => {
                const geometry = arrowGeometry(editingArrow, arrowTargetsById);
                // Typed at the size it will be stored at, so a first label
                // does not jump when the edit is committed.
                const fontSize = arrowFontSize(withNewLabelSize(editingArrow));
                // Sized from the text being typed, not from the stored label:
                // reading the stored one left the box the size it was when the
                // editor opened, so a line added with Shift-Enter was clipped
                // by `overflow-hidden` until the edit was committed.
                const lines = arrowLabelLines(arrowLabelDraft);
                const longest = lines.reduce((most, line) => Math.max(most, line.length), 1);
                const width = Math.max(120, longest * fontSize * 0.62 + 16);
                const height = Math.max(24, lines.length * fontSize * INLINE_LINE_HEIGHT + 8);
                return (
                  <foreignObject
                    x={geometry.label.x - width / 2}
                    y={geometry.label.y - height / 2}
                    width={width}
                    height={height}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex h-full w-full items-center justify-center">
                      <textarea
                        ref={arrowLabelInputRef}
                        aria-label="Arrow label"
                        autoFocus
                        // Selects what is there, the way the shape editor does.
                        // Without it, reopening a label left the caret where it
                        // fell and typing appended to text the user meant to
                        // replace — in a field that looks identical to one that
                        // behaves the other way.
                        onFocus={(event) => event.currentTarget.select()}
                        value={arrowLabelDraft}
                        rows={lines.length}
                        maxLength={ARROW_LABEL_LIMIT}
                        onChange={(event) => setArrowLabelDraft(event.target.value)}
                        onBlur={(event) => {
                          // Escape already threw this edit away; the blur that
                          // its own unmount fires must not put it back.
                          if (arrowLabelCancelledRef.current) {
                            arrowLabelCancelledRef.current = false;
                            return;
                          }
                          commitArrowLabel(editingArrow.id, event.target.value);
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          // Mid-composition Enter belongs to the IME: it picks a
                          // candidate, and committing here would store the raw
                          // reading instead of the word.
                          if (event.nativeEvent.isComposing) return;
                          // An arrow label only ever breaks where it is asked to,
                          // so Shift-Enter is the one thing that adds a line.
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            commitArrowLabel(editingArrow.id, event.currentTarget.value);
                          }
                          // Escape abandons the edit and keeps what was there.
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            arrowLabelCancelledRef.current = true;
                            setEditingArrowId(null);
                          }
                        }}
                        className={INLINE_EDITOR_CLASS}
                        style={{
                          fontSize: `${fontSize}px`,
                          fontFamily: INLINE_FONT_FAMILY,
                          fontWeight: editingArrow.labelBold ? 700 : 400,
                          color: editingArrow.labelColor
                            ? DIAGRAM_STROKE_COLORS[editingArrow.labelColor]
                            : DIAGRAM_LABEL_INK,
                          textAlign: 'center',
                          lineHeight: INLINE_LINE_HEIGHT,
                        }}
                      />
                    </div>
                  </foreignObject>
                );
              })()
            : null}

          {arrowDraft ? (
            <g data-testid="arrow-draft" opacity={0.85}>
              {(() => {
                // Drawn out of a shape, it lands plain, like any connection;
                // drawn with the arrow tool, it lands in the pen's style.
                const style = extendPressRef.current?.dragging
                  ? {}
                  : {
                      strokeColor: pathColor,
                      strokeWidthPreset: pathWidth,
                      strokeStyle: pathStyle,
                    };
                const drafted = draftArrow(arrowDraft, style);
                return (
                  <StudioArrowView
                    arrow={drafted}
                    geometry={arrowGeometry(drafted, arrowTargetsById)}
                  />
                );
              })()}
            </g>
          ) : null}
          {arrowSnap ? (
            <>
              {/* The element a release will bind to, outlined the way a
                  container is when something is about to be dropped into it —
                  the dot alone said where, not what. */}
              {(() => {
                const target = arrowSnap.elementId
                  ? arrowTargetMap.get(arrowSnap.elementId)
                  : undefined;
                if (!target) return null;
                const { box, rotation } = target;
                const turn = rotation
                  ? `rotate(${rotation} ${box.x + box.width / 2} ${box.y + box.height / 2})`
                  : undefined;
                return (
                  <g transform={turn}>
                    <SelectionFrame bounds={box} pixel={pixel} target testId="arrow-snap-target" />
                  </g>
                );
              })()}
              <circle
                data-testid="arrow-snap"
                cx={arrowSnap.point.x}
                cy={arrowSnap.point.y}
                r={CHROME.pointRadius * pixel}
                fill={STUDIO_ACCENT}
                stroke="#FFFFFF"
                strokeWidth={CHROME.gripStroke * pixel}
                pointerEvents="none"
              />
            </>
          ) : null}

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
                              r={CHROME.pointReach * pixel}
                              fill="none"
                              stroke={STUDIO_ACCENT}
                              strokeWidth={CHROME.targetStroke * pixel}
                              pointerEvents="none"
                            />
                          ) : null}
                          <circle
                            cx={anchor.x}
                            cy={anchor.y}
                            r={(closing ? CHROME.pointRadius + 1 : CHROME.pointRadius) * pixel}
                            fill={index === 0 ? STUDIO_ACCENT : '#FFFFFF'}
                            stroke={STUDIO_ACCENT}
                            strokeWidth={CHROME.gripStroke * pixel}
                            pointerEvents="none"
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })()
            : null}

          {ghost ? (
            <>
              {/* Over everything, so a press lands what is being carried
                  wherever the ghost is — including on top of a shape or a
                  table, which keep their own labels for their own double-press. */}
              <rect
                aria-hidden="true"
                x={renderedView.x}
                y={renderedView.y}
                width={renderedView.width}
                height={renderedView.height}
                fill="transparent"
              />
              {/* A drag-out has no cursor ghost to follow — the rectangle being
                  dragged is the preview — so either is reason to draw one. */}
              {ghostCursor || shapeDragRect ? (
                <g
                  aria-hidden="true"
                  data-testid="placement-ghost"
                  pointerEvents="none"
                  transform={`translate(${ghostAt.x}, ${ghostAt.y})`}
                  opacity={CHROME.ghostOpacity}
                >
                  {/* Every preview of something about to be placed is the same
                      dashed outline in the same colour: a shape's own outline
                      where it has one, the footprint where it does not. Drafts
                      being drawn — a stroke, a path, an arrow — show their real
                      style instead, because they are the thing itself. */}
                  {ghost.kind === 'node' && ghost.shape !== 'text' ? (
                    <DiagramShapeOutline
                      shape={ghost.shape}
                      size={ghost.size}
                      fill="none"
                      stroke={STUDIO_COOL}
                      strokeWidth={CHROME.ghostStroke * pixel}
                      containerDashArray={LEGACY_CONTAINER_DASH}
                      strokeDasharray={chromeDash(CHROME.ghostDash, pixel)}
                    />
                  ) : (
                    // Text, a table and a starter frame have no single outline
                    // of their own, so the ghost draws the footprint instead —
                    // square, as a table and a text box are.
                    <rect
                      width={ghost.size.width}
                      height={ghost.size.height}
                      fill="none"
                      stroke={STUDIO_COOL}
                      strokeWidth={CHROME.ghostStroke * pixel}
                      strokeDasharray={chromeDash(CHROME.ghostDash, pixel)}
                    />
                  )}
                  {ghost.kind === 'template' ? (
                    // The template itself, faint, from the footprint's corner.
                    <g
                      data-testid="template-ghost"
                      transform={`translate(${-ghost.origin.x}, ${-ghost.origin.y})`}
                    >
                      <StudioSceneContent scene={ghost.scene} />
                    </g>
                  ) : null}
                  {ghost.kind === 'table'
                    ? [
                        ...Array.from({ length: ghost.cols - 1 }, (_, index) => (
                          <line
                            key={`v${index}`}
                            x1={(index + 1) * newTableColWidth(ghost.cols)}
                            y1={0}
                            x2={(index + 1) * newTableColWidth(ghost.cols)}
                            y2={ghost.size.height}
                            stroke={STUDIO_COOL}
                            strokeWidth={pixel}
                            strokeDasharray={chromeDash(CHROME.ghostDash, pixel)}
                          />
                        )),
                        ...Array.from({ length: ghost.rows - 1 }, (_, index) => (
                          <line
                            key={`h${index}`}
                            x1={0}
                            y1={(index + 1) * TABLE_DEFAULT_ROW_HEIGHT}
                            x2={ghost.size.width}
                            y2={(index + 1) * TABLE_DEFAULT_ROW_HEIGHT}
                            stroke={STUDIO_COOL}
                            strokeWidth={pixel}
                            strokeDasharray={chromeDash(CHROME.ghostDash, pixel)}
                          />
                        )),
                      ]
                    : null}
                  {ghost.kind === 'node' && ghost.shape === 'text'
                    ? (() => {
                        // Laid out exactly as the placed box will be, so the
                        // preview's text is the size the typing will be.
                        const layout = diagramNodeLabelLayout({
                          label: NODE_LABEL_PLACEHOLDER,
                          shape: 'text',
                          width: ghost.size.width,
                          height: ghost.size.height,
                          fontSizePreset: DIAGRAM_NEW_NODE_FONT_SIZE,
                        });
                        return (
                          <text
                            x={ghost.size.width / 2}
                            y={layout.firstBaselineY}
                            textAnchor="middle"
                            fill={DIAGRAM_LABEL_INK}
                            style={{
                              fontSize: `${layout.fontSize}px`,
                              fontWeight: 600,
                              fontFamily: 'Inter, system-ui, sans-serif',
                            }}
                          >
                            {NODE_LABEL_PLACEHOLDER}
                          </text>
                        );
                      })()
                    : null}
                </g>
              ) : null}
            </>
          ) : null}

          {renderSelectedArrowHandles()}
          {renderTableSelection()}
          {renderGroupFrame()}

          {marqueeRect ? (
            <rect
              aria-hidden="true"
              data-testid="selection-marquee"
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill={STUDIO_ACCENT_WASH}
              stroke={STUDIO_ACCENT}
              strokeWidth={CHROME.marqueeStroke * pixel}
              strokeDasharray={chromeDash(CHROME.marqueeDash, pixel)}
              pointerEvents="none"
            />
          ) : null}
        </svg>
      </section>

      <StudioActions
        error={error}
        footerClassName="sticky bottom-0 z-10 col-span-full flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary bg-rt-surface px-4 py-3 shadow-[0_-4px_16px_rgba(8,12,21,0.06)] sm:px-6 md:static md:shadow-none"
        summary={
          <>
            {nodes.length} {nodes.length === 1 ? 'element' : 'elements'} ·{' '}
            {/* Both kinds together: a connection between two shapes and a
                standalone arrow are one thing to whoever drew them, whatever
                the artifact calls each. */}
            {edges.length + arrows.length} {edges.length + arrows.length === 1 ? 'arrow' : 'arrows'}
            {ink.length > 0 ? ` · ${ink.length} ${ink.length === 1 ? 'stroke' : 'strokes'}` : ''}
            {paths.length > 0 ? ` · ${paths.length} ${paths.length === 1 ? 'path' : 'paths'}` : ''}
            {tables.length > 0
              ? ` · ${tables.length} ${tables.length === 1 ? 'table' : 'tables'}`
              : ''}
          </>
        }
      >
        <StudioProposeButton
          form={formId}
          disabled={!isLive || unchangedExtension}
          submitting={isSubmitting}
          sending={showSubmitting}
          editing={editSource !== null}
          title={
            !isLive
              ? `Reconnect before ${editSource ? 'updating' : 'proposing'}`
              : unchangedExtension
                ? EXTEND_UNCHANGED_HINT
                : `${editSource ? 'Update proposal' : 'Propose diagram'} (Ctrl+Enter)`
          }
        />
      </StudioActions>
    </form>
  );
}
