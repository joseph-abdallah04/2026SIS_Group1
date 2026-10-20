import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomSetMoment, ROOM_SET_MS } from './RoomSetMoment';

describe('RoomSetMoment', () => {
  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error -- the suite runs without one; put that back.
    delete window.matchMedia;
  });

  it('goes straight on where there is no motion', () => {
    const onDone = vi.fn();
    render(<RoomSetMoment title="Roadmap" code="K7NP-3WQZ" onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('plays the scene, with the title and code, then goes on', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RoomSetMoment title="Roadmap" code="K7NP-3WQZ" onDone={onDone} />);

    expect(screen.getByRole('status')).toHaveTextContent('Your room is open');
    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'K7NP-3WQZ' })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(ROOM_SET_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // Both would otherwise ask for the waiting room: the draft page would load it twice.
  it('goes on once only, whether by "Go now" or the end of the scene', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RoomSetMoment title="Roadmap" code="K7NP-3WQZ" onDone={onDone} />);

    act(() => screen.getByRole('button', { name: 'Go now' }).click());
    act(() => vi.advanceTimersByTime(ROOM_SET_MS));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // Code review: the page under the scene could still be used from the
  // keyboard, and Enter on "Open the room" would have opened a second room.
  it('is modal while it plays: it takes focus, and Tab stays in it', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Open the room</button>
        <RoomSetMoment title="Roadmap" code="K7NP-3WQZ" onDone={vi.fn()} />
      </>,
    );

    expect(screen.getByRole('dialog', { name: 'Roadmap' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Go now' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Go now' })).toHaveFocus();
  });

  it('goes now when asked', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<RoomSetMoment title="Roadmap" code={null} onDone={onDone} />);

    await user.click(screen.getByRole('button', { name: 'Go now' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
