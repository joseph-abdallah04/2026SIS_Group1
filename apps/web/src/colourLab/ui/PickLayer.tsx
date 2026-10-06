import { Crosshair, X } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';

import { paintsSomething } from '../detect/inspect';

interface PickLayerProps {
  /** The element under the pointer, or `null` over nothing. */
  onHover: (element: Element | null) => void;
  onPick: (element: Element) => void;
  onCancel: () => void;
}

/** The host element the lab lives in, which is not part of the page being looked at. */
function hostOf(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * Covers the page while one element is being chosen. It is what the pointer
 * meets, so nothing underneath is clicked or hovered, and it asks the page what
 * is beneath the pointer instead. Of everything stacked there it takes the first
 * that paints something, so a transparent overlay does not hide what is seen.
 */
export function PickLayer({ onHover, onPick, onCancel }: PickLayerProps) {
  const layer = useRef<HTMLDivElement>(null);

  // Keys go to what has focus, which has to be this: the page cannot hear them.
  useEffect(() => {
    layer.current?.focus({ preventScroll: true });
  }, []);

  const elementAt = (event: ReactPointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    const host = layer.current ? hostOf(layer.current) : null;
    const stack = document
      .elementsFromPoint(event.clientX, event.clientY)
      .filter((element) => element !== host && !host?.contains(element));
    return (
      stack.find((element) => paintsSomething(element, getComputedStyle(element))) ??
      stack[0] ??
      null
    );
  };

  return (
    <>
      <div
        ref={layer}
        className="cl-pick"
        tabIndex={-1}
        aria-label="Choose an element on the page"
        onPointerMove={(event) => onHover(elementAt(event))}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => {
          const element = elementAt(event);
          if (element) onPick(element);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <div className="cl-pick-banner" role="status">
        <Crosshair size={14} aria-hidden />
        Click anything on the page to see what paints it
        <button className="cl-icon-button" aria-label="Stop choosing" onClick={onCancel}>
          <X size={14} />
        </button>
      </div>
    </>
  );
}
