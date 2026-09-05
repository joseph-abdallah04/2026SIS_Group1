import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const leave = vi.fn();
const disconnectSocket = vi.fn();
const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('../../lib/socket', () => ({
  disconnectSocket: () => disconnectSocket(),
}));

vi.mock('./useLeaveSession', () => ({
  useLeaveSession: () => ({ leave, leaving: false, error: null }),
}));

const { LeaveSessionControl } = await import('./LeaveSessionControl');

beforeEach(() => {
  leave.mockReset();
  disconnectSocket.mockReset();
  navigate.mockReset();
  leave.mockResolvedValue(true);
});

describe('LeaveSessionControl', () => {
  it('confirms before leaving, then drops the socket and returns to the dashboard', async () => {
    const user = userEvent.setup();
    render(<LeaveSessionControl sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Leave session' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave this session?' });
    expect(dialog).toBeInTheDocument();
    expect(leave).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Leave session' }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith('s1'));
    expect(disconnectSocket).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('stays put when leave fails — the socket is still in the room', async () => {
    leave.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<LeaveSessionControl sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Leave session' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave session' }),
    );

    await waitFor(() => expect(leave).toHaveBeenCalledWith('s1'));
    expect(disconnectSocket).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('can cancel the confirm dialog without POSTing', async () => {
    const user = userEvent.setup();
    render(<LeaveSessionControl sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'Leave session' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(leave).not.toHaveBeenCalled();
  });
});
