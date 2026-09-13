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
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import { Popover } from '../../../../components/ui/Popover';
import { STUDIO_LAYER } from '../studioLayers';
import { useMediaQuery } from '../../../../components/ui/useMediaQuery';
import { useRovingToolbar } from '../../../../components/ui/useRovingToolbar';
import { Tooltip } from '../../../../components/ui/Tooltip';

/**
 * What a press on empty canvas does. Mirrors the editor's own `CanvasTool`;
 * kept structural rather than imported so the rail stays a dumb component that
 * can be rendered and tested on its own.
 */
export type RailTool =
  'select' | 'draw' | 'erase' | 'pen' | 'line' | 'table' | 'text' | 'shape' | 'template' | 'arrow';

/** Which rail button a tool lights up. Erase lives inside Freehand. */
type RailSlot =
  'select' | 'freehand' | 'pen' | 'shapes' | 'text' | 'table' | 'templates' | 'arrange';

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
  // An arrow is drawn from the shapes group too, beside the line.
  arrow: 'shapes',
  template: 'templates',
};

/** The slots that carry a sub-toolbar, and what each one is called. */
const MENU_LABELS: Partial<Record<RailSlot, string>> = {
  freehand: 'Freehand',
  pen: 'Pen',
  shapes: 'Shapes',
  table: 'Table',
  templates: 'Templates',
  arrange: 'Arrange',
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
  arrange: 'button',
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
  /**
   * Laying the whole diagram out along its arrows. A canvas setting rather than
   * a tool: it acts on everything at once and nothing has to be selected first.
   */
  arrangeOptions: (close: () => void) => ReactNode;
  /**
   * History. Back on the rail rather than floating in the corner on its own:
   * two absolutely-positioned columns down the same edge only stay apart while
   * the window is tall enough, and they were not.
   */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const RAIL_BUTTON = `flex h-8 w-8 items-center justify-center max-sm:h-11 max-sm:w-11 rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45`;
const RAIL_ACTIVE = 'border-rt-primary bg-rt-primary-tint text-rt-ink';
const RAIL_IDLE =
  'border-transparent bg-transparent text-rt-ink-muted hover:bg-rt-primary-tint hover:text-rt-ink';

function RailGroup({
  children,
  label,
  orientation,
}: {
  children: ReactNode;
  label: string;
  orientation: 'horizontal' | 'vertical';
}) {
  const roving = useRovingToolbar<HTMLDivElement>(orientation);
  return (
    <div
      ref={roving.ref}
      onKeyDown={roving.onKeyDown}
      role="toolbar"
      aria-orientation={orientation}
      aria-label={label}
      className={`rt-studio-rise flex w-fit shrink-0 gap-0.5 rounded-xl border border-rt-tertiary bg-rt-surface p-1 shadow-[0_4px_18px_rgba(8,12,21,0.12)] ${
        orientation === 'vertical' ? 'flex-col' : ''
      }`}
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
  showGrid,
  onToggleGrid,
  snapEnabled,
  onToggleSnap,
  freehandOptions,
  shapeOptions,
  penOptions,
  tableOptions,
  templateOptions,
  arrangeOptions,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: StudioToolRailProps) {
  const [openMenu, setOpenMenu] = useState<RailSlot | null>(null);
  // Which button to hand focus back to when the panel closes. A single mutable
  // ref rather than one per button: only ever one panel is open.
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  const triggers = useRef<Partial<Record<RailSlot, HTMLButtonElement | null>>>({});
  const slot = SLOT_FOR_TOOL[tool];
  // Below the small breakpoint the rail lies along the bottom: a column down the
  // left of a 320px canvas takes a third of the drawing surface with it. Its
  // arrow keys turn with it — an arrow that moves the wrong way is worse than
  // no arrow at all.
  const docked = useMediaQuery('(max-width: 639px)');
  const orientation: 'horizontal' | 'vertical' = docked ? 'horizontal' : 'vertical';
  // Raised while one of its panels is open, so the panel is never covered by a
  // toolbar that happens to render later.
  const layer = openMenu ? STUDIO_LAYER.open : STUDIO_LAYER.chrome;

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
        openMenu === which && MENU_ANCHOR[which] === 'button'
          ? renderMenu(docked ? 'top-center' : 'right-center')
          : null,
    };
  }

  function renderMenu(placement: 'right' | 'right-center' | 'top' | 'top-center') {
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
      case 'arrange':
        return arrangeOptions(closeMenu);
      default:
        return null;
    }
  }

  return (
    <div
      className={
        docked
          ? `pointer-events-none absolute inset-x-2 bottom-2 flex gap-2 overflow-x-auto ${layer}`
          : // `items-start`, so each group is as wide as its own buttons. Stretched
            // to the column's width, a narrow group's panel would open from the
            // far edge of the widest one and float away from the rail.
            `pointer-events-none absolute inset-y-3 left-3 flex flex-col items-start gap-2 sm:inset-y-4 sm:left-4 ${layer}`
      }
    >
      <div className="pointer-events-auto relative">
        <RailGroup label="Studio tools" orientation={orientation}>
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

        {openMenu && MENU_ANCHOR[openMenu] === 'rail' ? renderMenu(docked ? 'top' : 'right') : null}
      </div>

      <div className="pointer-events-auto relative">
        <RailGroup label="Canvas" orientation={orientation}>
          <RailButton label="Show grid" Icon={Grid3x3} active={showGrid} onClick={onToggleGrid} />
          <RailButton
            label="Snap to grid"
            Icon={Magnet}
            active={snapEnabled}
            onClick={onToggleSnap}
          />
          <RailButton
            label="Arrange"
            Icon={Workflow}
            active={openMenu === 'arrange'}
            disabled={disabled}
            {...menuButton('arrange')}
            onClick={() => toggleMenu('arrange')}
          />
        </RailGroup>
      </div>

      {/* Held at the far end of the same column the tools are in, so the two can
          never land on top of each other however short the window gets — and
          laid flat, because two stepper buttons read as a pair side by side. */}
      <div className={`pointer-events-auto ${docked ? '' : 'mt-auto'}`}>
        <RailGroup label="History" orientation="horizontal">
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
    </div>
  );
}
