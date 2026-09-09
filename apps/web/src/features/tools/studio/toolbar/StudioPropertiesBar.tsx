import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  StretchHorizontal,
  type LucideIcon,
} from 'lucide-react';

import { Popover } from '../../../../components/ui/Popover';
import { Tooltip } from '../../../../components/ui/Tooltip';
import { groupProperties, type StudioPropertyDescriptor } from '../studioProperties';
import { placePropertiesBar, type PlacementRect } from '../studioBarPlacement';

/** What the alignment cluster can do; named as the editor names them. */
export type BarAlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type BarDistributeAxis = 'horizontal' | 'vertical';

const ALIGN_BUTTONS: { mode: BarAlignMode; label: string; Icon: LucideIcon }[] = [
  { mode: 'left', label: 'Align left', Icon: AlignStartVertical },
  { mode: 'centerX', label: 'Align centre', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', Icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { mode: 'centerY', label: 'Align middle', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

interface StudioPropertiesBarProps {
  /** The properties this selection has in common, already in canonical order. */
  properties: readonly StudioPropertyDescriptor[];
  /** One control per property. The editor owns what each one actually does. */
  renderControl: (property: StudioPropertyDescriptor) => ReactNode;
  /** Selection bounds and the canvas they sit in, both in client coordinates. */
  selection: PlacementRect;
  viewport: PlacementRect;
  /**
   * Client origin of the box the bar is positioned inside. The canvas is
   * centred within it with padding around, so the two do not share an origin
   * and placing against the canvas alone would be off by the difference.
   */
  origin?: { x: number; y: number };
  /** How many elements are selected; alignment needs more than one. */
  selectionSize: number;
  onAlign: (mode: BarAlignMode) => void;
  onDistribute: (axis: BarDistributeAxis) => void;
  /** Everything that is an action rather than a property. */
  actions?: ReactNode;
}

const BAR_BUTTON =
  'flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45';

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-rt-tertiary" />;
}

/**
 * The properties of whatever is selected, floating over the canvas.
 *
 * Driven entirely by the property registry: one element shows what it supports,
 * a mixed selection shows only the intersection, and a control that is shown
 * always applies to everything selected. Properties keep one canonical order
 * and absent ones are hidden rather than packed from the left, so a control
 * stays where muscle memory left it.
 *
 * Alignment is offered to any multi-selection, including one with no property in
 * common at all — a stroke and a table share nothing to style, but they both
 * occupy a rectangle. It is what stops the bar being empty.
 *
 * The bar measures itself and is placed by `placePropertiesBar`, so it never
 * leaves the canvas and stays clear of the selection whenever there is room.
 */
export function StudioPropertiesBar({
  properties,
  renderControl,
  selection,
  viewport,
  origin = { x: 0, y: 0 },
  selectionSize,
  onAlign,
  onDistribute,
  actions,
}: StudioPropertiesBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const alignTriggerRef = useRef<HTMLButtonElement>(null);
  const [alignOpen, setAlignOpen] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0, measured: false });

  // Measured after paint, because where it goes depends on how wide it turned
  // out — and how wide it is depends on which controls this selection offers.
  useLayoutEffect(() => {
    const element = barRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    setSize((current) =>
      current.measured && current.width === bounds.width && current.height === bounds.height
        ? current
        : { width: bounds.width, height: bounds.height, measured: true },
    );
  });

  const groups = groupProperties(properties);
  const showAlignment = selectionSize > 1;
  const showDistribute = selectionSize > 2;
  const placed = placePropertiesBar(selection, size, viewport);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-orientation="horizontal"
      aria-label="Selection properties"
      data-side={placed.side}
      className="pointer-events-auto absolute z-20 flex w-max items-center gap-0.5 rounded-xl border border-rt-tertiary bg-rt-surface p-1 shadow-[0_6px_24px_rgba(8,12,21,0.16)]"
      style={{
        left: `${placed.x - origin.x}px`,
        top: `${placed.y - origin.y}px`,
        // Hidden until it has been measured once, so it is never seen in the
        // wrong place first. Measured, not non-zero: a layout that reports no
        // size still knows where the bar belongs.
        visibility: size.measured ? 'visible' : 'hidden',
      }}
    >
      {groups.map((entry, index) => (
        <span key={entry.group} className="flex items-center gap-0.5">
          {index > 0 ? <Divider /> : null}
          {entry.properties.map((property) => (
            <span key={property.id}>{renderControl(property)}</span>
          ))}
        </span>
      ))}

      {showAlignment ? (
        <span className="flex items-center gap-0.5">
          {groups.length > 0 ? <Divider /> : null}
          <span className="relative inline-flex">
            <Tooltip label="Align" placement="bottom">
              <button
                ref={alignTriggerRef}
                type="button"
                aria-label="Align"
                aria-expanded={alignOpen}
                onClick={() => setAlignOpen((current) => !current)}
                className={BAR_BUTTON}
              >
                <StretchHorizontal aria-hidden="true" size={15} />
              </button>
            </Tooltip>
            {/* Eight buttons is most of a bar's width for something reached now
                and then, so they collapse into their own strip above it. */}
            <Popover
              open={alignOpen}
              onClose={() => setAlignOpen(false)}
              label="Align options"
              placement="top-center"
              triggerRef={alignTriggerRef}
            >
              <div role="group" aria-label="Align" className="flex items-center gap-0.5">
                {ALIGN_BUTTONS.map(({ mode, label, Icon }) => (
                  <Tooltip key={mode} label={label} placement="top">
                    <button
                      type="button"
                      aria-label={label}
                      onClick={() => {
                        onAlign(mode);
                        setAlignOpen(false);
                      }}
                      className={BAR_BUTTON}
                    >
                      <Icon aria-hidden="true" size={15} />
                    </button>
                  </Tooltip>
                ))}
                {showDistribute ? (
                  <>
                    <Divider />
                    <Tooltip label="Distribute horizontally" placement="top">
                      <button
                        type="button"
                        aria-label="Distribute horizontally"
                        onClick={() => {
                          onDistribute('horizontal');
                          setAlignOpen(false);
                        }}
                        className={BAR_BUTTON}
                      >
                        <AlignHorizontalDistributeCenter aria-hidden="true" size={15} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Distribute vertically" placement="top">
                      <button
                        type="button"
                        aria-label="Distribute vertically"
                        onClick={() => {
                          onDistribute('vertical');
                          setAlignOpen(false);
                        }}
                        className={BAR_BUTTON}
                      >
                        <AlignVerticalDistributeCenter aria-hidden="true" size={15} />
                      </button>
                    </Tooltip>
                  </>
                ) : null}
              </div>
            </Popover>
          </span>
        </span>
      ) : null}

      {actions ? (
        <span className="flex items-center gap-0.5">
          {groups.length > 0 || showAlignment ? <Divider /> : null}
          {actions}
        </span>
      ) : null}
    </div>
  );
}
