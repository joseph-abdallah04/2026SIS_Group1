import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudioOverlay, useReportStudioStatus } from './StudioOverlay';

/** An editor with state of its own, to show peeking does not throw it away. */
function Canvas() {
  const [count, setCount] = useState(0);
  useReportStudioStatus([`${count} ${count === 1 ? 'element' : 'elements'}`, '1 arrow'], count > 0);
  return (
    <button type="button" onClick={() => setCount((current) => current + 1)}>
      Add element ({count})
    </button>
  );
}

function renderStudio({ withBoard = false }: { withBoard?: boolean } = {}) {
  const onClose = vi.fn();
  render(
    <div>
      <label>
        Board note
        <textarea />
      </label>
      {withBoard ? (
        <div data-testid="page">
          <aside data-testid="agenda">Agenda</aside>
          <div data-board-frame data-testid="board-frame" />
        </div>
      ) : null}
      <StudioOverlay onClose={onClose} title="New studio">
        <Canvas />
      </StudioOverlay>
    </div>,
  );
  const studio = screen.getByRole('dialog', { name: 'New studio' }) as HTMLDialogElement;
  return { onClose, studio };
}

const bar = () => screen.queryByRole('region', { name: 'Minimised studio' });

describe('studio overlay', () => {
  it('opens over the board with a way to peek at it', () => {
    const { studio } = renderStudio();

    expect(studio.open).toBe(true);
    expect(screen.getByRole('button', { name: 'Peek at board' })).toBeInTheDocument();
    expect(bar()).toBeNull();
  });

  // Peeking steps aside for the board; it does not close anything. The canvas
  // keeps its undo history, zoom and selection only if it is never unmounted.
  it('minimises to a bar that says what is waiting, and keeps the canvas as it was', async () => {
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Add element (0)' }));
    await user.click(screen.getByRole('button', { name: 'Add element (1)' }));
    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(studio.open).toBe(false);
    const minimised = bar();
    expect(minimised).not.toBeNull();
    expect(minimised!.textContent).toContain('Creative studio · Minimised');
    expect(minimised!.textContent).toContain('New studio');
    expect(minimised!.textContent).toContain('2 elements, 1 arrow · unsaved');
    // The way back is focused, so it is one key away.
    expect(within(minimised!).getByRole('button', { name: /Back to studio/ })).toHaveFocus();

    await user.click(within(minimised!).getByRole('button', { name: /Back to studio/ }));

    expect(studio.open).toBe(true);
    expect(bar()).toBeNull();
    // Still the same canvas, never remounted, so its count is where it was.
    expect(screen.getByRole('button', { name: 'Add element (2)' })).toBeInTheDocument();
    // And focus is back where it was when the studio stepped aside: on Peek.
    expect(screen.getByRole('button', { name: 'Peek at board' })).toHaveFocus();
  });

  it('does not call a canvas with nothing changed unsaved', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(bar()!.textContent).toContain('0 elements, 1 arrow');
    expect(bar()!.textContent).not.toContain('unsaved');
  });

  it('comes back on Escape pressed anywhere on the board', async () => {
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));
    await user.keyboard('{Escape}');

    expect(studio.open).toBe(true);
    expect(bar()).toBeNull();
  });

  // A sticky being edited in place cancels on Escape. One press should not
  // also bring the studio back over it.
  it('leaves Escape to a field being typed into on the board', async () => {
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));
    await user.click(screen.getByRole('textbox', { name: 'Board note' }));
    await user.keyboard('{Escape}');

    expect(studio.open).toBe(false);
    expect(bar()).not.toBeNull();
  });

  // Escape inside the studio steps back out of whatever is in hand. Closing
  // the whole studio on the last of those presses made the key dangerous.
  it('still does not close on Escape while the studio is showing', async () => {
    const user = userEvent.setup();
    const { studio, onClose } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Add element (0)' }));
    await user.keyboard('{Escape}{Escape}{Escape}');

    expect(studio.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
  });

  it('leaves the board through Back to pinboard, as before', async () => {
    const user = userEvent.setup();
    const { onClose } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The pinboard sits beside the agenda. The bar sits at the very bottom of the
  // window, but only as wide as the board, so the agenda stays uncovered.
  it('sits at the bottom, as wide as the board and clear of the agenda', async () => {
    const user = userEvent.setup();
    renderStudio({ withBoard: true });
    vi.spyOn(screen.getByTestId('board-frame'), 'getBoundingClientRect').mockReturnValue({
      left: 288,
      width: 900,
      top: 56,
      height: 700,
      right: 1188,
      bottom: 756,
      x: 288,
      y: 56,
      toJSON: () => ({}),
    });

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    const minimised = bar()!;
    expect(minimised).toHaveClass('fixed', 'bottom-0');
    expect(minimised).toHaveStyle({ left: '288px', width: '900px' });
    expect(screen.getByTestId('agenda')).not.toContainElement(minimised);
  });
});

describe('studio overlay motion', () => {
  /** Answers media queries the way a browser would, with or without reduced motion. */
  function motion({ reduced }: { reduced: boolean }) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: reduced && query.includes('reduce'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  }

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  // Opening from a tool fades in, as the sticky popup does. The slide belongs to
  // coming back from a peek, when the studio really is down at the bottom.
  it('fades in when it opens', async () => {
    motion({ reduced: false });
    const { studio } = renderStudio();

    expect(studio.open).toBe(true);
    expect(studio).toHaveClass('rt-studio-appear');
    expect(studio).not.toHaveClass('rt-studio-restore');

    await waitFor(() => expect(studio).not.toHaveClass('rt-studio-appear'));
  });

  // Sliding down toward the bar is what says where the studio went, and it can
  // only be seen while the dialog is still open.
  it('slides the studio down to the bar, and back up out of it', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(studio.open).toBe(true);
    expect(studio).toHaveClass('rt-studio-minimise');
    expect(bar()).toBeNull();

    await waitFor(() => expect(bar()).not.toBeNull());
    expect(studio.open).toBe(false);
    expect(bar()).toHaveClass('rt-studio-dock-rise');

    await user.click(within(bar()!).getByRole('button', { name: /Back to studio/ }));

    // Open at once and sliding back up, while the bar slides away underneath.
    expect(studio.open).toBe(true);
    expect(studio).toHaveClass('rt-studio-restore');
    expect(bar()).toHaveClass('rt-studio-dock-drop');

    await waitFor(() => expect(bar()).toBeNull());
    expect(studio).not.toHaveClass('rt-studio-restore');
  });

  // Leaving fades out as the sticky popup does. The tool closes after the fade,
  // since the studio is gone the moment it does.
  it('fades out before it leaves by the back arrow', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio, onClose } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));

    expect(studio).toHaveClass('rt-studio-leave');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  // If the tool declines to close, a faded-out studio would be left open and
  // invisible. It is shown again instead.
  it('comes back into view if the tool declines to close', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio, onClose } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(studio.open).toBe(true);
    expect(studio).not.toHaveClass('rt-studio-leave');
  });

  it('steps aside and back at once for somebody who has asked for less motion', async () => {
    motion({ reduced: true });
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(studio.open).toBe(false);
    expect(bar()).not.toBeNull();
    expect(studio).not.toHaveClass('rt-studio-minimise');

    await user.click(within(bar()!).getByRole('button', { name: /Back to studio/ }));

    expect(studio.open).toBe(true);
    expect(bar()).toBeNull();
    expect(studio).not.toHaveClass('rt-studio-restore');
  });
});
