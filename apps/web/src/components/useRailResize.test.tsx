import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardRail, type BoardRailSide } from './BoardRail';
import {
  RAIL_CLOSE_GRACE,
  RAIL_DEFAULT_WIDTH,
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  railMaxWidth,
  readRailWidth,
} from './useRailResize';

const KEY = 'rt_rail_width:agenda';

function Harness({ side = 'left', inert }: { side?: BoardRailSide; inert?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <BoardRail
      side={side}
      title="Agenda"
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel="Expand agenda"
      collapseLabel="Collapse agenda"
      inert={inert}
      resize={{ storageKey: 'agenda', label: 'Resize agenda' }}
    >
      <p>Questions</p>
    </BoardRail>
  );
}

const rail = () => screen.getByRole('complementary', { name: 'Agenda' });
const handle = () => screen.getByRole('separator', { name: 'Resize agenda' });
const isCollapsed = () => screen.queryByRole('button', { name: 'Expand agenda' }) !== null;

/** Press the handle at x = 1000 and return a way to move the pointer by `dx`. */
function startDrag() {
  fireEvent.pointerDown(handle(), { clientX: 1000, button: 0 });
  return {
    moveBy: (dx: number) => fireEvent.pointerMove(window, { clientX: 1000 + dx }),
    release: () => fireEvent.pointerUp(window),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe('railMaxWidth', () => {
  it('caps the rail at 40% of a narrow window, never under the minimum', () => {
    expect(railMaxWidth(2000)).toBe(RAIL_MAX_WIDTH);
    expect(railMaxWidth(1000)).toBe(400);
    expect(railMaxWidth(300)).toBe(RAIL_MIN_WIDTH);
  });
});

describe('readRailWidth', () => {
  it('reads a stored width and ignores anything out of range or unreadable', () => {
    localStorage.setItem(KEY, '300');
    expect(readRailWidth('agenda')).toBe(300);
    localStorage.setItem(KEY, 'wide');
    expect(readRailWidth('agenda')).toBeNull();
    localStorage.setItem(KEY, '9999');
    expect(readRailWidth('agenda')).toBeNull();
    localStorage.setItem(KEY, '10');
    expect(readRailWidth('agenda')).toBeNull();
  });

  it('treats storage that throws as nothing stored', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readRailWidth('agenda')).toBeNull();
  });
});

describe('BoardRail resize', () => {
  const max = () => railMaxWidth(window.innerWidth);

  it('opens at the default width with a labelled separator on its inner edge', () => {
    render(<Harness />);
    expect(rail().style.width).toBe(`${RAIL_DEFAULT_WIDTH}px`);
    expect(rail().className).not.toContain('w-64');
    expect(handle()).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle()).toHaveAttribute('aria-valuenow', String(RAIL_DEFAULT_WIDTH));
    expect(handle()).toHaveAttribute('aria-valuemin', String(RAIL_MIN_WIDTH));
    expect(handle()).toHaveAttribute('aria-valuemax', String(max()));
    expect(handle().className).toContain('-right-1');
  });

  it('opens at the width this browser left it at', () => {
    localStorage.setItem(KEY, '320');
    render(<Harness />);
    expect(rail().style.width).toBe('320px');
  });

  it('opens at the default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    render(<Harness />);
    expect(rail().style.width).toBe(`${RAIL_DEFAULT_WIDTH}px`);
  });

  it('follows the pointer and remembers the width once the drag ends', () => {
    render(<Harness />);
    const drag = startDrag();
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');

    drag.moveBy(40);
    expect(rail().style.width).toBe(`${RAIL_DEFAULT_WIDTH + 40}px`);
    // Not written on every move, only when the drag is over.
    expect(localStorage.getItem(KEY)).toBeNull();

    drag.release();
    expect(localStorage.getItem(KEY)).toBe(String(RAIL_DEFAULT_WIDTH + 40));
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('mirrors the drag on a right-hand rail', () => {
    render(<Harness side="right" />);
    expect(handle().className).toContain('-left-1');
    const drag = startDrag();
    drag.moveBy(-40);
    expect(rail().style.width).toBe(`${RAIL_DEFAULT_WIDTH + 40}px`);
    drag.release();
  });

  it('stops at the maximum', () => {
    render(<Harness />);
    const drag = startDrag();
    drag.moveBy(2000);
    expect(rail().style.width).toBe(`${max()}px`);
    drag.release();
  });

  it('holds at the minimum inside the grace distance, and stays open if let go there', () => {
    render(<Harness />);
    const drag = startDrag();
    // Past the minimum, but not by the whole grace distance.
    drag.moveBy(RAIL_MIN_WIDTH - RAIL_DEFAULT_WIDTH - RAIL_CLOSE_GRACE + 10);
    expect(isCollapsed()).toBe(false);
    expect(rail().style.width).toBe(`${RAIL_MIN_WIDTH}px`);
    // The body fades to say "let go now and this closes".
    expect(screen.getByText('Questions').parentElement).toHaveClass('opacity-40');

    drag.release();
    expect(isCollapsed()).toBe(false);
    expect(screen.getByText('Questions').parentElement).not.toHaveClass('opacity-40');
    expect(localStorage.getItem(KEY)).toBe(String(RAIL_MIN_WIDTH));
  });

  it('closes past the grace distance and reopens if dragged back in the same gesture', () => {
    render(<Harness />);
    const drag = startDrag();
    const pastGrace = RAIL_MIN_WIDTH - RAIL_DEFAULT_WIDTH - RAIL_CLOSE_GRACE - 1;

    drag.moveBy(pastGrace);
    expect(isCollapsed()).toBe(true);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();

    // Back inside the grace distance is not enough to reopen it.
    drag.moveBy(pastGrace + 20);
    expect(isCollapsed()).toBe(true);

    drag.moveBy(RAIL_MIN_WIDTH - RAIL_DEFAULT_WIDTH + 30);
    expect(isCollapsed()).toBe(false);
    expect(rail().style.width).toBe(`${RAIL_MIN_WIDTH + 30}px`);

    drag.release();
    expect(localStorage.getItem(KEY)).toBe(String(RAIL_MIN_WIDTH + 30));
  });

  it('keeps the width from before the drag when a drag closes it', () => {
    localStorage.setItem(KEY, '360');
    render(<Harness />);
    const drag = startDrag();
    drag.moveBy(-360);
    drag.release();
    expect(isCollapsed()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('360');

    fireEvent.click(screen.getByRole('button', { name: 'Expand agenda' }));
    expect(rail().style.width).toBe('360px');
  });

  it('resizes from the keyboard', () => {
    render(<Harness />);
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(handle()).toHaveAttribute('aria-valuenow', String(RAIL_DEFAULT_WIDTH + 16));
    fireEvent.keyDown(handle(), { key: 'ArrowLeft', shiftKey: true });
    expect(handle()).toHaveAttribute('aria-valuenow', String(RAIL_DEFAULT_WIDTH + 16 - 48));
    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(handle()).toHaveAttribute('aria-valuenow', String(RAIL_MIN_WIDTH));
    // The keyboard stops at the minimum: closing is the collapse button's job.
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(handle()).toHaveAttribute('aria-valuenow', String(RAIL_MIN_WIDTH));
    expect(isCollapsed()).toBe(false);
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(handle()).toHaveAttribute('aria-valuenow', String(max()));
    expect(localStorage.getItem(KEY)).toBe(String(max()));
  });

  it('grows towards the board with the arrow that points at it on a right-hand rail', () => {
    render(<Harness side="right" />);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(handle()).toHaveAttribute('aria-valuenow', String(RAIL_DEFAULT_WIDTH + 16));
  });

  it('goes back to the default width on double-click', () => {
    localStorage.setItem(KEY, '400');
    render(<Harness />);
    fireEvent.doubleClick(handle());
    expect(rail().style.width).toBe(`${RAIL_DEFAULT_WIDTH}px`);
    expect(localStorage.getItem(KEY)).toBe(String(RAIL_DEFAULT_WIDTH));
  });

  it('narrows a remembered width that no longer fits a smaller window', () => {
    localStorage.setItem(KEY, String(RAIL_MAX_WIDTH));
    render(<Harness />);
    const width = window.innerWidth;
    try {
      act(() => {
        window.innerWidth = 700;
        window.dispatchEvent(new Event('resize'));
      });
      expect(rail().style.width).toBe(`${railMaxWidth(700)}px`);
    } finally {
      act(() => {
        window.innerWidth = width;
        window.dispatchEvent(new Event('resize'));
      });
    }
  });

  // The window caps the rail, but the cap is not what the person chose: a
  // rail left at 480 should come back to 480 when the window does.
  describe('in a window too narrow for the width chosen', () => {
    const resizeWindow = (width: number) =>
      act(() => {
        window.innerWidth = width;
        window.dispatchEvent(new Event('resize'));
      });
    let original: number;
    beforeEach(() => {
      original = window.innerWidth;
      localStorage.setItem(KEY, '480');
      window.innerWidth = 700;
    });
    afterEach(() => {
      window.innerWidth = original;
    });
    const cap = () => railMaxWidth(700);

    it('keeps the preference through a press that never moved', () => {
      render(<Harness />);
      expect(rail().style.width).toBe(`${cap()}px`);
      startDrag().release();
      expect(localStorage.getItem(KEY)).toBe('480');

      resizeWindow(1600);
      expect(rail().style.width).toBe('480px');
    });

    it('keeps the preference through a drag pushed against the cap', () => {
      render(<Harness />);
      const drag = startDrag();
      drag.moveBy(120);
      expect(rail().style.width).toBe(`${cap()}px`);
      drag.release();
      expect(localStorage.getItem(KEY)).toBe('480');
    });

    it('keeps the preference, for this visit too, when a drag closes the rail', () => {
      render(<Harness />);
      const drag = startDrag();
      drag.moveBy(-400);
      drag.release();
      expect(isCollapsed()).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Expand agenda' }));
      resizeWindow(1600);
      expect(rail().style.width).toBe('480px');
      expect(localStorage.getItem(KEY)).toBe('480');
    });

    it('takes a drag that settles on a new width inside the cap as the new choice', () => {
      render(<Harness />);
      const drag = startDrag();
      drag.moveBy(-40);
      drag.release();
      expect(localStorage.getItem(KEY)).toBe(String(cap() - 40));
    });

    it('steps the keyboard from the edge as shown, and does not store a press into the cap', () => {
      render(<Harness />);
      fireEvent.keyDown(handle(), { key: 'ArrowRight' });
      fireEvent.keyDown(handle(), { key: 'End' });
      expect(localStorage.getItem(KEY)).toBe('480');

      fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
      expect(handle()).toHaveAttribute('aria-valuenow', String(cap() - 16));
      expect(localStorage.getItem(KEY)).toBe(String(cap() - 16));
    });
  });

  it('lets go of the window and the cursor when unmounted mid-drag', () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Harness />);
    startDrag();
    unmount();
    expect(document.body.style.cursor).toBe('');
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel']),
    );
  });

  it('offers no handle while inert', () => {
    render(<Harness inert />);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('leaves a rail without `resize` on its fixed column', () => {
    render(
      <BoardRail
        side="right"
        width="wide"
        title="Assistant"
        collapsed={false}
        onToggle={() => undefined}
        expandLabel="Expand dock"
        collapseLabel="Collapse dock"
      >
        <p>Chat</p>
      </BoardRail>,
    );
    const assistant = screen.getByRole('complementary', { name: 'Assistant' });
    expect(assistant).toHaveClass('w-96');
    expect(assistant.style.width).toBe('');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});
