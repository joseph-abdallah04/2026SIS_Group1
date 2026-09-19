import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoardItem } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import { ProposalCard } from './ProposalCard';

function item(artifactJson: BoardItem['artifactJson'], type: BoardItem['type']): BoardItem {
  return {
    id: 'proposal-1',
    questionId: 'question-1',
    authorId: 'user-1',
    authorName: 'Alice',
    type,
    artifactJson,
    x: 0,
    y: 0,
    createdAt: '2026-09-17T09:24:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    z: 0,
    reactions: [],
  };
}

const diagram = item(
  {
    type: 'diagram',
    nodes: [{ id: 'n1', label: 'Ledger', x: 24, y: 24, shape: 'box' }],
    edges: [],
  },
  'diagram',
);

const drawing = item(
  { type: 'drawing', svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4" /></svg>' },
  'drawing',
);

const sticky = item({ type: 'sticky', text: 'Ship the API', color: 'yellow' }, 'sticky');

const enlargeButton = () => screen.getByRole('button', { name: 'Enlarge diagram by Alice' });
/** The shape the artwork is drawn in, as width over height. */
function artworkShape(): number {
  const frame = screen.getByRole('dialog').firstElementChild as HTMLElement;
  const [width, height] = frame.style.aspectRatio.split('/').map((part) => Number(part.trim()));
  return height ? width! / height : width!;
}

/** The frame a press zooms, and the artwork that moves inside it. */
const zoomFrame = () => screen.getByRole('button', { name: /^Zoom/ });
const artworkLayer = () => zoomFrame().firstElementChild as HTMLElement;

/** jsdom lays nothing out, so the frame is given a size to zoom about. */
function frameOf(width = 600, height = 450) {
  vi.spyOn(zoomFrame(), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, width, height));
}

describe('proposal enlarge', () => {
  // The card shows a whole canvas at the width of a card. This opens the same
  // canvas at a size its labels can be read at.
  it('opens the canvas over the board, with the card and its byline intact', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProposalCard item={diagram} />);
    const onCard = container.querySelectorAll('svg').length;

    await user.click(enlargeButton());

    const preview = screen.getByRole('dialog', { name: 'diagram by Alice' });
    expect(preview).toHaveTextContent('Alice');
    // Whatever clock the viewer keeps, the byline gives the time it was posted.
    expect(preview.textContent).toMatch(/\d{2}:\d{2}/);
    // Drawn again in the preview's frame rather than moved out of the card.
    expect(preview.querySelectorAll('svg').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg')).toHaveLength(onCard);
  });

  // The drawing is what somebody wants a closer look at, so the drawing is
  // what they press: the mark in the corner is for finding it, not the only way.
  it('opens on a press of the artwork itself', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProposalCard item={diagram} />);

    await user.click(container.querySelector('[data-card-plate]')!);

    expect(screen.getByRole('dialog', { name: 'diagram by Alice' })).toBeInTheDocument();
  });

  // A card is dragged from anywhere on it, and the plate is most of it.
  it('is not opened by a drag that crossed the artwork', () => {
    const { container } = render(<ProposalCard item={diagram} />);
    const plate = container.querySelector('[data-card-plate]')!;
    const card = container.querySelector('article')!;

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100, isPrimary: true });
    fireEvent.click(plate, { clientX: 240, clientY: 180 });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leaves the artwork alone where a press on the card means something else', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProposalCard item={diagram} openOnArtworkPress={false} />);

    expect(container.querySelector('[data-card-plate]')).not.toHaveClass('cursor-pointer');
    await user.click(container.querySelector('[data-sticky-note], article')!);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a drawing too', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={drawing} />);

    await user.click(screen.getByRole('button', { name: 'Enlarge drawing by Alice' }));

    const preview = screen.getByRole('dialog', { name: 'drawing by Alice' });
    expect(preview.querySelector('img')).toHaveAttribute('alt', 'Drawing by Alice');
  });

  it.each([
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: 'Close' })),
    ],
  ])('closes on %s, handing focus back to the card', async (_, close) => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);

    await user.click(enlargeButton());
    await close(user);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(enlargeButton()).toHaveFocus();
  });

  // The close is drawn over the frame, and the frame is itself a button that
  // captures the pointer and zooms. Inside it, a press on the close was
  // retargeted to the frame and zoomed instead of closing, and Enter went the
  // same way through the frame's key handler.
  it('keeps the close out of the zoom control, so pressing it cannot zoom', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);
    await user.click(enlargeButton());

    const zoom = screen.getByRole('button', { name: 'Zoom in' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(zoom.contains(close)).toBe(false);

    close.focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // The board is not dimmed or locked behind it, so a press out there puts the
  // preview away and still does whatever it was a press on.
  it('closes on a press anywhere else, which still lands where it was aimed', async () => {
    const user = userEvent.setup();
    const onBoard = vi.fn();
    render(
      <>
        <ProposalCard item={diagram} />
        <button type="button" onClick={onBoard}>
          Something on the board
        </button>
      </>,
    );

    await user.click(enlargeButton());
    await user.click(screen.getByRole('button', { name: 'Something on the board' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onBoard).toHaveBeenCalledTimes(1);
  });

  // A card is dragged from anywhere on it, and pressed to shortlist it.
  it('keeps a press on the button to the button', () => {
    const onPointerDown = vi.fn();
    const onClick = vi.fn();
    render(
      <div onPointerDown={onPointerDown} onClick={onClick}>
        <ProposalCard item={diagram} />
      </div>,
    );

    fireEvent.pointerDown(enlargeButton());
    fireEvent.click(enlargeButton());

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  // One frame for every proposal. The artwork is scaled to fit whatever frame
  // it is given, so a frame that took each canvas's own shape changed size with
  // every proposal opened and bought little for it.
  it('opens in the same frame whatever shape the canvas is', async () => {
    const user = userEvent.setup();
    const canvas = (far: { x: number; y: number }) =>
      item(
        {
          type: 'diagram',
          nodes: [
            { id: 'a', label: 'One', x: 0, y: 0, shape: 'box' },
            { id: 'b', label: 'Two', x: far.x, y: far.y, shape: 'box' },
          ],
          edges: [],
        },
        'diagram',
      );

    const wideView = render(<ProposalCard item={canvas({ x: 900, y: 0 })} />);
    await user.click(enlargeButton());
    const wide = { shape: artworkShape(), width: screen.getByRole('dialog').style.width };
    wideView.unmount();

    render(<ProposalCard item={canvas({ x: 0, y: 900 })} />);
    await user.click(enlargeButton());

    expect(wide.shape).toBeCloseTo(4 / 3, 5);
    expect(artworkShape()).toBeCloseTo(4 / 3, 5);
    expect(screen.getByRole('dialog').style.width).toBe(wide.width);
  });

  // A canvas is drawn for a canvas, so its labels are small on any card. A
  // press takes you in at the spot you pressed, the way an image viewer does.
  it('zooms in where it was pressed, and back out on the next press', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);
    await user.click(enlargeButton());
    frameOf();

    expect(zoomFrame()).toHaveAccessibleName('Zoom in');
    fireEvent.pointerDown(zoomFrame(), {
      pointerId: 1,
      clientX: 450,
      clientY: 100,
      isPrimary: true,
    });
    fireEvent.pointerUp(zoomFrame(), { pointerId: 1, clientX: 450, clientY: 100, isPrimary: true });

    // Taken in about that point: the half of the canvas it is on moves under it.
    expect(artworkLayer().style.transform).toBe('translate(-180px, 150px) scale(2.2)');
    expect(zoomFrame()).toHaveAccessibleName('Zoom out');

    fireEvent.pointerDown(zoomFrame(), {
      pointerId: 2,
      clientX: 300,
      clientY: 200,
      isPrimary: true,
    });
    fireEvent.pointerUp(zoomFrame(), { pointerId: 2, clientX: 300, clientY: 200, isPrimary: true });

    expect(artworkLayer().style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(zoomFrame()).toHaveAccessibleName('Zoom in');
  });

  // A right press belongs to the menu it opens, not to the canvas.
  it('is not zoomed by a press of any other button', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);
    await user.click(enlargeButton());
    frameOf();

    fireEvent.pointerDown(zoomFrame(), { pointerId: 1, button: 2, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(zoomFrame(), { pointerId: 1, button: 2, clientX: 300, clientY: 200 });

    expect(artworkLayer().style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(zoomFrame()).toHaveAccessibleName('Zoom in');
  });

  it('moves the canvas under a drag while it is in close, and stays in', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);
    await user.click(enlargeButton());
    frameOf();
    fireEvent.pointerDown(zoomFrame(), {
      pointerId: 1,
      clientX: 300,
      clientY: 225,
      isPrimary: true,
    });
    fireEvent.pointerUp(zoomFrame(), { pointerId: 1, clientX: 300, clientY: 225, isPrimary: true });

    fireEvent.pointerDown(zoomFrame(), {
      pointerId: 2,
      clientX: 300,
      clientY: 225,
      isPrimary: true,
    });
    fireEvent.pointerMove(zoomFrame(), {
      pointerId: 2,
      clientX: 250,
      clientY: 195,
      isPrimary: true,
    });
    fireEvent.pointerUp(zoomFrame(), { pointerId: 2, clientX: 250, clientY: 195, isPrimary: true });

    expect(artworkLayer().style.transform).toBe('translate(-50px, -30px) scale(2.2)');
    // A drag is not a press, so it did not take the canvas back out.
    expect(zoomFrame()).toHaveAccessibleName('Zoom out');
  });

  // However far it is dragged, the artwork keeps an edge in the frame.
  it('holds the canvas within its frame however far it is dragged', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);
    await user.click(enlargeButton());
    frameOf();
    fireEvent.pointerDown(zoomFrame(), {
      pointerId: 1,
      clientX: 300,
      clientY: 225,
      isPrimary: true,
    });
    fireEvent.pointerUp(zoomFrame(), { pointerId: 1, clientX: 300, clientY: 225, isPrimary: true });

    fireEvent.pointerDown(zoomFrame(), {
      pointerId: 2,
      clientX: 300,
      clientY: 225,
      isPrimary: true,
    });
    fireEvent.pointerMove(zoomFrame(), {
      pointerId: 2,
      clientX: 9000,
      clientY: 9000,
      isPrimary: true,
    });

    // Half of what the zoom added, each way: 600 * 1.2 / 2 and 450 * 1.2 / 2.
    expect(artworkLayer().style.transform).toBe('translate(360px, 270px) scale(2.2)');
  });

  it('zooms from the keyboard too, about the middle of the frame', async () => {
    const user = userEvent.setup();
    render(<ProposalCard item={diagram} />);
    await user.click(enlargeButton());
    frameOf();

    zoomFrame().focus();
    await user.keyboard('{Enter}');

    expect(artworkLayer().style.transform).toBe('translate(0px, 0px) scale(2.2)');
  });

  it('leaves a sticky alone, since its card already shows every word', () => {
    render(<ProposalCard item={sticky} />);

    expect(screen.queryByRole('button', { name: /^Enlarge/ })).toBeNull();
  });

  // On a ballot the card is itself the vote button, and a button inside a
  // button is neither one thing nor the other.
  it('offers nothing to press where the card is itself a press', () => {
    render(<ProposalCard item={diagram} interactive={false} />);

    expect(screen.queryByRole('button', { name: /^Enlarge/ })).toBeNull();
  });

  // Proposed before strokes were stored: there is nothing to open.
  it('leaves a drawing with nothing drawn in it alone', () => {
    render(<ProposalCard item={item({ type: 'drawing', svg: '' }, 'drawing')} />);

    expect(screen.queryByRole('button', { name: /^Enlarge/ })).toBeNull();
  });
});
