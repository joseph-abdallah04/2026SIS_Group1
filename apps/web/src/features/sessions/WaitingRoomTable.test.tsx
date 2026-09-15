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

    expect(
      screen.getByRole('button', { name: 'Joey, Leader' }).closest('.rt-waiting-seat'),
    ).not.toHaveAttribute('data-just-joined');

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
    expect(
      screen.getByRole('button', { name: 'Joey, Leader' }).closest('.rt-waiting-seat'),
    ).not.toHaveAttribute('data-just-joined');
  });

  it('rings the seat of whoever is speaking, and only theirs', () => {
    const { container } = render(
      <WaitingRoomTable
        participants={[
          { id: 'u2', displayName: 'Alice Smith' },
          { id: 'leader-1', displayName: 'Joey' },
        ]}
        leaderId="leader-1"
        voiceParticipants={[
          { identity: 'u2', name: 'Alice Smith', isLocal: false, isSpeaking: true, isMuted: false },
          { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
        ]}
      />,
    );

    const ringed = container.querySelectorAll('.rt-voice-seat[data-speaking="true"]');
    expect(ringed).toHaveLength(1);
    expect(ringed[0]).toContainElement(screen.getByRole('button', { name: 'Alice Smith' }));
  });

  it('ignores a voice participant who has no seat', () => {
    render(
      <WaitingRoomTable
        participants={[{ id: 'leader-1', displayName: 'Joey' }]}
        leaderId="leader-1"
        voiceParticipants={[
          // Socket presence is the roster; someone heard but not seated is not
          // drawn a chair of their own.
          { identity: 'ghost', name: 'Ghost', isLocal: false, isSpeaking: true, isMuted: false },
          { identity: 'leader-1', name: 'Joey', isLocal: true, isSpeaking: false, isMuted: false },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Ghost' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('does not replay the arrival animation when only voice changes', () => {
    const participants = [
      { id: 'u2', displayName: 'Alice Smith' },
      { id: 'leader-1', displayName: 'Joey' },
    ];
    const { container, rerender } = render(
      <WaitingRoomTable participants={participants} leaderId="leader-1" voiceParticipants={[]} />,
    );

    // Speech edges re-render this table constantly. If that churn reached the
    // join/leave bookkeeping, every seat would flash its arrival animation
    // each time somebody drew breath.
    rerender(
      <WaitingRoomTable
        participants={participants}
        leaderId="leader-1"
        voiceParticipants={[
          { identity: 'u2', name: 'Alice Smith', isLocal: false, isSpeaking: true, isMuted: false },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-just-joined="true"]')).toHaveLength(0);
  });
});
