import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tooltip } from './Tooltip';

afterEach(() => {
  vi.useRealTimers();
});

function tip() {
  return document.querySelector('[role="presentation"]');
}

describe('Tooltip', () => {
  it('opens after a short delay on hover', () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Bring to front">
        <button type="button">Layer</button>
      </Tooltip>,
    );

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Layer' }));
    expect(tip()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(tip()).toHaveTextContent('Bring to front');
  });

  it('cancels the open delay when it leaves the page', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <Tooltip label="Align">
        <button type="button">Align</button>
      </Tooltip>,
    );

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Align' }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
