import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BoardLock } from './BoardLock';

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
