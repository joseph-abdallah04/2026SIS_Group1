import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const end = vi.fn();

vi.mock('./useEndSession', () => ({
  useEndSession: () => ({ end, ending: false, error: null }),
}));

const { EndSessionControl } = await import('./EndSessionControl');

beforeEach(() => {
  end.mockReset();
  end.mockResolvedValue({ id: 's1', status: 'ended' });
});

describe('EndSessionControl', () => {
  it('confirms before ending — success does not navigate; the broadcast does', async () => {
    const user = userEvent.setup();
    render(<EndSessionControl sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'End session' }));
    const dialog = screen.getByRole('dialog', { name: 'End this session for everyone?' });
    expect(dialog).toBeInTheDocument();
    expect(end).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(end).toHaveBeenCalledTimes(1));
  });

  it('can cancel without POSTing', async () => {
    const user = userEvent.setup();
    render(<EndSessionControl sessionId="s1" />);

    await user.click(screen.getByRole('button', { name: 'End session' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(end).not.toHaveBeenCalled();
  });
});
