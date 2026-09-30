import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { DiagramNodeShape } from '@roundtable/shared';

import { Tooltip } from '../../../components/ui/Tooltip';
import { useRovingToolbar } from '../../../components/ui/useRovingToolbar';
import { STUDIO_LAYER } from './studioLayers';
import { STUDIO_PANEL_SHADOW } from './studioTheme';

/** Which way from its anchor the picker opens. */
export type ShapePickerSide = 'n' | 'e' | 's' | 'w';

/** Clear space between the anchor and the picker, in CSS pixels. */
const ANCHOR_GAP = 10;
/** The least the picker keeps from the edge of the canvas. */
const EDGE_MARGIN = 8;

interface StudioShapePickerProps {
  /** Names the group for a screen reader. */
  label: string;
  testId: string;
  /** Where the picker hangs from, in pixels within the canvas frame. */
  anchor: { x: number; y: number };
  side: ShapePickerSide;
  /** The canvas frame's size, so the picker can be held inside it. */
  container: { width: number; height: number };
  shapes: readonly DiagramNodeShape[];
  /** A tile's accessible name. */
  nameFor: (shape: DiagramNodeShape) => string;
  /** A tile's tooltip, short. */
  tooltipFor: (shape: DiagramNodeShape) => string;
  renderIcon: (shape: DiagramNodeShape) => ReactNode;
  tileClassName: string;
  onPick: (shape: DiagramNodeShape) => void;
  onDismiss: () => void;
  /** Adds a closing tile that says what closing means. */
  dismissLabel?: string;
  disabled?: boolean;
  /** Take focus on opening: right for a picker someone asked for, not one offered. */
  autoFocus?: boolean;
}

/**
 * A row of shapes to choose from, hung beside a point on the canvas.
 *
 * Plain HTML over the canvas rather than drawn inside it, so it is the same size
 * at every zoom, its tiles are real buttons with tooltips, and arrow keys move
 * between them. Held inside the canvas frame, so a picker opened near an edge
 * opens back towards the middle instead of off the side.
 *
 * Escape and a press anywhere else close it without choosing. Escape is stopped
 * here, so it closes only the picker and not the studio around it.
 */
export function StudioShapePicker({
  label,
  testId,
  anchor,
  side,
  container,
  shapes,
  nameFor,
  tooltipFor,
  renderIcon,
  tileClassName,
  onPick,
  onDismiss,
  dismissLabel,
  disabled = false,
  autoFocus = false,
}: StudioShapePickerProps) {
  const roving = useRovingToolbar<HTMLDivElement>('horizontal');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Measured before paint, so it is never drawn in the wrong place first.
  useLayoutEffect(() => {
    const element = roving.ref.current;
    if (!element) return;
    setSize({ width: element.offsetWidth, height: element.offsetHeight });
  }, [roving.ref, shapes.length]);

  useEffect(() => {
    if (!autoFocus) return;
    roving.ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [autoFocus, roving.ref]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && roving.ref.current?.contains(target)) return;
      onDismissRef.current();
    }
    // Capture, so a press that the canvas goes on to handle still closes this
    // first — otherwise the press lands and the picker hangs on over it.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [roving.ref]);

  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const preferred =
    side === 'e'
      ? { x: anchor.x + ANCHOR_GAP, y: anchor.y - height / 2 }
      : side === 'w'
        ? { x: anchor.x - ANCHOR_GAP - width, y: anchor.y - height / 2 }
        : side === 'n'
          ? { x: anchor.x - width / 2, y: anchor.y - ANCHOR_GAP - height }
          : { x: anchor.x - width / 2, y: anchor.y + ANCHOR_GAP };
  const hold = (value: number, extent: number, limit: number) =>
    limit <= 0 ? value : Math.max(EDGE_MARGIN, Math.min(value, limit - extent - EDGE_MARGIN));
  const left = hold(preferred.x, width, container.width);
  const top = hold(preferred.y, height, container.height);
  const tooltipPlacement = side === 's' ? 'bottom' : 'top';

  return (
    <div
      ref={roving.ref}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      data-testid={testId}
      className={`rt-studio-rise pointer-events-auto absolute ${STUDIO_LAYER.open} flex items-center gap-0.5 rounded-xl border border-rt-tertiary bg-rt-surface p-1 ${STUDIO_PANEL_SHADOW}`}
      style={{ left, top, visibility: size ? 'visible' : 'hidden' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
          return;
        }
        roving.onKeyDown(event);
      }}
      // A press inside is the picker's own; the canvas under it must not see it.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {shapes.map((shape) => (
        <Tooltip key={shape} label={tooltipFor(shape)} placement={tooltipPlacement}>
          <button
            type="button"
            aria-label={nameFor(shape)}
            className={tileClassName}
            disabled={disabled}
            onClick={() => onPick(shape)}
          >
            {renderIcon(shape)}
          </button>
        </Tooltip>
      ))}
      {dismissLabel ? (
        <Tooltip label={dismissLabel} placement={tooltipPlacement}>
          <button
            type="button"
            aria-label={dismissLabel}
            className={tileClassName}
            disabled={disabled}
            onClick={onDismiss}
          >
            <X aria-hidden="true" size={13} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
