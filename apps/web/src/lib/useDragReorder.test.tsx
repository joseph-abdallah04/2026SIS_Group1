import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REORDER_MS } from './dragReorder';
import { useDragReorder } from './useDragReorder';

function List() {
  const [ids, setIds] = useState(['a', 'b', 'c']);
  const drag = useDragReorder({
    attribute: 'data-row',
    onMove: (id, to) =>
      setIds((current) => {
        const next = current.filter((x) => x !== id);
        next.splice(to, 0, id);
        return next;
      }),
  });
  return (
    <ul>
      {ids.map((id) => (
        <li key={id} data-row={id} data-testid={`row-${id}`} style={drag.rowStyle(id)}>
          <button type="button" aria-label={`Move ${id}`} {...drag.handleProps(id)} />
          {id}
        </li>
      ))}
    </ul>
  );
}

const order = () => screen.getAllByRole('listitem').map((row) => row.textContent);

describe('useDragReorder with motion', () => {
  beforeEach(() => {
    // Motion allowed: the drop eases into place before the order changes.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error -- the suite runs without one; put that back.
    delete window.matchMedia;
  });

  it('slides the passed rows aside, then changes the order once the row has settled', () => {
    render(<List />);
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      screen.getByTestId(`row-${id}`).getBoundingClientRect = () =>
        new DOMRect(0, index * 50, 300, 40);
    }
    const handle = screen.getByRole('button', { name: 'Move a' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 75 });
    // Past b's middle: b slides up by a's height (jsdom has no row gap), and
    // a follows the pointer.
    expect(screen.getByTestId('row-b').style.transform).toBe('translateY(-40px)');
    expect(screen.getByTestId('row-a').style.transform).toBe('translateY(55px)');

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 75 });
    // Easing into the gap: the order has not changed yet.
    expect(screen.getByTestId('row-a').style.transform).toBe('translateY(50px)');
    expect(order()).toEqual(['a', 'b', 'c']);

    act(() => vi.advanceTimersByTime(REORDER_MS));
    expect(order()).toEqual(['b', 'a', 'c']);
    expect(screen.getByTestId('row-a').style.transform).toBe('');
  });

  // The handle can slide out from under the pointer (a scroll, a row held at
  // its limit): a let-go anywhere still ends the drag.
  it('ends the drag wherever the pointer is let go', () => {
    render(<List />);
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      screen.getByTestId(`row-${id}`).getBoundingClientRect = () =>
        new DOMRect(0, index * 50, 300, 40);
    }
    const handle = screen.getByRole('button', { name: 'Move a' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(document.body, { pointerId: 1, clientY: 75 });
    fireEvent.pointerUp(document.body, { pointerId: 1, clientY: 75 });
    act(() => vi.advanceTimersByTime(REORDER_MS));

    expect(order()).toEqual(['b', 'a', 'c']);
  });

  // A list scrolled under a held row moves the rows, not the pointer: the row
  // lands where the pointer is over the list, not where it was on the screen.
  it('counts a scroll under the held row as travel', () => {
    render(<List />);
    let scrolled = 0;
    const list = screen.getByRole('list');
    list.getBoundingClientRect = () => new DOMRect(0, -scrolled, 300, 150);
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      screen.getByTestId(`row-${id}`).getBoundingClientRect = () =>
        new DOMRect(0, index * 50 - scrolled, 300, 40);
    }
    const handle = screen.getByRole('button', { name: 'Move a' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(document.body, { pointerId: 1, clientY: 30 });
    // The list scrolls 80px up under a still pointer: a is now over c's place.
    scrolled = 80;
    fireEvent.scroll(window);
    fireEvent.pointerUp(document.body, { pointerId: 1, clientY: 30 });
    act(() => vi.advanceTimersByTime(REORDER_MS));

    expect(order()).toEqual(['b', 'c', 'a']);
  });

  it('eases a row dropped where it started back home, changing nothing', () => {
    render(<List />);
    const handle = screen.getByRole('button', { name: 'Move b' });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 70 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 80 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 80 });
    act(() => vi.advanceTimersByTime(REORDER_MS));

    expect(order()).toEqual(['a', 'b', 'c']);
  });
});
