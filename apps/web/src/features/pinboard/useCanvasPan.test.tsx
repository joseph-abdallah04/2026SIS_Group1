import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useCanvasPan, type Point } from './useCanvasPan';

beforeAll(() => {
  // jsdom has no ResizeObserver; the hook only needs one to exist.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The board's viewport sits at (100, 50), 800 by 600, below a header. */
const BOARD = { left: 100, top: 50, width: 800, height: 600 };

function Page({
  onZoom,
  zoomEnabled,
}: {
  onZoom: (direction: 'in' | 'out', anchor: Point) => void;
  zoomEnabled?: boolean;
}) {
  const { viewportRef } = useCanvasPan({
    contentWidth: 4000,
    contentHeight: 3000,
    onZoom,
    zoomEnabled,
  });
  return (
    <div>
      <header>Session header</header>
      <div ref={viewportRef} data-testid="board" />
      <footer>Toolbar</footer>
      <textarea aria-label="Note" />
      <div role="dialog" aria-label="Sticky popup">
        <p>Inside a dialog</p>
      </div>
      <div data-testid="studio" />
    </div>
  );
}

function renderPage({ zoomEnabled }: { zoomEnabled?: boolean } = {}) {
  const onZoom = vi.fn();
  render(<Page onZoom={onZoom} zoomEnabled={zoomEnabled} />);
  vi.spyOn(screen.getByTestId('board'), 'getBoundingClientRect').mockReturnValue({
    ...BOARD,
    right: BOARD.left + BOARD.width,
    bottom: BOARD.top + BOARD.height,
    x: BOARD.left,
    y: BOARD.top,
    toJSON: () => ({}),
  });
  return { onZoom };
}

/** Dispatches a wheel event and reports whether the page's own zoom was stopped. */
function wheel(target: Element, init: WheelEventInit) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

const middle = { x: BOARD.width / 2, y: BOARD.height / 2 };

describe('zooming the board from anywhere on the page', () => {
  // The bug: over the header or toolbar nothing caught the gesture, so the
  // browser zoomed the whole page instead of the board.
  it('zooms the board, not the page, from the header and the toolbar', () => {
    const { onZoom } = renderPage();

    const header = wheel(screen.getByText('Session header'), {
      ctrlKey: true,
      deltaY: -100,
      clientX: 300,
      clientY: 10,
    });
    const toolbar = wheel(screen.getByText('Toolbar'), {
      ctrlKey: true,
      deltaY: 100,
      clientX: 300,
      clientY: 700,
    });

    expect(header).toBe(true);
    expect(toolbar).toBe(true);
    expect(onZoom).toHaveBeenNthCalledWith(1, 'in', middle);
    expect(onZoom).toHaveBeenNthCalledWith(2, 'out', middle);
  });

  // Over the board, the point under the pointer is the one held still.
  it('zooms about the pointer when it is over the board', () => {
    const { onZoom } = renderPage();

    wheel(screen.getByTestId('board'), { ctrlKey: true, deltaY: -100, clientX: 250, clientY: 150 });

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom).toHaveBeenCalledWith('in', { x: 150, y: 100 });
  });

  it('treats a trackpad pinch on a Mac, which sets metaKey, the same way', () => {
    const { onZoom } = renderPage();

    const stopped = wheel(screen.getByText('Toolbar'), { metaKey: true, deltaY: -40 });

    expect(stopped).toBe(true);
    expect(onZoom).toHaveBeenCalledWith('in', middle);
  });

  it('leaves an ordinary scroll outside the board alone', () => {
    const { onZoom } = renderPage();

    const stopped = wheel(screen.getByText('Session header'), { deltaY: 100 });

    expect(stopped).toBe(false);
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('ignores a pinch with no vertical travel rather than guessing a direction', () => {
    const { onZoom } = renderPage();

    wheel(screen.getByText('Toolbar'), { ctrlKey: true, deltaX: 30, deltaY: 0 });

    expect(onZoom).not.toHaveBeenCalled();
  });
});

describe('zooming the board from the keyboard', () => {
  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('zooms in on Ctrl and plus, however plus is typed', () => {
    const { onZoom } = renderPage();

    expect(press({ ctrlKey: true, key: '=' })).toBe(true);
    expect(press({ ctrlKey: true, key: '+' })).toBe(true);

    expect(onZoom).toHaveBeenCalledTimes(2);
    expect(onZoom).toHaveBeenLastCalledWith('in', middle);
  });

  it('zooms out on Ctrl and minus', () => {
    const { onZoom } = renderPage();

    expect(press({ metaKey: true, key: '-' })).toBe(true);

    expect(onZoom).toHaveBeenCalledWith('out', middle);
  });

  // A page zoomed before arriving here can always be put back.
  it('leaves Ctrl and zero to the browser', () => {
    const { onZoom } = renderPage();

    expect(press({ ctrlKey: true, key: '0' })).toBe(false);
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('does nothing for plus or minus typed without Ctrl', () => {
    const { onZoom } = renderPage();

    expect(press({ key: '-' })).toBe(false);
    fireEvent.keyDown(window, { key: '=' });

    expect(onZoom).not.toHaveBeenCalled();
  });

  // Keys typed into text belong to the text, and to the browser's own zoom.
  it('leaves Ctrl and plus to the browser while typing', () => {
    const { onZoom } = renderPage();
    const note = screen.getByRole('textbox', { name: 'Note' });

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: '=',
    });
    note.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onZoom).not.toHaveBeenCalled();
  });
});

describe('zoom that is not the board\u2019s to take', () => {
  // A dialog, the sticky popup or the studio is not scaled with the board, and
  // somebody may need to enlarge it.
  it('leaves a zoom made inside a dialog to the browser', () => {
    const { onZoom } = renderPage();

    const stopped = wheel(screen.getByText('Inside a dialog'), { ctrlKey: true, deltaY: -100 });

    expect(stopped).toBe(false);
    expect(onZoom).not.toHaveBeenCalled();
  });

  // The diagram studio zooms its own canvas on this gesture. Taken twice, a
  // pinch zoomed the diagram and the hidden board underneath it together.
  it('leaves a zoom another handler has already taken', () => {
    const { onZoom } = renderPage();
    const studio = screen.getByTestId('studio');
    const zoomStudio = vi.fn((event: WheelEvent) => event.preventDefault());
    studio.addEventListener('wheel', zoomStudio);

    wheel(studio, { ctrlKey: true, deltaY: -100 });

    expect(zoomStudio).toHaveBeenCalledTimes(1);
    expect(onZoom).not.toHaveBeenCalled();
  });

  // While the ballot takes the board's place there is no board on screen.
  it('takes no zoom at all while the board is off screen', () => {
    const { onZoom } = renderPage({ zoomEnabled: false });

    const stopped = wheel(screen.getByText('Toolbar'), { ctrlKey: true, deltaY: -100 });
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: '=',
    });
    window.dispatchEvent(event);

    expect(stopped).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(onZoom).not.toHaveBeenCalled();
  });
});
