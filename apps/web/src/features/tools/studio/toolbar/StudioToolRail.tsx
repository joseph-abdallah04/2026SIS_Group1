import { useEffect, useRef, useState, type ReactNode } from 'react';
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
export type RailTool =
  'select' | 'draw' | 'erase' | 'pen' | 'line' | 'table' | 'text' | 'shape' | 'template';

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
  text: 'text',
  // A shape or frame picked up from a palette keeps that palette lit while it
  // is being carried.
  shape: 'shapes',
  template: 'templates',
};

/** The slots that carry a sub-toolbar, and what each one is called. */
const MENU_LABELS: Partial<Record<RailSlot, string>> = {
  freehand: 'Freehand',
  pen: 'Pen',
  shapes: 'Shapes',
  table: 'Table',
  templates: 'Templates',
};

/**
 * Where each panel hangs from.
 *
 * A tall one starts level with the top of the rail: hung from its own button it
 * would run off the bottom of the canvas and its last options could not be
 * reached. A short one is held level with the middle of the button that opened
 * it, which is where the eye already is.
 */
const MENU_ANCHOR: Partial<Record<RailSlot, 'rail' | 'button'>> = {
  freehand: 'rail',
  pen: 'rail',
  shapes: 'rail',
  table: 'button',
  templates: 'button',
};

/**
 * Panels that stay open while their tool is in use. Closing the ink settings the
 * moment a stroke starts would mean reopening them between every stroke. They
 * close when the tool itself is put down — the pen hands the canvas back to
 * Select once a shape is finished, and its settings go with it.
 */
const STICKY_MENUS: readonly RailSlot[] = ['freehand', 'pen'];

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
  /**
   * Contents of each sub-toolbar, supplied by the editor. Each is handed a
   * `close` so the gesture it offers can end by shutting the popover — placing
   * a table or a starter frame is finished business, and leaving the panel open
   * over the thing that just appeared hides it.
   */
  freehandOptions: (close: () => void) => ReactNode;
  shapeOptions: (close: () => void) => ReactNode;
  penOptions: (close: () => void) => ReactNode;
  tableOptions: (close: () => void) => ReactNode;
  templateOptions: (close: () => void) => ReactNode;
}

const RAIL_BUTTON = `flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45`;
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

/** A rail button. Some open a sub-toolbar as well as arming their tool. */
function RailButton({
  label,
  shortcut,
  Icon,
  active,
  disabled,
  expanded,
  buttonRef,
  menu,
  onClick,
}: {
  label: string;
  shortcut?: string;
  Icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  /** A sub-toolbar anchored to this button rather than to the rail. */
  menu?: ReactNode;
  onClick: () => void;
}) {
  return (
    <span className="relative inline-flex">
      <Tooltip label={label} shortcut={shortcut}>
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          {...(active === undefined ? {} : { 'aria-pressed': active })}
          {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
          disabled={disabled}
          onClick={onClick}
          className={`${RAIL_BUTTON} ${active ? RAIL_ACTIVE : RAIL_IDLE}`}
        >
          <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
      </Tooltip>
      {menu}
    </span>
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
 *
 * A sub-toolbar is anchored to the *group*, not to the button that opened it, so
 * every panel starts level with the top of the rail. Anchored to the button, a
 * tall panel opened from a low one would hang off the bottom of the canvas.
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
}: StudioToolRailProps) {
  const [openMenu, setOpenMenu] = useState<RailSlot | null>(null);
  // Which button to hand focus back to when the panel closes. A single mutable
  // ref rather than one per button: only ever one panel is open.
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggers = useRef<Partial<Record<RailSlot, HTMLButtonElement | null>>>({});
  const slot = SLOT_FOR_TOOL[tool];

  function closeMenu() {
    setOpenMenu(null);
  }

  // A tool's own settings belong to a tool that is armed. When the canvas hands
  // itself back — a finished pen shape, a placed table — the panel goes too.
  useEffect(() => {
    if (openMenu && STICKY_MENUS.includes(openMenu) && slot !== openMenu) setOpenMenu(null);
  }, [openMenu, slot]);

  function toggleMenu(which: RailSlot) {
    const next = openMenu === which ? null : which;
    openTriggerRef.current = next ? (triggers.current[next] ?? null) : openTriggerRef.current;
    setOpenMenu(next);
  }

  function menuButton(which: RailSlot) {
    return {
      expanded: openMenu === which,
      buttonRef: (element: HTMLButtonElement | null) => {
        triggers.current[which] = element;
      },
      // Rendered inside the button only when it is what the panel hangs from.
      menu:
        openMenu === which && MENU_ANCHOR[which] === 'button' ? renderMenu('right-center') : null,
    };
  }

  function renderMenu(placement: 'right' | 'right-center') {
    if (!openMenu) return null;
    return (
      <Popover
        open
        onClose={closeMenu}
        placement={placement}
        label={`${MENU_LABELS[openMenu] ?? ''} options`}
        triggerRef={openTriggerRef}
        dismissOnOutsidePress={!STICKY_MENUS.includes(openMenu)}
      >
        {openMenuContent()}
      </Popover>
    );
  }

  function openMenuContent() {
    switch (openMenu) {
      case 'freehand':
        return freehandOptions(closeMenu);
      case 'pen':
        return penOptions(closeMenu);
      case 'shapes':
        return shapeOptions(closeMenu);
      case 'table':
        return tableOptions(closeMenu);
      case 'templates':
        return templateOptions(closeMenu);
      default:
        return null;
    }
  }

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-2 sm:top-4 sm:left-4">
      <div className="pointer-events-auto relative">
        <RailGroup label="Studio tools">
          <RailButton
            label="Select"
            shortcut="V"
            Icon={MousePointer2}
            active={slot === 'select'}
            disabled={disabled}
            onClick={() => {
              closeMenu();
              onToolChange('select');
            }}
          />
          <RailButton
            label="Freehand"
            shortcut="B"
            Icon={Pencil}
            active={slot === 'freehand'}
            disabled={disabled}
            {...menuButton('freehand')}
            onClick={() => {
              onToolChange('draw');
              toggleMenu('freehand');
            }}
          />
          <RailButton
            label="Pen"
            shortcut="P"
            Icon={PenTool}
            active={slot === 'pen'}
            disabled={disabled}
            {...menuButton('pen')}
            onClick={() => {
              onToolChange('pen');
              toggleMenu('pen');
            }}
          />
          <RailButton
            label="Shapes"
            shortcut="R"
            Icon={Shapes}
            active={slot === 'shapes'}
            disabled={disabled}
            {...menuButton('shapes')}
            onClick={() => toggleMenu('shapes')}
          />
          <RailButton
            label="Text"
            shortcut="T"
            Icon={Type}
            active={slot === 'text'}
            disabled={disabled}
            onClick={() => {
              closeMenu();
              onToolChange('text');
            }}
          />
          <RailButton
            label="Table"
            shortcut="G"
            Icon={Table}
            active={slot === 'table'}
            disabled={disabled}
            {...menuButton('table')}
            onClick={() => {
              onToolChange('table');
              toggleMenu('table');
            }}
          />
          <RailButton
            label="Templates"
            Icon={LayoutTemplate}
            active={openMenu === 'templates'}
            disabled={disabled}
            {...menuButton('templates')}
            onClick={() => toggleMenu('templates')}
          />
        </RailGroup>

        {openMenu && MENU_ANCHOR[openMenu] === 'rail' ? renderMenu('right') : null}
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
