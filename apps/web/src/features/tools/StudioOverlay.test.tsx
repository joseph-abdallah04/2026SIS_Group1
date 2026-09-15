import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudioActions, StudioOverlay, useReportStudioStatus } from './StudioOverlay';

/** An editor with state of its own, to show peeking does not throw it away. */
function Canvas() {
  const [count, setCount] = useState(0);
  useReportStudioStatus([`${count} ${count === 1 ? 'element' : 'elements'}`, '1 arrow']);
  return (
    <button type="button" onClick={() => setCount((current) => current + 1)}>
      Add element ({count})
    </button>
  );
}

function renderStudio({
  withBoard = false,
  declinesToClose = false,
}: { withBoard?: boolean; declinesToClose?: boolean } = {}) {
  const onClose = vi.fn(() => (declinesToClose ? false : undefined));
  const page = (proposed: boolean) => (
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
      <StudioOverlay onClose={onClose} proposed={proposed} title="New studio">
        <Canvas />
      </StudioOverlay>
    </div>
  );
  const view = render(page(false));
  const studio = screen.getByRole('dialog', { name: 'New studio' }) as HTMLDialogElement;
  /** Tells the same studio that what was made has gone onto the board. */
  const propose = () => view.rerender(page(true));
  return { onClose, propose, studio };
}

/** The face that rests on the board, only there while the studio is down. */
const bar = () => screen.queryByRole('region', { name: 'Minimised studio' });

const phaseOf = (studio: HTMLElement) => studio.getAttribute('data-phase');

type PointerKind = 'pointerDown' | 'pointerMove' | 'pointerUp';

/**
 * A pointer event at a stated time. A flick is judged on how fast the pointer
 * moved, and events fired without a time share whatever millisecond they land
 * in, which differs from machine to machine; stating it keeps the outcome the
 * same on every one.
 */
function pointer(kind: PointerKind, target: Element, clientY: number, at: number) {
  const event = createEvent[kind](target, { pointerId: 1, isPrimary: true, button: 0, clientY });
  // Offset from zero: React reads a timeStamp of 0 as missing and uses the clock.
  Object.defineProperty(event, 'timeStamp', { value: 1000 + at });
  fireEvent(target, event);
}

/**
 * Where a studio resting at the bottom has been drawn: its open position, and
 * where it has been slid down to. jsdom lays nothing out, so a drag has nothing
 * to measure without this.
 */
function restAt(
  studio: HTMLElement,
  { openTop, restingTop }: { openTop: number; restingTop: number },
) {
  Object.defineProperty(studio, 'offsetTop', { configurable: true, get: () => openTop });
  vi.spyOn(studio, 'getBoundingClientRect').mockReturnValue({
    top: restingTop,
    left: 0,
    width: 900,
    height: 700,
    right: 900,
    bottom: restingTop + 700,
    x: 0,
    y: restingTop,
    toJSON: () => ({}),
  });
}

describe('studio overlay', () => {
  it('opens over the board with a way to peek at it', () => {
    const { studio } = renderStudio();

    expect(studio.open).toBe(true);
    expect(phaseOf(studio)).toBe('open');
    expect(screen.getByRole('button', { name: 'Peek at board' })).toBeInTheDocument();
    expect(bar()).toBeNull();
  });

  // Peeking steps aside for the board; it does not close anything. The canvas
  // keeps its undo history, zoom and selection only if it is never unmounted.
  it('rests at the bottom saying what is waiting, and keeps the canvas as it was', async () => {
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Add element (0)' }));
    await user.click(screen.getByRole('button', { name: 'Add element (1)' }));
    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(phaseOf(studio)).toBe('peeking');
    expect(studio).toHaveClass('rt-studio-peeked');
    const minimised = bar();
    expect(minimised).not.toBeNull();
    expect(minimised!.textContent).toContain('Creative studio · Minimised');
    expect(minimised!.textContent).toContain('New studio');
    expect(minimised!.textContent).toContain('New studio · 2 elements, 1 arrow');
    // The canvas below the bottom of the window is out of reach meanwhile.
    expect(
      screen.getByRole('button', { name: 'Add element (2)' }).closest('[inert]'),
    ).not.toBeNull();
    // The way back is focused, so it is one key away.
    expect(within(minimised!).getByRole('button', { name: /Back to studio/ })).toHaveFocus();

    await user.click(within(minimised!).getByRole('button', { name: /Back to studio/ }));

    expect(phaseOf(studio)).toBe('open');
    expect(studio.open).toBe(true);
    expect(bar()).toBeNull();
    // Still the same canvas, never remounted, so its count is where it was.
    const canvas = screen.getByRole('button', { name: 'Add element (2)' });
    expect(canvas.closest('[inert]')).toBeNull();
    // And focus is back where it was when the studio stepped aside: on Peek.
    expect(screen.getByRole('button', { name: 'Peek at board' })).toHaveFocus();
  });

  // Resting on the board loses nothing, and a diagram is kept as a draft, so
  // there is nothing about saving for it to say.
  it('says what the canvas holds, and nothing about saving', async () => {
    const user = userEvent.setup();
    renderStudio();

    await user.click(screen.getByRole('button', { name: 'Add element (0)' }));
    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(bar()!.textContent).toContain('1 element, 1 arrow');
    expect(bar()!.textContent).not.toMatch(/unsaved/i);
  });

  it('comes back on Escape pressed anywhere on the board', async () => {
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));
    await user.keyboard('{Escape}');

    expect(phaseOf(studio)).toBe('open');
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

    expect(phaseOf(studio)).toBe('peeking');
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
    expect(phaseOf(studio)).toBe('open');
    expect(onClose).not.toHaveBeenCalled();
    expect(bar()).toBeNull();
  });

  // Like the sticky popup, the studio is done once its work is on the board. It
  // goes back to the board by itself rather than stopping to say so.
  it('closes by itself once what was made has been proposed', () => {
    const { onClose, propose } = renderStudio();
    expect(onClose).not.toHaveBeenCalled();

    propose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves the board through Back to pinboard, as before', async () => {
    const user = userEvent.setup();
    const { onClose } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The pinboard sits beside the agenda. Up, the studio is wide and centred on
  // the window; resting at the bottom, it narrows into the board's own column
  // so the agenda stays uncovered while the board is looked at.
  it('rests in the column of the board, and opens wide and centred', async () => {
    const user = userEvent.setup();
    const { studio } = renderStudio({ withBoard: true });
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

    expect(studio).toHaveClass('rt-studio-columned', 'rt-studio-peeked');
    // A 12px gutter either side of the 900px board.
    expect(studio.style.getPropertyValue('--studio-rest-left')).toBe('300px');
    expect(studio.style.getPropertyValue('--studio-rest-width')).toBe('876px');
    expect(studio).toContainElement(bar());
    expect(screen.getByTestId('agenda')).not.toContainElement(studio);

    await user.click(within(bar()!).getByRole('button', { name: /Back to studio/ }));

    // Up again, centred on the window rather than held to the board's column.
    expect(studio).toHaveClass('rt-studio-columned');
    expect(studio).not.toHaveClass('rt-studio-peeked');
  });
});

describe("the editor's actions", () => {
  function Actions({ error = null }: { error?: string | null }) {
    return (
      <StudioActions error={error} summary="2 elements · 1 arrow">
        <button type="submit">Propose</button>
      </StudioActions>
    );
  }

  // In the header rather than a footer under the canvas, so the canvas has
  // that height.
  it('go in the studio header, with what the canvas holds', () => {
    render(
      <StudioOverlay onClose={vi.fn()} title="New studio">
        <Actions />
      </StudioOverlay>,
    );

    const header = screen.getByRole('button', { name: 'Peek at board' }).closest('header')!;
    expect(within(header).getByRole('button', { name: 'Propose' })).toBeInTheDocument();
    expect(within(header).getByText('2 elements · 1 arrow')).toBeInTheDocument();
    expect(document.querySelector('footer')).toBeNull();
  });

  it('say why a proposal did not go through in place of the summary', () => {
    render(
      <StudioOverlay onClose={vi.fn()} title="New studio">
        <Actions error="Add an element before proposing." />
      </StudioOverlay>,
    );

    const header = screen.getByRole('button', { name: 'Peek at board' }).closest('header')!;
    expect(within(header).getByRole('alert')).toHaveTextContent('Add an element before proposing.');
    expect(within(header).queryByText('2 elements · 1 arrow')).toBeNull();
  });

  // The header's slot is filled by a ref, so the first render inside a studio
  // always sees it empty. That render used to put the actions in a footer under
  // the canvas, which showed for a frame before they moved into the header.
  it('never show a footer inside the studio, even before its header is ready', () => {
    const footersSeen: number[] = [];
    function Watch() {
      useLayoutEffect(() => {
        footersSeen.push(document.querySelectorAll('footer').length);
      });
      return null;
    }

    render(
      <StudioOverlay onClose={vi.fn()} title="New studio">
        <Actions />
        <Watch />
      </StudioOverlay>,
    );

    expect(footersSeen.length).toBeGreaterThan(0);
    expect(footersSeen.every((count) => count === 0)).toBe(true);
  });

  it('stay in a footer outside the studio, where there is no header', () => {
    render(<Actions />);

    const footer = document.querySelector('footer')!;
    expect(within(footer).getByRole('button', { name: 'Propose' })).toBeInTheDocument();
    expect(within(footer).getByText('2 elements · 1 arrow')).toBeInTheDocument();
  });
});

describe('dragging the studio up', () => {
  async function peeked() {
    const user = userEvent.setup();
    const rendered = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Peek at board' }));
    // Up, it sits 32px from the top; resting, it has slid down to 700px.
    restAt(rendered.studio, { openTop: 32, restingTop: 700 });
    return rendered;
  }

  it('follows the pointer, and comes up when let go a third of the way', async () => {
    const { studio } = await peeked();
    const face = bar()!;

    pointer('pointerDown', face, 720, 0);
    pointer('pointerMove', face, 600, 200);
    pointer('pointerMove', face, 480, 400);

    expect(phaseOf(studio)).toBe('dragging');
    // 240px of the 668px between resting and up.
    expect(Number(studio.style.getPropertyValue('--studio-lift'))).toBeCloseTo(240 / 668);

    // Held still for a moment first, so this is the distance and not a flick.
    pointer('pointerUp', face, 480, 700);

    expect(phaseOf(studio)).toBe('open');
    expect(studio.style.getPropertyValue('--studio-lift')).toBe('');
    expect(bar()).toBeNull();
  });

  it('settles back down when lifted a little and lowered again', async () => {
    const { studio } = await peeked();
    const face = bar()!;

    pointer('pointerDown', face, 720, 0);
    pointer('pointerMove', face, 660, 50);
    pointer('pointerMove', face, 690, 100);
    pointer('pointerUp', face, 690, 130);

    expect(phaseOf(studio)).toBe('peeking');
    expect(studio.style.getPropertyValue('--studio-lift')).toBe('');
    expect(bar()).not.toBeNull();
  });

  // What failed on CI: a quick first hop up, then a move back down reported in
  // the same millisecond. The first hop's speed used to stand, and the drag was
  // let go as a flick however low it ended.
  it('does not take a fast first hop, lowered again at once, for a flick', async () => {
    const { studio } = await peeked();
    const face = bar()!;

    pointer('pointerDown', face, 720, 0);
    pointer('pointerMove', face, 660, 1);
    pointer('pointerMove', face, 690, 1);
    pointer('pointerUp', face, 690, 1);

    expect(phaseOf(studio)).toBe('peeking');
  });

  it('comes up when flicked, however little it rose', async () => {
    const { studio } = await peeked();
    const face = bar()!;

    pointer('pointerDown', face, 720, 0);
    pointer('pointerMove', face, 700, 10);
    pointer('pointerMove', face, 640, 20);
    // 80px in 24ms, well under a third of the way.
    pointer('pointerUp', face, 640, 24);

    expect(phaseOf(studio)).toBe('open');
  });

  it('does not count a rise the pointer then rested after as a flick', async () => {
    const { studio } = await peeked();
    const face = bar()!;

    pointer('pointerDown', face, 720, 0);
    pointer('pointerMove', face, 640, 20);
    pointer('pointerUp', face, 640, 400);

    expect(phaseOf(studio)).toBe('peeking');
  });

  it('is not a drag when the press never moves', async () => {
    const { studio } = await peeked();
    const face = bar()!;

    fireEvent.pointerDown(face, { pointerId: 1, isPrimary: true, button: 0, clientY: 720 });
    fireEvent.pointerMove(face, { pointerId: 1, isPrimary: true, clientY: 718 });
    fireEvent.pointerUp(face, { pointerId: 1, isPrimary: true, clientY: 718 });

    expect(phaseOf(studio)).toBe('peeking');
  });

  it('leaves a press on Back to studio to the button', async () => {
    const { studio } = await peeked();
    const button = within(bar()!).getByRole('button', { name: /Back to studio/ });

    fireEvent.pointerDown(button, { pointerId: 1, isPrimary: true, button: 0, clientY: 720 });
    fireEvent.pointerMove(button, { pointerId: 1, isPrimary: true, clientY: 400 });

    expect(phaseOf(studio)).toBe('peeking');
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
    expect(studio).not.toHaveClass('rt-studio-slide');

    await waitFor(() => expect(studio).not.toHaveClass('rt-studio-appear'));
  });

  // Sliding down to rest is what says where the studio went, and the board face
  // only takes over once it has arrived.
  it('slides the studio down to rest, and back up again', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Peek at board' }));

    expect(phaseOf(studio)).toBe('minimising');
    expect(studio).toHaveClass('rt-studio-peeked', 'rt-studio-slide');
    expect(bar()).toBeNull();

    await waitFor(() => expect(bar()).not.toBeNull());
    expect(phaseOf(studio)).toBe('peeking');
    expect(studio).not.toHaveClass('rt-studio-slide');

    await user.click(within(bar()!).getByRole('button', { name: /Back to studio/ }));

    expect(phaseOf(studio)).toBe('restoring');
    expect(studio).toHaveClass('rt-studio-slide');
    expect(studio).not.toHaveClass('rt-studio-peeked');
    // From the button it starts from rest, so it eases in as well as out.
    expect(studio).not.toHaveClass('rt-studio-released');

    await waitFor(() => expect(phaseOf(studio)).toBe('open'));
    expect(studio).not.toHaveClass('rt-studio-slide');
  });

  // Let go too low, it slides back down rather than jumping there.
  it('slides back down to rest when a drag is let go too low', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio } = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Peek at board' }));
    await waitFor(() => expect(phaseOf(studio)).toBe('peeking'));
    restAt(studio, { openTop: 32, restingTop: 700 });

    const face = bar()!;
    pointer('pointerDown', face, 720, 0);
    pointer('pointerMove', face, 700, 50);
    pointer('pointerMove', face, 710, 100);
    pointer('pointerUp', face, 710, 130);

    expect(phaseOf(studio)).toBe('dropping');
    // Already moving when let go, so it eases out from there.
    expect(studio).toHaveClass('rt-studio-peeked', 'rt-studio-slide', 'rt-studio-released');
    await waitFor(() => expect(phaseOf(studio)).toBe('peeking'));
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

  it('fades out back to the board once what was made has been proposed', async () => {
    motion({ reduced: false });
    const { studio, onClose, propose } = renderStudio();
    await waitFor(() => expect(phaseOf(studio)).toBe('open'));

    propose();

    expect(studio).toHaveClass('rt-studio-leave');
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  // If the tool declines to close, a faded-out studio would be left open and
  // invisible. It is shown again instead.
  // Closed, it stays faded out until it is gone. The router closes the tool a
  // render or more later, and showing the studio again meanwhile flashed it up
  // for a frame after every close.
  it('stays faded out once it has closed the tool', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio, onClose } = renderStudio();

    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(studio).toHaveClass('rt-studio-leave');
    expect(phaseOf(studio)).toBe('leaving');
  });

  it('comes back into view if the tool declines to close', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    const { studio, onClose } = renderStudio({ declinesToClose: true });

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

    expect(phaseOf(studio)).toBe('peeking');
    expect(bar()).not.toBeNull();
    expect(studio).not.toHaveClass('rt-studio-slide');

    await user.click(within(bar()!).getByRole('button', { name: /Back to studio/ }));

    expect(phaseOf(studio)).toBe('open');
    expect(bar()).toBeNull();
    expect(studio).not.toHaveClass('rt-studio-slide');
  });
});
