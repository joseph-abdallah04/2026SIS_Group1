import { useEffect, useState } from 'react';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const sameBoxes = (a: readonly Box[], b: readonly Box[]): boolean =>
  a.length === b.length &&
  a.every(
    (box, i) =>
      box.left === b[i]?.left &&
      box.top === b[i]?.top &&
      box.width === b[i]?.width &&
      box.height === b[i]?.height,
  );

/**
 * Draws a box over each element a colour is painted on. Re-measured every
 * frame while it shows, since the page scrolls and boards pan beneath it,
 * and only while it shows: it is what hovering a row asks for.
 *
 * `kind` is the colour of the outline, so the three things that use it, where a
 * colour is used, what the pointer is over, and the element being inspected,
 * can be told apart when they are on screen together.
 */
export function Outlines({
  elements,
  kind = 'locate',
}: {
  elements: readonly Element[];
  kind?: 'locate' | 'pick' | 'inspect';
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);

  useEffect(() => {
    if (elements.length === 0) {
      setBoxes([]);
      return;
    }
    let frame = 0;
    const measure = (): void => {
      const next: Box[] = [];
      for (const element of elements) {
        if (!element.isConnected) continue;
        const { left, top, width, height } = element.getBoundingClientRect();
        if (width > 0 && height > 0) next.push({ left, top, width, height });
      }
      setBoxes((current) => (sameBoxes(current, next) ? current : next));
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [elements]);

  return (
    <>
      {boxes.map((box, i) => (
        <div key={i} className={`cl-outline cl-outline-${kind}`} style={box} />
      ))}
    </>
  );
}
