import { useRef, useState, type ReactNode } from 'react';
import {
  Grid3x3,
  LayoutTemplate,
  Magnet,
  MousePointer2,
  PenTool,
  Pencil,
  Redo2,
  Shapes,
  Table,
  Type,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

import { Popover } from '../../../../components/ui/Popover';
import { Tooltip } from '../../../../components/ui/Tooltip';

/**
 * What a press on empty canvas does. Mirrors the editor's own `CanvasTool`;
 * kept structural rather than imported so the rail stays a dumb component that
 * can be rendered and tested on its own.
 */
export type RailTool = 'select' | 'draw' | 'erase' | 'pen' | 'line' | 'table';

/** Which rail button a tool lights up. Erase lives inside Freehand. */
type RailSlot = 'select' | 'freehand' | 'pen' | 'shapes' | 'text' | 'table' | 'templates';

const SLOT_FOR_TOOL: Record<RailTool, RailSlot> = {
  select: 'select',
  draw: 'freehand',
  erase: 'freehand',
  pen: 'pen',
  // The line tool is drawn from the shapes group: it makes a form, like they do.
  line: 'shapes',
  table: 'table',
};

interface StudioToolRailProps {
  tool: RailTool;
  onToolChange: (tool: RailTool) => void;
  disabled?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  /** Contents of each sub-toolbar, supplied by the editor. */
  freehandOptions: ReactNode;
  shapeOptions: ReactNode;
  penOptions: ReactNode;
  tableOptions: ReactNode;
  templateOptions: ReactNode;
  /** Places a text element; text is reached often enough for its own button. */
  onAddText: () => void;
}

const RAIL_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45';
const RAIL_ACTIVE = 'border-rt-primary bg-rt-primary-tint text-rt-ink';
const RAIL_IDLE =
  'border-transparent bg-transparent text-rt-ink-muted hover:bg-rt-primary-tint hover:text-rt-ink';

function RailGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={label}
      className="flex flex-col gap-1 rounded-xl border border-rt-tertiary bg-rt-surface p-1 shadow-[0_4px_18px_rgba(8,12,21,0.12)]"
    >
      {children}
    </div>
  );
}

/** A rail button that opens a sub-toolbar as well as selecting its tool. */
function RailMenuButton({
  label,
  shortcut,
  Icon,
  active,
  disabled,
  open,
  onOpenChange,
  onActivate,
  children,
}: {
  label: string;
  shortcut?: string;
  Icon: LucideIcon;
  active: boolean;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex">
      <Tooltip label={label} shortcut={shortcut}>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-pressed={active}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            onActivate?.();
            onOpenChange(!open);
          }}
          className={`${RAIL_BUTTON} ${active ? RAIL_ACTIVE : RAIL_IDLE}`}
        >
          <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
      </Tooltip>
      <Popover
        open={open}
        onClose={() => onOpenChange(false)}
        label={`${label} options`}
        width="w-56"
        triggerRef={triggerRef}
      >
        {children}
      </Popover>
    </span>
  );
}

/** A rail button that only selects its tool. */
function RailButton({
  label,
  shortcut,
  Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  Icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        {...(active === undefined ? {} : { 'aria-pressed': active })}
        disabled={disabled}
        onClick={onClick}
        className={`${RAIL_BUTTON} ${active ? RAIL_ACTIVE : RAIL_IDLE}`}
      >
        <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
    </Tooltip>
  );
}

/**
 * The studio's tools, floating over the canvas.
 *
 * Three separated groups: the tools you pick, the history you step through, and
 * the canvas settings you set once and forget. Separating them means the eye can
 * find undo without reading past the whole tool set.
 *
 * Tools that carry choices — freehand and its eraser, the shape palette and the
 * line, pen defaults, table size, starter frames — put them in a sub-toolbar
 * rather than on the rail, so the rail stays one column of icons however many
 * options sit behind it.
 */
export function StudioToolRail({
  tool,
  onToolChange,
  disabled = false,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  showGrid,
  onToggleGrid,
  snapEnabled,
  onToggleSnap,
  freehandOptions,
  shapeOptions,
  penOptions,
  tableOptions,
  templateOptions,
  onAddText,
}: StudioToolRailProps) {
  const [openMenu, setOpenMenu] = useState<RailSlot | null>(null);
  const slot = SLOT_FOR_TOOL[tool];

  function menu(which: RailSlot) {
    return {
      open: openMenu === which,
      onOpenChange: (next: boolean) => setOpenMenu(next ? which : null),
    };
  }

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-2 sm:top-4 sm:left-4">
      <div className="pointer-events-auto">
        <RailGroup label="Studio tools">
          <RailButton
            label="Select"
            shortcut="V"
            Icon={MousePointer2}
            active={slot === 'select'}
            disabled={disabled}
            onClick={() => {
              setOpenMenu(null);
              onToolChange('select');
            }}
          />
          <RailMenuButton
            label="Freehand"
            shortcut="B"
            Icon={Pencil}
            active={slot === 'freehand'}
            disabled={disabled}
            onActivate={() => onToolChange('draw')}
            {...menu('freehand')}
          >
            {freehandOptions}
          </RailMenuButton>
          <RailMenuButton
            label="Pen"
            shortcut="P"
            Icon={PenTool}
            active={slot === 'pen'}
            disabled={disabled}
            onActivate={() => onToolChange('pen')}
            {...menu('pen')}
          >
            {penOptions}
          </RailMenuButton>
          <RailMenuButton
            label="Shapes"
            shortcut="R"
            Icon={Shapes}
            active={slot === 'shapes'}
            disabled={disabled}
            {...menu('shapes')}
          >
            {shapeOptions}
          </RailMenuButton>
          <RailButton
            label="Text"
            shortcut="T"
            Icon={Type}
            disabled={disabled}
            onClick={() => {
              setOpenMenu(null);
              onAddText();
            }}
          />
          <RailMenuButton
            label="Table"
            shortcut="G"
            Icon={Table}
            active={slot === 'table'}
            disabled={disabled}
            onActivate={() => onToolChange('table')}
            {...menu('table')}
          >
            {tableOptions}
          </RailMenuButton>
          <RailMenuButton
            label="Templates"
            Icon={LayoutTemplate}
            active={openMenu === 'templates'}
            disabled={disabled}
            {...menu('templates')}
          >
            {templateOptions}
          </RailMenuButton>
        </RailGroup>
      </div>

      <div className="pointer-events-auto">
        <RailGroup label="History">
          <RailButton
            label="Undo diagram change"
            shortcut="Ctrl+Z"
            Icon={Undo2}
            disabled={!canUndo || disabled}
            onClick={onUndo}
          />
          <RailButton
            label="Redo diagram change"
            shortcut="Ctrl+Shift+Z"
            Icon={Redo2}
            disabled={!canRedo || disabled}
            onClick={onRedo}
          />
        </RailGroup>
      </div>

      <div className="pointer-events-auto">
        <RailGroup label="Canvas">
          <RailButton label="Show grid" Icon={Grid3x3} active={showGrid} onClick={onToggleGrid} />
          <RailButton
            label="Snap to grid"
            Icon={Magnet}
            active={snapEnabled}
            onClick={onToggleSnap}
          />
        </RailGroup>
      </div>
    </div>
  );
}
