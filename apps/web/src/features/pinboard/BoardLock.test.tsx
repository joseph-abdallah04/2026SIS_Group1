import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BoardLock, BoardLockControl, BoardLockToast } from './BoardLock';

describe('BoardLock', () => {
  it('is a toggle for the leader, pressed while the board is locked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<BoardLock locked onToggle={onToggle} busy={false} />);

    const toggle = screen.getByRole('button', { name: 'Board locked' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('shows the leader an unlocked board as not pressed', () => {
    render(<BoardLock locked={false} onToggle={vi.fn()} busy={false} />);

    expect(screen.getByRole('button', { name: 'Board unlocked' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('cannot be pressed twice while a change is on its way', () => {
    render(<BoardLock locked onToggle={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: 'Board locked' })).toBeDisabled();
  });

  // Everyone else sees the state, so a card that will not drag has its reason
  // in sight, but has nothing to press.
  it('tells a member why their cards will not move, with nothing to press', () => {
    render(<BoardLock locked busy={false} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Only the leader can move proposals');
  });

  it('tells a member when they can move their own', () => {
    render(<BoardLock locked={false} busy={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('You can move your own proposals');
  });
});

describe('BoardLockControl', () => {
  it('holds the toggle while the change is on its way', async () => {
    const user = userEvent.setup();
    render(<BoardLockControl locked onToggle={() => new Promise(() => {})} />);

    await user.click(screen.getByRole('button', { name: 'Board locked' }));
    expect(screen.getByRole('button', { name: 'Board locked' })).toBeDisabled();
  });

  it('says why, when the lock could not be changed', async () => {
    const user = userEvent.setup();
    render(
      <BoardLockControl
        locked
        onToggle={vi.fn(async () => {
          throw new Error('Only the session leader can lock the board');
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Board locked' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the session leader can lock the board',
    );
  });
});

// Members hear when the leader locks or unlocks the board.
describe('BoardLockToast', () => {
  it('tells the room the leader unlocked the board', () => {
    const { rerender } = render(<BoardLockToast questionId="q1" locked enabled />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    rerender(<BoardLockToast questionId="q1" locked={false} enabled />);

    expect(screen.getByRole('status')).toHaveTextContent('The leader unlocked the board');
  });

  it('tells the room the leader locked it again', () => {
    const { rerender } = render(<BoardLockToast questionId="q1" locked={false} enabled />);
    rerender(<BoardLockToast questionId="q1" locked enabled />);

    expect(screen.getByRole('status')).toHaveTextContent('The leader locked the board');
  });

  // Every question starts locked: moving on is not the leader locking it.
  it('says nothing when the board moves to another question', () => {
    const { rerender } = render(<BoardLockToast questionId="q1" locked={false} enabled />);
    rerender(<BoardLockToast questionId="q2" locked enabled />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says nothing to the leader, who pressed it', () => {
    const { rerender } = render(<BoardLockToast questionId="q1" locked enabled={false} />);
    rerender(<BoardLockToast questionId="q1" locked={false} enabled={false} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
