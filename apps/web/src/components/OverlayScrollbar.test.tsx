import { fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { OverlayScrollbar } from './OverlayScrollbar';

/** jsdom lays nothing out: give the box and the track their sizes. */
function sized(element: HTMLElement, sizes: Record<string, number>) {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(element, key, { configurable: true, value, writable: true });
  }
}

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="group/scroll relative">
      <div ref={ref} data-testid="box">
        content
      </div>
      <OverlayScrollbar scroller={ref} />
    </div>
  );
}

function setUp({ scrollHeight }: { scrollHeight: number }) {
  const view = render(<Harness />);
  const box = view.getByTestId('box');
  const track = box.nextElementSibling as HTMLElement;
  sized(box, { scrollHeight, clientHeight: 200, scrollTop: 0 });
  sized(track, { clientHeight: 200 });
  return { box, track };
}

describe('OverlayScrollbar', () => {
  it('sizes and places its thumb from the box it scrolls', async () => {
    const { box, track } = setUp({ scrollHeight: 800 });
    box.scrollTop = 300;
    fireEvent.scroll(box);

    await waitFor(() => expect(track.firstElementChild).not.toBeNull());
    const thumb = track.firstElementChild as HTMLElement;
    // A quarter of the box is in view, so a quarter of the track.
    expect(thumb.style.height).toBe('50px');
    // Halfway down what can be scrolled, halfway down what the thumb can travel.
    expect(thumb.style.transform).toBe('translateY(75px)');
    expect(track).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows nothing when there is nothing to scroll', async () => {
    const { box, track } = setUp({ scrollHeight: 200 });
    fireEvent.scroll(box);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(track.firstElementChild).toBeNull();
    expect(track).toHaveClass('pointer-events-none');
  });

  it('scrolls the box when its thumb is dragged', async () => {
    const { box, track } = setUp({ scrollHeight: 800 });
    fireEvent.scroll(box);
    await waitFor(() => expect(track.firstElementChild).not.toBeNull());
    const thumb = track.firstElementChild as HTMLElement;

    fireEvent.pointerDown(thumb, { button: 0, pointerId: 1, clientY: 10 });
    // The thumb has 150px to travel for 600px of scrolling: 4px a pixel.
    fireEvent.pointerMove(thumb, { pointerId: 1, clientY: 40 });
    fireEvent.pointerUp(thumb, { pointerId: 1, clientY: 40 });

    expect(box.scrollTop).toBe(120);
  });
});
