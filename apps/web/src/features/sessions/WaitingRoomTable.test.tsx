import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WaitingRoomTable } from './WaitingRoomTable';

describe('WaitingRoomTable', () => {
  it('marks the leader and shows initials, not a name list', async () => {
    const user = userEvent.setup();
    render(
      <WaitingRoomTable
        participants={[
          { id: 'u2', displayName: 'Alice Smith' },
          { id: 'leader-1', displayName: 'Joey' },
        ]}
        leaderId="leader-1"
      />,
    );

    expect(screen.getByRole('button', { name: 'Joey, Leader' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alice Smith' })).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
    expect(screen.getByText('JO')).toBeInTheDocument();
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Alice Smith' }));
    expect(screen.getByRole('tooltip', { name: 'Alice Smith' })).toBeInTheDocument();
  });

  it('keeps the leader at 12 o’clock even when they are not first in the array', () => {
    render(
      <WaitingRoomTable
        participants={[
          { id: 'u2', displayName: 'Bob' },
          { id: 'leader-1', displayName: 'Joey' },
        ]}
        leaderId="leader-1"
      />,
    );

    const leader = screen.getByRole('button', { name: 'Joey, Leader' }).closest('.rt-waiting-seat');
    const other = screen.getByRole('button', { name: 'Bob' }).closest('.rt-waiting-seat');
    expect(leader).toHaveStyle({ top: '4%' });
    expect(other).toHaveStyle({ top: '96%' });
  });

  it('pops only people who arrive after the first snapshot', () => {
    const { rerender } = render(
      <WaitingRoomTable
        participants={[{ id: 'leader-1', displayName: 'Joey' }]}
        leaderId="leader-1"
      />,
    );

    expect(screen.getByRole('button', { name: 'Joey, Leader' }).closest('.rt-waiting-seat')).not.toHaveAttribute(
      'data-just-joined',
    );

    rerender(
      <WaitingRoomTable
        participants={[
          { id: 'leader-1', displayName: 'Joey' },
          { id: 'u2', displayName: 'Bob' },
        ]}
        leaderId="leader-1"
      />,
    );

    expect(screen.getByRole('button', { name: 'Bob' }).closest('.rt-waiting-seat')).toHaveAttribute(
      'data-just-joined',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Joey, Leader' }).closest('.rt-waiting-seat')).not.toHaveAttribute(
      'data-just-joined',
    );
  });
});
