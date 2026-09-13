import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowDownFromLine,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  Columns3,
  Circle,
  Database,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Diamond,
  DropletOff,
  Eraser,
  Grid2x2,
  Link2,
  LoaderCircle,
  LayoutTemplate,
  CornerDownRight,
  Minus,
  MoveRight,
  MoveHorizontal,
  PaintBucket,
  Pencil,
  PenTool,
  RotateCcw,
  RectangleHorizontal,
  Rows3,
  Send,
  BringToFront,
  SendToBack,
  SquareDashed,
  Spline,
  Squircle,
  Trash2,
  Triangle,
  Type,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type {
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
  arrowGeometry,
  arrowLabelSide,
  arrowRoute,
  arrowStartCap,
  offsetArrow,
  arrowStrokeWidth,
  DIAGRAM_FILL_COLORS,
  DIAGRAM_FONT_SIZE_PRESETS,
  DIAGRAM_TEXT_ALIGNS,
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
  diagramNodeLabelStyle,
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
  tableRowCount,
  tableColumnOffsets,
  tableRowOffsets,
  tableSize,
  tableStrokeColor,
  tableStrokeWidth,
  TABLE_DEFAULT_COL_WIDTH,
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
import { IconButton } from '../../../components/ui/IconButton';
import { DIAGRAM_NODE_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import {
  DIAGRAM_CANVAS_HEIGHT,
  DIAGRAM_CANVAS_WIDTH,
  DIAGRAM_EDGE_LABEL_LIMIT,
  DIAGRAM_GRID,
  DIAGRAM_LABEL_LIMIT,
  DIAGRAM_NODE_SHAPES,
  DIAGRAM_SHAPE_LABELS,
  placeNodePosition,
  DIAGRAM_SHAPE_PALETTE_ORDER,
  DIAGRAM_SHAPE_MEDIA_TYPE,
  addEdge,
  addNode,
  clampNodesInsideContainer,
  clearEdgeStyle,
  clientPointToDiagramPoint,
  containerAtPoint,
  deleteContainerWithContents,
  deleteEdge,
  deleteNodesWithEdges,
  edgeKey,
  draggedSelectionRoots,
  moveNodesBy,
  diagramRectToClientRect,
  nodeBounds,
  normalizeRect,
  pasteDiagramFragment,
  prepareDiagram,
  prepareEdgeLabel,
  prepareNodeLabel,
  renameEdge,
  renameNode,
  reparentNodes,
  snapToGrid,
  resizeNode,
  styleEdge,
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
  expandViewToAspect,
  diagramViewZoom,
  isDefaultDiagramView,
  panDiagramView,
  zoomDiagramView,
  type DiagramView,
} from './diagramView';
import { layoutDiagram, type DiagramLayoutDirection } from './diagramLayout';
import { useDiagramHistory } from './useDiagramHistory';
import { StudioPropertiesBar } from '../studio/toolbar/StudioPropertiesBar';
import { STUDIO_LAYER } from '../studio/studioLayers';
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
  copyStudioFragment,
  isFragmentEmpty,
  pasteStudioFragment,
  type StudioFragment,
} from '../studio/studioClipboard';
import { offsetRect, snapDragToGrid, unionBounds } from '../studio/studioSnapping';
import {
  arrowBoundsIn,
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
  cellsInRange,
  clampCellRef,
  wholeTableRange,
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
  arrowSnapToleranceForView,
  bendForPointer,
  draftArrow,
  elbowHandlePoint,
  finishArrow,
  snapArrowPoint,
  type ArrowDraft,
  type ArrowSnap,
} from '../studio/studioArrowDraft';
import { arrowTargets } from '../studio/studioArrowTargets';
import { StudioArrowView } from '../studio/StudioArrowView';
import { toolForShortcut } from '../studio/studioShortcuts';
import { STUDIO_TEMPLATES, type StudioTemplate } from '../studio/studioTemplates';

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

const SHAPE_ICONS: Record<DiagramNodeShape, LucideIcon> = {
  box: Squircle,
  rectangle: RectangleHorizontal,
  ellipse: Circle,
  diamond: Diamond,
  triangle: Triangle,
  cylinder: Database,
  container: SquareDashed,
  text: Type,
};

/**
 * The colours a sub-toolbar offers. The contract's palette is unchanged and
 * larger — this is the short list the popovers show, so a tool strip can be one
 * narrow column. Each list leads with the neutral (black ink, and the fill that
 * goes with it) because that is the one people reach for without thinking.
 */
const QUICK_STROKE_KEYS = ['ink', 'blue', 'green', 'amber', 'rose', 'violet'] as const;
const QUICK_FILL_KEYS = ['surface', 'blue', 'green', 'amber', 'rose', 'violet'] as const;

/**
 * The fill that belongs to each line colour. A closed path is filled with its
 * own stroke colour rather than a separately chosen one, so the fill control is
 * a yes/no rather than a second palette.
 */
const FILL_FOR_STROKE: Record<DiagramStrokeKey, DiagramFillKey> = {
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

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  matrix: Grid2x2,
  // Lanes run across the board and a retro's headings run down it.
  lanes: Rows3,
  retro: Columns3,
  timeline: MoveHorizontal,
};

/**
 * A sub-toolbar control, deliberately a size below the rail's 36px. The panel is
 * a detail of the tool that opened it, and a column of full-size buttons reads
 * as a second toolbar instead. Swatches are smaller again: a colour needs less
 * room to be recognised than a glyph does.
 */
const SUBTOOL_SIZE = 'h-7 w-7';
const SUBTOOL_SWATCH_SIZE = 'h-5 w-5';

const TILE_BUTTON = `flex ${SUBTOOL_SIZE} items-center justify-center rounded-lg border border-rt-tertiary bg-rt-surface text-rt-ink-muted transition-colors hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45`;
const TILE_ACTIVE = 'border-rt-primary bg-rt-primary-tint text-rt-ink';

const CELL_ALIGN_ICONS: Record<TableCellAlign, LucideIcon> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
};

const CHROME_ROUND_BUTTON =
  'flex h-6 w-6 items-center justify-center rounded-full text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-9 max-sm:w-9';

const BAR_CONTROL =
  'flex h-8 w-8 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-lg border border-transparent text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45';

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
  onClear,
  clearName,
}: {
  /** Singular, for each swatch's own name ("rose ink"). */
  itemName: string;
  row?: boolean;
  keys: readonly K[];
  colorFor: (key: K) => string;
  activeKey: K | null;
  disabled?: boolean;
  onSelect: (key: K) => void;
  /** Offered where "none" is a real answer — a shape can have no fill at all. */
  onClear?: () => void;
  clearName?: string;
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
      {onClear ? (
        <IconButton label={clearName ?? 'None'} className={SUBTOOL_SIZE} onClick={onClear}>
          <X aria-hidden="true" size={13} />
        </IconButton>
      ) : null}
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
  | { kind: 'template'; size: DiagramNodeSize };

function emptyTableSize({ rows, cols }: { rows: number; cols: number }): DiagramNodeSize {
  return { width: cols * TABLE_DEFAULT_COL_WIDTH, height: rows * TABLE_DEFAULT_ROW_HEIGHT };
}

/** A starter frame's footprint, so its ghost is the shape it will occupy. */
function templateSize(template: StudioTemplate): DiagramNodeSize {
  const bounds = templateBounds(template);
  return { width: bounds.width, height: bounds.height };
}

function templateBounds(template: StudioTemplate) {
  const nodes = template.build().nodes;
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + effectiveDiagramNodeSize(node).width));
  const bottom = Math.max(...nodes.map((node) => node.y + effectiveDiagramNodeSize(node).height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

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
  xlarge: 'XL',
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
      className={`${SUBTOOL_SWATCH_SIZE} shrink-0 rounded-full border-2 transition-shadow disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none ${
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
  /** What the button shows — an icon wherever one can carry the meaning. */
  label: ReactNode;
  /** Accessible name; the icon alone does not identify the control. */
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
      className={`flex ${SUBTOOL_SIZE} shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none ${
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
    draftScope,
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
  if (!initialSnapshotRef.current) {
    // A kept draft is what was last on this canvas, so it wins over the source
    // it was started from — the source is already in it.
    const draft = readStudioDraft(draftStorage, draftKeyScope);
    const from = draft ?? sourceArtifact;
    initialSnapshotRef.current = {
      nodes: (from?.nodes ?? []).map((node) => ({ ...node })),
      edges: (from?.edges ?? []).map((edge) => ({ ...edge })),
      // Prefilling only the shapes would quietly drop half the artifact, which
      // is as true of a restored draft as of an extended canvas.
      ...(from?.ink?.length ? { ink: dataToInk(from.ink) } : {}),
      ...(from?.paths?.length ? { paths: from.paths.map((path) => ({ ...path })) } : {}),
      ...(from?.tables?.length ? { tables: from.tables.map((table) => ({ ...table })) } : {}),
      ...(from?.arrows?.length ? { arrows: from.arrows.map((arrow) => ({ ...arrow })) } : {}),
      ...(from?.z?.length ? { z: [...from.z] } : {}),
    };
  }
  const history = useDiagramHistory(initialSnapshotRef.current);
  const { nodes, edges } = history.snapshot;
  const ink = history.snapshot.ink ?? [];
  const paths = history.snapshot.paths ?? [];
  const arrows = history.snapshot.arrows ?? [];
  const paintOrder = studioPaintOrder(history.snapshot);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [connectionPointer, setConnectionPointer] = useState<DiagramPoint | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  // Where the element being placed would land. Following the cursor lets it be
  // positioned before it exists, rather than dropped somewhere and dragged.
  const [ghostCursor, setGhostCursor] = useState<DiagramPoint | null>(null);
  // Which of the two arrow tiles is armed, and the arrow being drawn. The draft
  // is the whole of the placement state: a press sets `from`, the pointer sets
  // `to`, and the second press turns it into an element.
  const [pendingArrowRoute, setPendingArrowRoute] = useState<ArrowRoute>('straight');
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
  const [selectedArrowIds, setSelectedArrowIds] = useState<string[]>([]);
  // Which arrow's label is open for typing. An arrow has no inside to type in,
  // so its label is edited in a field floated over the middle of the line.
  const [editingArrowId, setEditingArrowId] = useState<string | null>(null);
  const arrowLabelInputRef = useRef<HTMLInputElement>(null);
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
  } | null>(null);
  // Table creation size, and which cell of which table is in hand.
  // Which insertion point on a table the pointer is over. Rows and columns are
  // added on the table itself rather than from a menu, so this is what decides
  // where the one visible "+" sits.
  const [tableInsert, setTableInsert] = useState<{
    tableId: string;
    axis: 'row' | 'col';
    index: number;
    /** A boundary adds; a row or column body takes that one away. */
    action: 'insert' | 'remove';
  } | null>(null);
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
  // The box the floating toolbars are positioned inside; the canvas is centred
  // within it, so the two do not share an origin.
  const canvasFrameRef = useRef<HTMLElement>(null);
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
  // The shape of the surface, watched rather than assumed: the canvas fills the
  // window, so it changes with the window.
  const [canvasAspect, setCanvasAspect] = useState(DIAGRAM_CANVAS_WIDTH / DIAGRAM_CANVAS_HEIGHT);
  // What is actually drawn. Wider or taller than the view being manipulated, by
  // exactly the difference between the view's shape and the surface's, so the
  // space around the sheet is visible instead of letterboxed away.
  const renderedView = expandViewToAspect(view, canvasAspect);
  const renderedViewRef = useRef(renderedView);
  renderedViewRef.current = renderedView;

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
  const arrowById = new Map(arrows.map((arrow) => [arrow.id, arrow]));
  const selectedArrow = selectedArrowId ? (arrowById.get(selectedArrowId) ?? null) : null;
  const editingArrow = editingArrowId ? (arrowById.get(editingArrowId) ?? null) : null;
  // Bound endpoints are resolved against the whole canvas, so an arrow follows
  // whatever it points at as that element is moved, resized or reshaped. Built
  // once and read two ways: by id when drawing, and swept when snapping.
  const arrowTargetMap = arrowTargets({ nodes, ink, paths, tables });
  const arrowTargetsById: ArrowTargetLookup = (id) => arrowTargetMap.get(id);
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
  // The ghost sits exactly where the element will, so what is previewed is what
  // gets placed rather than something near it.
  // What is being carried, if anything. Everything placed by pressing the canvas
  // is previewed the same way, so the answer to "where will this land" is always
  // the thing under the cursor.
  const ghost = ((): Ghost | null => {
    if (canvasTool === 'text')
      return { kind: 'node', shape: 'text', size: diagramNodeSize('text') };
    if (canvasTool === 'shape') {
      return { kind: 'node', shape: pendingShape, size: diagramNodeSize(pendingShape) };
    }
    if (canvasTool === 'table' && pendingTable) {
      return { kind: 'table', ...pendingTable, size: emptyTableSize(pendingTable) };
    }
    if (canvasTool === 'template' && pendingTemplate) {
      return { kind: 'template', size: templateSize(pendingTemplate) };
    }
    return null;
  })();
  const ghostAt =
    ghost && ghostCursor
      ? placeNodePosition(centredOnCursor(ghostCursor, ghost.size), ghost.size, snapEnabled)
      : { x: 0, y: 0 };

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
  useEffect(() => {
    // An arrow has no ghost — its preview is the rubber band itself — but
    // Escape has to put it down all the same.
    if (!ghost && canvasTool !== 'arrow') return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      // Not while something is being typed into: Escape belongs to the field.
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      cancelPlacement();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

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
  function placeTextElement(at: DiagramPoint) {
    clearError();
    const before = history.snapshotRef.current;
    const result = addNode(
      before.nodes,
      'text',
      centredOnCursor(at, diagramNodeSize('text')),
      snapEnabled,
    );
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
    // Naming the arrow is the obvious next thing, and its field lives behind the
    // bar's More button — so joining two elements opens that panel itself.
    setOpenBarMenu('Arrow');
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
      nodes: graph.nodes.map((node) =>
        nodeIds.has(node.id)
          ? withFill({
              ...node,
              ...strokeKeys,
              ...(style.fontSizePreset ? { fontSizePreset: style.fontSizePreset } : {}),
              ...(style.labelBold === undefined ? {} : { labelBold: style.labelBold }),
              ...(style.labelColor ? { labelColor: style.labelColor } : {}),
              ...(style.labelAlign ? { labelAlign: style.labelAlign } : {}),
            })
          : node,
      ),
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
        // A table has no fill of its own — it is a grid of cells — so filling
        // one means filling all of them.
        if (style.fillColor === undefined) return styled;
        return fillCellRange(styled, wholeTableRange(styled), style.fillColor);
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
    setEditingArrowId(arrowId);
  }

  function commitArrowLabel(arrowId: string, text: string) {
    const graph = history.snapshotRef.current;
    const trimmed = text.trim().slice(0, ARROW_LABEL_LIMIT);
    history.commit({
      nodes: graph.nodes,
      edges: graph.edges,
      arrows: (graph.arrows ?? []).map((arrow) => {
        if (arrow.id !== arrowId) return arrow;
        const next = { ...arrow };
        // An empty label is no label: stored as an absent key, the way every
        // other optional field on this contract is.
        if (trimmed === '') delete next.label;
        else next.label = trimmed;
        return next;
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
            disabled={isSubmitting}
            label={property.label}
            icon={<PaintBucket aria-hidden="true" size={15} />}
          >
            {(close) => (
              <ColorChoices
                row
                itemName="fill"
                keys={QUICK_FILL_KEYS}
                colorFor={(key) => DIAGRAM_FILL_COLORS[key]}
                activeKey={
                  selectedNode?.fillColor ??
                  selectedPath?.fillColor ??
                  (selectedTable ? (tableCellAt(selectedTable, 0, 0)?.fill ?? null) : null)
                }
                disabled={isSubmitting}
                onSelect={(key) => {
                  applySelectionStyle({ fillColor: key });
                  close();
                }}
                onClear={() => {
                  applySelectionStyle({ fillColor: null });
                  close();
                }}
                clearName="No fill"
              />
            )}
          </BarMenu>
        );

      case 'cellFill':
        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={isSubmitting}
            label={property.label}
            icon={<PaintBucket aria-hidden="true" size={15} />}
          >
            {(close) => (
              <ColorChoices
                row
                itemName="cell fill"
                keys={QUICK_FILL_KEYS}
                colorFor={(key) => DIAGRAM_FILL_COLORS[key]}
                activeKey={null}
                disabled={isSubmitting}
                onSelect={(key) => {
                  if (selectedTable && cellRange) {
                    replaceTable(fillCellRange(selectedTable, cellRange, key), selectedTable.id);
                  }
                  close();
                }}
                onClear={() => {
                  if (selectedTable && cellRange) {
                    replaceTable(fillCellRange(selectedTable, cellRange, null), selectedTable.id);
                  }
                  close();
                }}
                clearName="No cell fill"
              />
            )}
          </BarMenu>
        );

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
            disabled={isSubmitting}
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
                keys={QUICK_STROKE_KEYS}
                colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
                activeKey={selectedNode?.strokeColor ?? selectedPath?.strokeColor ?? null}
                disabled={isSubmitting}
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
            disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                        disabled={isSubmitting}
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

      case 'addText':
        return (
          <Tooltip label={property.label} placement="bottom">
            <button
              type="button"
              aria-label={property.label}
              disabled={isSubmitting}
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
            disabled={isSubmitting}
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
                    disabled={isSubmitting}
                    onClick={() => {
                      applyArrowSetting({ [end]: cap });
                      close();
                    }}
                    className={`${TILE_BUTTON} ${current === cap ? TILE_ACTIVE : ''}`}
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
            disabled={isSubmitting}
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
                    disabled={isSubmitting}
                    onClick={() => {
                      applyArrowSetting({ route: value });
                      close();
                    }}
                    className={`${TILE_BUTTON} ${current === value ? TILE_ACTIVE : ''}`}
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
          ? (cellRange ?? wholeTableRange(selectedTable))
          : null;

        /** Whether every cell the change would touch is already bold. */
        const cellsAllBold =
          selectedTable && cellStyleTarget
            ? cellsInRange(cellStyleTarget).every(
                (ref) => tableCellAt(selectedTable, ref.row, ref.col)?.bold,
              )
            : false;

        function styleCells(style: Parameters<typeof styleCellRange>[2]) {
          if (!selectedTable || !cellStyleTarget) return;
          replaceTable(styleCellRange(selectedTable, cellStyleTarget, style), selectedTable.id);
        }

        const bold = selectedTable
          ? cellsAllBold
          : Boolean(selectedNode?.labelBold ?? selectedArrow?.labelBold);
        const align: DiagramTextAlign = selectedTable
          ? (tableCellAt(
              selectedTable,
              cellStyleTarget?.focus.row ?? 0,
              cellStyleTarget?.focus.col ?? 0,
            )?.align ?? 'center')
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
        const size: DiagramFontSizePreset = selectedTable
          ? (tableCellAt(
              selectedTable,
              cellStyleTarget?.focus.row ?? 0,
              cellStyleTarget?.focus.col ?? 0,
            )?.fontSizePreset ?? 'medium')
          : (selectedNode?.fontSizePreset ?? selectedArrow?.fontSizePreset ?? 'medium');

        return (
          <BarMenu
            openMenu={openBarMenu}
            onOpenChange={setOpenBarMenu}
            disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                    disabled={isSubmitting}
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
                        disabled={isSubmitting}
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
                          disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
        cellsHaveText:
          inCellMode && cellRange
            ? cellsInRange(cellRange).some((ref) =>
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
    return diagramRectToClientRect(
      { x: left, y: top, width: right - left, height: bottom - top },
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

  function zoomBy(factor: number) {
    setView((current) => zoomDiagramView(current, factor));
  }

  function resetView() {
    setView(DIAGRAM_DEFAULT_VIEW);
  }

  function onNodePointerDown(event: PointerEvent<SVGGElement>, node: DiagramNode) {
    if (event.button !== 0 || dragRef.current || isSubmitting) return;
    // A press with a tool armed belongs to the tool. Left unhandled rather than
    // swallowed, so it reaches the canvas and starts the mark it was meant to.
    if (canvasTool !== 'select' && !connectionMode) return;
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
    const fragment = template.build();
    // Laid out at absolute positions. Dropped somewhere, the frame moves as a
    // whole to land its top-left there; without a point it takes the canvas as
    // designed, stepped clear of anything already on it.
    const bounds = templateBounds(template);
    const offset = at
      ? { x: at.x - bounds.x, y: at.y - bounds.y }
      : graph.nodes.length === 0 && graph.edges.length === 0
        ? { x: 0, y: 0 }
        : DIAGRAM_PASTE_OFFSET;

    const pasted = pasteDiagramFragment(graph.nodes, graph.edges, fragment, offset, snapEnabled);
    if (!pasted.ok) {
      setValidationError(pasted.error);
      return;
    }

    history.commit({ nodes: pasted.nodes, edges: pasted.edges });
    setCanvasTool('select');
    setPendingTemplate(null);
    setGhostCursor(null);
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
    return PATH_CLOSE_TOLERANCE / diagramViewZoom(renderedViewRef.current);
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
    commitPaths([...(graph.paths ?? []), path], paintOrderWithNewestOnTop(graph, path.id));

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
      arrowIds: selectedArrowIds,
    };
  }

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
    if (session.moved) history.recordPreview(session.previous);
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

  /** Picks a table up; the press that follows says where it goes. */
  function pickUpTable(rows: number, cols: number) {
    setPendingTable({ rows, cols });
    selectCanvasTool('table');
  }

  function placeTable(at: DiagramPoint, rows = tableRows, cols = tableCols) {
    clearError();
    const table = createTable(rows, cols, at);
    const graph = history.snapshotRef.current;
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
    kind: 'path' | 'table' | 'ink' | 'node' | 'arrow',
    id: string,
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
    setCanvasTool(next);
    if (next !== 'select') {
      clearAllSelection();
      cancelConnection();
    }
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
              disabled={isSubmitting}
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
              disabled={isSubmitting || canvasTool === 'erase'}
              onSelect={() => setInkWidth(preset)}
            />
          ))}
        </ToolStripGroup>

        <ColorChoices
          itemName="ink"
          keys={QUICK_STROKE_KEYS}
          colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
          activeKey={inkColor}
          disabled={isSubmitting || canvasTool === 'erase'}
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
              onSelect={() => setFilled(true)}
            />
            <PresetButton
              label={<DropletOff aria-hidden="true" size={14} />}
              name="Leave the shape transparent"
              active={!filled}
              disabled={isSubmitting}
              onSelect={() => setFilled(false)}
            />
          </ToolStripGroup>
        ) : null}

        <ColorChoices
          itemName="line"
          keys={QUICK_STROKE_KEYS}
          colorFor={(key) => DIAGRAM_STROKE_COLORS[key]}
          activeKey={selectedPath ? (selectedPath.strokeColor ?? null) : pathColor}
          disabled={isSubmitting}
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

  function renderShapeOptions(close: () => void) {
    const disabled = nodes.length >= DIAGRAM_NODE_LIMIT || isSubmitting;
    return (
      <div role="group" aria-label="Elements" className="flex flex-col items-center gap-1">
        {DIAGRAM_SHAPE_PALETTE_ORDER.map((shape) => {
          const ShapeIcon = SHAPE_ICONS[shape];
          return (
            <button
              key={shape}
              type="button"
              draggable={!disabled}
              onDragStart={(event) => {
                event.dataTransfer.setData(DIAGRAM_SHAPE_MEDIA_TYPE, shape);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => {
                setPendingShape(shape);
                selectCanvasTool('shape');
                close();
              }}
              disabled={disabled}
              aria-label={`Add ${DIAGRAM_SHAPE_LABELS[shape].toLowerCase()}`}
              title={`Pick it up, then press the canvas to place it — or drag it there`}
              className={TILE_BUTTON}
            >
              <ShapeIcon aria-hidden="true" size={14} />
            </button>
          );
        })}
        {/* A line makes a form, so it belongs with the shapes — but unlike them
            it is a tool you draw with, not a node you place. */}
        <button
          type="button"
          aria-label="Line"
          aria-pressed={canvasTool === 'line'}
          disabled={isSubmitting}
          onClick={() => {
            selectCanvasTool('line');
            close();
          }}
          title="Draw a straight line; hold Shift to constrain the angle"
          className={`${TILE_BUTTON} ${canvasTool === 'line' ? TILE_ACTIVE : ''}`}
        >
          <Minus aria-hidden="true" size={14} />
        </button>
        {/* Arrows sit under the line for the same reason the line sits with the
            shapes: they are drawn rather than placed, but they make a form. */}
        {(
          [
            ['straight', 'Arrow', MoveRight],
            ['elbow', 'Elbowed arrow', CornerDownRight],
          ] as const
        ).map(([route, arrowLabel, ArrowIcon]) => (
          <button
            key={route}
            type="button"
            aria-label={arrowLabel}
            aria-pressed={canvasTool === 'arrow' && pendingArrowRoute === route}
            disabled={isSubmitting}
            onClick={() => {
              setPendingArrowRoute(route);
              setArrowDraft(null);
              selectCanvasTool('arrow');
              close();
            }}
            title={
              route === 'straight'
                ? 'Press where the arrow starts, then drag to where it ends'
                : 'The same, bent into right angles on the way'
            }
            className={`${TILE_BUTTON} ${
              canvasTool === 'arrow' && pendingArrowRoute === route ? TILE_ACTIVE : ''
            }`}
          >
            <ArrowIcon aria-hidden="true" size={14} />
          </button>
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
   * Everything the selection can be done to that is not a styling property:
   * its label, its size, the arrows out of it, the rows and columns inside
   * it. These used to fill a permanent sidebar; they belong to whatever is
   * selected, so they now live behind the properties bar's own button and the
   * canvas keeps the width.
   */
  /** A table's structure: the rows and columns themselves, and their fill. */
  /** An arrow's own settings, including the one thing it cannot be given on the
   * canvas: a label. */
  function renderEdgeDetails() {
    return (
      <div className="max-h-[70vh] w-64 overflow-y-auto">
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
      </div>
    );
  }

  /**
   * The question asked before a container is deleted. Floating over the canvas
   * rather than tucked into a panel: it is a question, and one that has to be
   * answered before anything else happens.
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

  function renderArrangeOptions(close: () => void) {
    return (
      <div className="w-40">
        <PopoverSection label="Flow">
          <div className="flex gap-1">
            {LAYOUT_DIRECTIONS.map(({ direction, label, Icon }) => (
              <PresetButton
                key={direction}
                label={<Icon aria-hidden="true" size={15} />}
                name={label}
                active={layoutDirection === direction}
                disabled={isSubmitting}
                onSelect={() => setLayoutDirection(direction)}
              />
            ))}
          </div>
        </PopoverSection>
        <Button
          variant="secondary"
          className="w-full"
          // Distinct from the rail button that opens this panel, which is also
          // called Arrange: one opens the choices, this one acts on them.
          aria-label="Arrange the diagram"
          disabled={nodes.length < 2 || isSubmitting}
          title="Lay the diagram out along its arrows"
          onClick={() => {
            clearError();
            const graph = history.snapshotRef.current;
            history.commit({
              nodes: layoutDiagram(graph.nodes, graph.edges, layoutDirection),
              edges: graph.edges,
            });
            close();
          }}
        >
          Arrange
        </Button>
      </div>
    );
  }

  function renderTemplateOptions(close: () => void) {
    return (
      <div role="group" aria-label="Start from" className="flex flex-col gap-1">
        {STUDIO_TEMPLATES.map((template) => {
          const TemplateIcon = TEMPLATE_ICONS[template.id] ?? LayoutTemplate;
          return (
            <button
              key={template.id}
              type="button"
              title={template.hint}
              disabled={isSubmitting}
              onClick={() => {
                setPendingTemplate(template);
                selectCanvasTool('template');
                close();
              }}
              aria-label={template.label}
              className="flex w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-rt-tertiary bg-rt-surface px-1 py-1.5 text-[10px] font-semibold text-rt-ink-muted transition-colors hover:border-rt-primary hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            >
              <TemplateIcon aria-hidden="true" size={14} className="shrink-0" />
              {template.label}
            </button>
          );
        })}
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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const next = bounds.width / bounds.height;
      setCanvasAspect((current) => (Math.abs(current - next) < 1e-3 ? current : next));
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
   * Throws the canvas away, as opposed to leaving it for later.
   *
   * Closing the studio keeps everything, so this is the only way out that
   * destroys anything — which is why it is the only one that asks.
   */
  function discardCanvas() {
    if (history.isDirty && !window.confirm('Discard this canvas?')) return;
    clearStudioDraft(draftStorage, draftKeyScope);
    closeTool();
  }

  /** Puts down whatever is being carried, without placing it. */
  function cancelPlacement() {
    setPendingTable(null);
    setPendingTemplate(null);
    setGhostCursor(null);
    setArrowDraft(null);
    setArrowSnap(null);
    arrowPressRef.current = null;
    setCanvasTool('select');
  }

  function setArrowDraft(next: ArrowDraft | null) {
    arrowDraftRef.current = next;
    setArrowDraftState(next);
  }

  /** Scene units, so the catchment is the same size on screen at any zoom. */
  function arrowSnapTolerance() {
    return arrowSnapToleranceForView(renderedViewRef.current, surfaceBounds());
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
   * Put the drafted arrow on the canvas and go back to select.
   *
   * Same rule as every other element placed from the rail: the tool is for one
   * arrow, and what anyone wants immediately afterwards is to move or restyle
   * the thing they just made.
   */
  function placeArrow(draft: ArrowDraft) {
    const arrow = finishArrow(draft, {
      strokeColor: pathColor,
      strokeWidthPreset: pathWidth,
      strokeStyle: pathStyle,
    });
    if (!arrow) return false;

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
    setCanvasTool('select');
    applySelection({ ...EMPTY_STUDIO_SELECTION, arrowIds: [arrow.id] });
    return true;
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

    if (connectionMode) {
      setSelectedIds([]);
      setSelectedEdgeKey(null);
      return;
    }

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

    if (canvasTool === 'text') {
      event.preventDefault();
      clearAllSelection();
      placeTextElement(surfacePoint(event));
      return;
    }

    if (canvasTool === 'shape') {
      event.preventDefault();
      clearAllSelection();
      const size = diagramNodeSize(pendingShape);
      addElement(pendingShape, centredOnCursor(surfacePoint(event), size));
      setGhostCursor(null);
      return;
    }

    if (canvasTool === 'table') {
      // Arming the tool is not enough — a press only lands a table once a size
      // has been picked up, so a stray click on the canvas does nothing.
      if (!pendingTable) return;
      clearTableSelection();
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
      applyTemplate(pendingTemplate, centredOnCursor(surfacePoint(event), size));
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
        x: ((event.clientX - pan.startClient.x) / bounds.width) * pan.startRendered.width,
        y: ((event.clientY - pan.startClient.y) / bounds.height) * pan.startRendered.height,
      }),
    );
    return true;
  }

  function onCanvasPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (updateArrowEdit(event)) return;

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

    if (canvasTool === 'text' || canvasTool === 'shape' || canvasTool === 'template') {
      setGhostCursor(surfacePoint(event));
      return;
    }
    if (canvasTool === 'table' && pendingTable) {
      setGhostCursor(surfacePoint(event));
      return;
    }
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
    if (endArrowEdit(event)) return;

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
    const arrowGoing = new Set(selectedArrowIds);

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
      arrows: (graph.arrows ?? []).map((arrow) =>
        arrowGoing.has(arrow.id) ? offsetArrow(arrow, offset.x, offset.y) : arrow,
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

    if (event.key === '?' && !editingNodeId && !editingCell) {
      event.preventDefault();
      setShortcutSheetOpen(true);
      return;
    }

    // Tool shortcuts, before the table's own typing: `toolForShortcut` is what
    // decides which of the two a plain letter means, and it declines whenever
    // the canvas is busy with something the letter belongs to.
    const shortcutTool = toolForShortcut(event.key, {
      editingText: editingNodeId !== null || editingCell !== null,
      inCellMode: Boolean(selectedTable && cellRange),
      submitting: isSubmitting,
      drawing: pathAnchorsRef.current.length > 0,
      modifier: event.ctrlKey || event.metaKey || event.altKey,
    });
    if (shortcutTool) {
      event.preventDefault();
      if (shortcutTool === 'shape') setPendingShape('box');
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
          arrowIds: (graph.arrows ?? []).map((arrow) => arrow.id),
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
      graph.arrows ?? [],
    );
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }

    setValidationError(null);
    const sent = await submitArtifact(prepared.artifact);
    // The work is on the board now, so the copy held against losing it is done.
    if (sent) clearStudioDraft(draftStorage, draftKeyScope);
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
    barTargets.length > 0 && barSelectionRect && canvasTool === 'select' && !editingNodeId ? (
      <StudioPropertiesBar
        properties={barProperties}
        renderControl={renderPropertyControl}
        selection={barSelectionRect}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  onClick={() =>
                    replacePath(toggleAnchorSmooth(selectedPath, selectedAnchor), selectedPath.id)
                  }
                  className={BAR_CONTROL}
                >
                  <PenTool aria-hidden="true" size={15} />
                </button>
              </Tooltip>
            ) : null}
            {selectedNode && selectedIds.length === 1 ? (
              <Tooltip label="Connect" placement="bottom">
                <button
                  type="button"
                  aria-label="Connect"
                  aria-pressed={connectionMode}
                  disabled={isSubmitting}
                  onClick={() => (connectionMode ? cancelConnection() : startConnection())}
                  className={`${BAR_CONTROL} ${connectionMode ? 'bg-rt-primary-tint text-rt-ink' : ''}`}
                >
                  <Link2 aria-hidden="true" size={15} />
                </button>
              </Tooltip>
            ) : null}
            <Tooltip label="Bring selection to front" placement="bottom">
              <button
                type="button"
                aria-label="Bring selection to front"
                disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
                onClick={deleteSelection}
                className={BAR_CONTROL}
              >
                <Trash2 aria-hidden="true" size={15} />
              </button>
            </Tooltip>
            {selectedEdge ? (
              <BarMenu
                openMenu={openBarMenu}
                onOpenChange={setOpenBarMenu}
                disabled={isSubmitting}
                label="Arrow"
                icon={<Link2 aria-hidden="true" size={15} />}
              >
                {() => renderEdgeDetails()}
              </BarMenu>
            ) : null}
          </>
        }
      />
    ) : null;

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
        aria-label={`Arrow from ${from.label || 'Unlabelled'} to ${to.label || 'Unlabelled'}`}
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
          cancelConnection();
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
          {...(selected
            ? { stroke: SELECTION_ACCENT, strokeWidth: Math.max(3, strokeWidth + 1) }
            : {})}
        />
        {selected && selectedArrowIds.length === 1 ? renderArrowHandles(arrow, geometry) : null}
        {selected && arrow.label && editingArrowId !== arrow.id ? (
          // A grab area over the label, so it can be slid along the line. Only
          // while the arrow is selected: otherwise it would swallow presses
          // meant for whatever the label happens to sit over.
          <rect
            role="button"
            aria-label="Move this arrow’s label along the line"
            x={geometry.label.x - 26}
            y={geometry.label.y - 9}
            width={52}
            height={18}
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

    return ends.map(({ handle, point, label }) => (
      <circle
        key={handle}
        role="button"
        aria-label={label}
        cx={point.x}
        cy={point.y}
        r={5}
        fill="#FFFFFF"
        stroke={SELECTION_ACCENT}
        strokeWidth={2}
        style={{ cursor: 'grab' }}
        onPointerDown={(event) => beginArrowEdit(event, arrow.id, handle)}
      />
    ));
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

        {canvasTool === 'select' ? renderTableInserts(table, size, colOffsets, rowOffsets) : null}

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

  /**
   * Where a row or a column can be added or taken away, on the table itself.
   *
   * A boundary adds — rows reached from the left edge, columns from the top,
   * and the last of each from the bottom and right edges, which is where "one
   * more" belongs. The body of a row or column takes that one away.
   *
   * Each is a real control rather than something the pointer conjures: the
   * target is always there and always named, and hovering only draws the badge
   * on it. A control that exists only under the pointer cannot be reached any
   * other way, which would put every one of these out of reach of a keyboard.
   *
   * This replaces a menu of Row-below / Column-right buttons. A menu cannot say
   * *where*, so it could only act on the last row or on whichever cell happened
   * to be selected.
   */
  function renderTableInserts(
    table: TableElement,
    size: DiagramNodeSize,
    colOffsets: number[],
    rowOffsets: number[],
  ) {
    const rows = tableRowCount(table);
    const cols = tableColCount(table);
    const REACH = 14;

    function control(
      key: string,
      action: 'insert' | 'remove',
      axis: 'row' | 'col',
      index: number,
      name: string,
      zone: { x: number; y: number; width: number; height: number },
      badge: DiagramPoint,
    ) {
      const showing =
        tableInsert !== null &&
        tableInsert.tableId === table.id &&
        tableInsert.axis === axis &&
        tableInsert.index === index &&
        tableInsert.action === action;

      return (
        <g
          key={key}
          role="button"
          aria-label={name}
          style={{ cursor: 'pointer' }}
          onPointerEnter={() => setTableInsert({ tableId: table.id, axis, index, action })}
          onPointerLeave={() =>
            setTableInsert((current) =>
              current &&
              current.tableId === table.id &&
              current.axis === axis &&
              current.index === index &&
              current.action === action
                ? null
                : current,
            )
          }
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            event.preventDefault();
            clearError();
            const next =
              action === 'insert'
                ? axis === 'row'
                  ? insertRow(table, index)
                  : insertColumn(table, index)
                : axis === 'row'
                  ? deleteRow(table, index)
                  : deleteColumn(table, index);
            replaceTable(next, table.id);
            // What was selected may not exist any more, so the range comes back
            // inside whatever the table now is.
            if (action === 'remove' && cellRange) {
              const clamped = clampCellRef(next, cellRange.focus);
              setCellRange({ anchor: clamped, focus: clamped });
            }
            setTableInsert(null);
          }}
        >
          <rect {...zone} fill="transparent" />
          {showing ? (
            <>
              <circle
                cx={badge.x}
                cy={badge.y}
                r={7}
                fill={action === 'insert' ? SELECTION_ACCENT : '#8A5B14'}
                pointerEvents="none"
              />
              <path
                d={
                  action === 'insert'
                    ? `M ${badge.x - 3.5} ${badge.y} L ${badge.x + 3.5} ${badge.y} M ${badge.x} ${badge.y - 3.5} L ${badge.x} ${badge.y + 3.5}`
                    : `M ${badge.x - 3.5} ${badge.y} L ${badge.x + 3.5} ${badge.y}`
                }
                stroke="#FFFFFF"
                strokeWidth={1.6}
                strokeLinecap="round"
                pointerEvents="none"
              />
            </>
          ) : null}
        </g>
      );
    }

    const controls: ReactNode[] = [];

    for (let index = 0; index <= rows; index += 1) {
      const y = rowOffsets[index] ?? size.height;
      const last = index === rows;
      controls.push(
        control(
          `row-add-${index}`,
          'insert',
          'row',
          index,
          last ? 'Add a row' : `Insert a row above row ${index + 1}`,
          last
            ? { x: 0, y: size.height, width: size.width, height: REACH }
            : { x: -REACH, y: y - REACH / 2, width: REACH, height: REACH },
          last ? { x: size.width / 2, y: size.height + REACH / 2 } : { x: -REACH / 2, y },
        ),
      );

      // The body of the row, between its two boundaries. A table has to keep a
      // row, so the last one cannot be taken away.
      if (last || rows <= 1) continue;
      const height = (rowOffsets[index + 1] ?? size.height) - y;
      if (height <= REACH) continue;
      controls.push(
        control(
          `row-remove-${index}`,
          'remove',
          'row',
          index,
          `Delete row ${index + 1}`,
          { x: -REACH, y: y + REACH / 2, width: REACH, height: height - REACH },
          { x: -REACH / 2, y: y + height / 2 },
        ),
      );
    }

    for (let index = 0; index <= cols; index += 1) {
      const x = colOffsets[index] ?? size.width;
      const last = index === cols;
      controls.push(
        control(
          `col-add-${index}`,
          'insert',
          'col',
          index,
          last ? 'Add a column' : `Insert a column left of column ${index + 1}`,
          last
            ? { x: size.width, y: 0, width: REACH, height: size.height }
            : { x: x - REACH / 2, y: -REACH, width: REACH, height: REACH },
          last ? { x: size.width + REACH / 2, y: size.height / 2 } : { x, y: -REACH / 2 },
        ),
      );

      if (last || cols <= 1) continue;
      const width = (colOffsets[index + 1] ?? size.width) - x;
      if (width <= REACH) continue;
      controls.push(
        control(
          `col-remove-${index}`,
          'remove',
          'col',
          index,
          `Delete column ${index + 1}`,
          { x: x + REACH / 2, y: -REACH, width: width - REACH, height: REACH },
          { x: x + width / 2, y: -REACH / 2 },
        ),
      );
    }

    return <>{controls}</>;
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
            // The ring fades up rather than snapping on, so a selection that
            // changes under the cursor is followed rather than noticed.
            className="rt-studio-fade"
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
      // Not clipped on a wide screen: this box starts at the header's lower
      // edge, and the bar's panels open upward — so anything that had to reach
      // past the top of the canvas was cut off here and looked like it was
      // behind the header. The dialog around it still stops the page scrolling.
      // The narrow layout stacks and does need to scroll.
      className="grid min-h-0 flex-1 grid-rows-[minmax(300px,1fr)_auto] overflow-y-auto bg-rt-surface-sunken md:grid-rows-[minmax(0,1fr)_auto] md:overflow-visible"
      onKeyDown={onFormKeyDown}
      onSubmit={(event) => void onSubmit(event)}
    >
      <section ref={canvasFrameRef} className="relative min-h-0">
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex flex-col items-end gap-1 sm:top-4 sm:right-4">
          {extensionSource ? (
            <div className="mb-4 border-l-2 border-rt-secondary bg-rt-secondary-wash px-3 py-2 text-[12px] text-rt-secondary-deep">
              Extending {extensionSource.authorName}&apos;s diagram
            </div>
          ) : null}
        </div>

        {containerAwaitingDelete ? renderContainerDeletePrompt() : null}

        {connectionMode ? (
          <p
            role="status"
            className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-rt-secondary bg-rt-secondary-wash px-3 py-1.5 text-[12px] text-rt-secondary-deep"
          >
            {connectionSourceId
              ? `Choose a destination for ${
                  selectedNodeById(nodes, connectionSourceId)?.label || 'this element'
                }.`
              : 'Choose the element the arrow starts from.'}
          </p>
        ) : null}

        {propertiesBar}

        <StudioToolRail
          tool={canvasTool}
          onToolChange={selectCanvasTool}
          disabled={isSubmitting}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((current) => !current)}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((current) => !current)}
          freehandOptions={renderFreehandOptions}
          shapeOptions={renderShapeOptions}
          penOptions={renderPenOptions}
          tableOptions={renderTableOptions}
          templateOptions={renderTemplateOptions}
          arrangeOptions={renderArrangeOptions}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={undoDiagram}
          onRedo={redoDiagram}
        />

        {/* Navigation and help, top right: out of the way of the tools on the
            left and of the docked strip along the bottom of a small screen. */}
        <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 select-none sm:top-4 sm:right-4">
          <div className="rt-studio-rise pointer-events-auto flex items-center gap-0.5 rounded-full border border-rt-tertiary bg-rt-surface p-0.5 shadow-[0_4px_18px_rgba(8,12,21,0.12)]">
            {(
              [
                ['Zoom out', ZoomOut, () => zoomBy(1 / DIAGRAM_ZOOM_STEP), zoomPercent <= 100],
                ['Zoom in', ZoomIn, () => zoomBy(DIAGRAM_ZOOM_STEP), zoomPercent >= 400],
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
                className="rt-studio-rise pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-rt-tertiary bg-rt-surface text-[12px] font-semibold text-rt-ink-muted shadow-[0_4px_18px_rgba(8,12,21,0.12)] transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none max-sm:h-10 max-sm:w-10"
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
          className={`h-full w-full touch-none bg-white select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rt-primary focus-visible:outline-none ${canvasCursor}`}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onPointerLeave={() => setGhostCursor(null)}
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
                const width = 140;
                const height = 24;
                return (
                  <foreignObject
                    x={geometry.label.x - width / 2}
                    y={geometry.label.y - height / 2}
                    width={width}
                    height={height}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="flex h-full w-full items-center">
                      <input
                        ref={arrowLabelInputRef}
                        aria-label="Arrow label"
                        autoFocus
                        defaultValue={editingArrow.label ?? ''}
                        maxLength={ARROW_LABEL_LIMIT}
                        onBlur={(event) => commitArrowLabel(editingArrow.id, event.target.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') {
                            commitArrowLabel(editingArrow.id, event.currentTarget.value);
                          }
                          // Escape abandons the edit and keeps what was there.
                          if (event.key === 'Escape') setEditingArrowId(null);
                        }}
                        className="w-full rounded border border-rt-cool bg-rt-surface px-1 text-center text-[11px] text-rt-ink outline-none"
                      />
                    </div>
                  </foreignObject>
                );
              })()
            : null}

          {arrowDraft ? (
            <g data-testid="arrow-draft" opacity={0.85}>
              <StudioArrowView
                arrow={draftArrow(arrowDraft, {
                  strokeColor: pathColor,
                  strokeWidthPreset: pathWidth,
                  strokeStyle: pathStyle,
                })}
                geometry={arrowGeometry(
                  draftArrow(arrowDraft, {
                    strokeColor: pathColor,
                    strokeWidthPreset: pathWidth,
                    strokeStyle: pathStyle,
                  }),
                  arrowTargetsById,
                )}
              />
            </g>
          ) : null}
          {arrowSnap ? (
            <circle
              data-testid="arrow-snap"
              cx={arrowSnap.point.x}
              cy={arrowSnap.point.y}
              r={4}
              fill={SELECTION_ACCENT}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              pointerEvents="none"
            />
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
              {ghostCursor ? (
                <g
                  aria-hidden="true"
                  data-testid="placement-ghost"
                  pointerEvents="none"
                  transform={`translate(${ghostAt.x}, ${ghostAt.y})`}
                  opacity={0.55}
                >
                  {ghost.kind === 'node' && ghost.shape !== 'text' ? (
                    <DiagramShapeOutline
                      shape={ghost.shape}
                      size={ghost.size}
                      fill="none"
                      stroke="#4D6A74"
                      strokeWidth={1.5}
                      containerDashArray={LEGACY_CONTAINER_DASH}
                    />
                  ) : (
                    // Text, a table and a starter frame have no single outline
                    // of their own, so the ghost draws the footprint instead.
                    <rect
                      width={ghost.size.width}
                      height={ghost.size.height}
                      rx={4}
                      fill="none"
                      stroke="#4D6A74"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  {ghost.kind === 'table'
                    ? [
                        ...Array.from({ length: ghost.cols - 1 }, (_, index) => (
                          <line
                            key={`v${index}`}
                            x1={(index + 1) * TABLE_DEFAULT_COL_WIDTH}
                            y1={0}
                            x2={(index + 1) * TABLE_DEFAULT_COL_WIDTH}
                            y2={ghost.size.height}
                            stroke="#4D6A74"
                            strokeWidth={1}
                            strokeDasharray="4 3"
                          />
                        )),
                        ...Array.from({ length: ghost.rows - 1 }, (_, index) => (
                          <line
                            key={`h${index}`}
                            x1={0}
                            y1={(index + 1) * TABLE_DEFAULT_ROW_HEIGHT}
                            x2={ghost.size.width}
                            y2={(index + 1) * TABLE_DEFAULT_ROW_HEIGHT}
                            stroke="#4D6A74"
                            strokeWidth={1}
                            strokeDasharray="4 3"
                          />
                        )),
                      ]
                    : null}
                  {ghost.kind === 'node' && ghost.shape === 'text' ? (
                    <text
                      x={ghost.size.width / 2}
                      y={ghost.size.height / 2 + 4}
                      textAnchor="middle"
                      fill={DIAGRAM_LABEL_INK}
                      style={{ fontSize: '11px', fontFamily: 'Inter, system-ui, sans-serif' }}
                    >
                      {NODE_LABEL_PLACEHOLDER}
                    </text>
                  ) : null}
                </g>
              ) : null}
            </>
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
              {nodes.length} {nodes.length === 1 ? 'element' : 'elements'} ·{' '}
              {/* Both kinds together: a connection between two shapes and a
                  standalone arrow are one thing to whoever drew them, whatever
                  the artifact calls each. */}
              {edges.length + arrows.length}{' '}
              {edges.length + arrows.length === 1 ? 'arrow' : 'arrows'}
              {ink.length > 0 ? ` · ${ink.length} ${ink.length === 1 ? 'stroke' : 'strokes'}` : ''}
              {paths.length > 0
                ? ` · ${paths.length} ${paths.length === 1 ? 'path' : 'paths'}`
                : ''}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={discardCanvas}>
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
