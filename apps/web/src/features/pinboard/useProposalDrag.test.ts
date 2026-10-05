import { act, renderHook } from '@testing-library/react';
import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { TINY_PNG } from '../tools/image/testImages';
import { useProposalDrag } from './useProposalDrag';

/** An image card: always 280 by 245, whatever the test environment can measure. */
function card(id: string, x: number, y: number): BoardItem {
  return {
    id,
    type: 'image',
    artifactJson: { type: 'image', src: TINY_PNG, width: 1, height: 1 },
    x,
    y,
  } as unknown as BoardItem;
}

/** Enough of a pointer event for the hook: where it is, and an element to capture on. */
function pointer(type: string, clientX: number, clientY: number) {
  const target = document.createElement('div');
  return {
    type,
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    target,
    currentTarget: {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      hasPointerCapture: () => true,
    },
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent<HTMLElement>;
}

type Commit = (id: string, at: { x: number; y: number }) => Promise<void>;

function renderDrag(items: BoardItem[], onCommit: Mock<Commit> = vi.fn<Commit>(async () => {})) {
  const onError = vi.fn();
  const onTap = vi.fn();
  const view = renderHook(() => useProposalDrag({ items, scale: 1, onCommit, onError, onTap }));
  const drag = (item: BoardItem, to: { x: number; y: number }, group?: BoardItem[]) => {
    const { dragHandlers } = view.result.current;
    act(() => dragHandlers.onPointerDown(item, pointer('pointerdown', 0, 0), group));
    act(() => view.result.current.dragHandlers.onPointerMove(pointer('pointermove', to.x, to.y)));
    act(() => view.result.current.dragHandlers.onPointerUp(pointer('pointerup', to.x, to.y)));
  };
  return { view, drag, onCommit, onError, onTap };
}

describe('useProposalDrag', () => {
  it('moves one card where it is let go', () => {
    const a = card('a', 100, 100);
    const { drag, onCommit } = renderDrag([a]);

    drag(a, { x: 40, y: 30 });

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('a', { x: 140, y: 130 });
  });

  // A selection moves as one: the same offset for every card in it.
  it('carries every card in the group by the same amount', () => {
    const a = card('a', 100, 100);
    const b = card('b', 600, 400);
    const c = card('c', 1200, 900);
    const { view, drag, onCommit } = renderDrag([a, b, c]);

    drag(b, { x: 50, y: -20 }, [a, b]);

    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledWith('a', { x: 150, y: 80 });
    expect(onCommit).toHaveBeenCalledWith('b', { x: 650, y: 380 });
    // Held where they landed until the board agrees, and the rest untouched.
    expect(view.result.current.positionOf(a)).toEqual({ x: 150, y: 80 });
    expect(view.result.current.positionOf(c)).toEqual({ x: 1200, y: 900 });
  });

  it('stops the whole group at the edge of the sheet', () => {
    const a = card('a', 50, 300);
    const b = card('b', 400, 300);
    const { drag, onCommit } = renderDrag([a, b]);

    drag(b, { x: -500, y: 0 }, [a, b]);

    // The left card reached the edge first, so both stop 50 to the left.
    expect(onCommit).toHaveBeenCalledWith('a', { x: 0, y: 300 });
    expect(onCommit).toHaveBeenCalledWith('b', { x: 350, y: 300 });
  });

  // Each card is its own write: one refused goes back, the rest stay, and
  // the group gets one notice however many were refused.
  it('puts back only the cards the server refused, with one notice', async () => {
    const a = card('a', 100, 100);
    const b = card('b', 600, 100);
    const onCommit = vi.fn<Commit>(async (id) => {
      if (id === 'b') throw new Error('Only the leader can move proposals');
    });
    const { view, drag, onError } = renderDrag([a, b], onCommit);

    drag(a, { x: 10, y: 10 }, [a, b]);
    await act(async () => {});

    expect(view.result.current.positionOf(a)).toEqual({ x: 110, y: 110 });
    expect(view.result.current.positionOf(b)).toEqual({ x: 600, y: 100 });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('counts a press that never moved as a tap, and sends nothing', () => {
    const a = card('a', 100, 100);
    const { view, onCommit, onTap } = renderDrag([a]);

    act(() => view.result.current.dragHandlers.onPointerDown(a, pointer('pointerdown', 0, 0)));
    act(() => view.result.current.dragHandlers.onPointerUp(pointer('pointerup', 1, 1)));

    expect(onTap).toHaveBeenCalledWith(a);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('marks every carried card as dragging while the group moves', () => {
    const a = card('a', 100, 100);
    const b = card('b', 600, 100);
    const c = card('c', 900, 100);
    const { view } = renderDrag([a, b, c]);

    act(() =>
      view.result.current.dragHandlers.onPointerDown(a, pointer('pointerdown', 0, 0), [a, b]),
    );
    act(() => view.result.current.dragHandlers.onPointerMove(pointer('pointermove', 20, 0)));

    expect(view.result.current.isDragging('a')).toBe(true);
    expect(view.result.current.isDragging('b')).toBe(true);
    expect(view.result.current.isDragging('c')).toBe(false);
  });
});
