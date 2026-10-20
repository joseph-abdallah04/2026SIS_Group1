import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { portalPosition, Tooltip } from './Tooltip';

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

  // For a control in something that scrolls or clips, such as the lobby's info card.
  describe('drawn on the page', () => {
    function openPortalled() {
      vi.useFakeTimers();
      render(
        <div data-testid="card">
          <Tooltip label="Show the code full-screen" placement="bottom" portal>
            <button type="button">Present</button>
          </Tooltip>
        </div>,
      );
      const button = screen.getByRole('button', { name: 'Present' });
      fireEvent.pointerEnter(button);
      act(() => {
        vi.advanceTimersByTime(250);
      });
      return button;
    }

    it('puts the bubble on the page, outside whatever holds the control', () => {
      openPortalled();
      const bubble = tip();
      expect(bubble).toHaveTextContent('Show the code full-screen');
      expect(bubble?.parentElement).toBe(document.body);
      expect(screen.getByTestId('card')).not.toContainElement(bubble as HTMLElement);
      expect(bubble).toHaveClass('fixed');
    });

    it('goes as soon as the page scrolls', () => {
      openPortalled();
      expect(tip()).not.toBeNull();
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
      expect(tip()).toBeNull();
    });
  });
});

describe('portalPosition', () => {
  const viewport = { width: 1000, height: 800 };
  const trigger = (left: number, top: number) => ({
    left,
    top,
    right: left + 32,
    bottom: top + 32,
    width: 32,
    height: 32,
  });

  it('centres the bubble under its control', () => {
    expect(
      portalPosition(trigger(400, 100), { width: 100, height: 20 }, 'bottom', viewport),
    ).toEqual({ left: 366, top: 138 });
  });

  it('slides back inside the window rather than over its edge', () => {
    // Centred, it would end at 1036: past the right edge.
    expect(
      portalPosition(trigger(950, 100), { width: 140, height: 20 }, 'bottom', viewport).left,
    ).toBe(1000 - 140 - 8);
    expect(
      portalPosition(trigger(0, 100), { width: 140, height: 20 }, 'bottom', viewport).left,
    ).toBe(8);
    // Above a control at the very top, it stays on screen.
    expect(portalPosition(trigger(400, 0), { width: 100, height: 20 }, 'top', viewport).top).toBe(
      8,
    );
  });
});
