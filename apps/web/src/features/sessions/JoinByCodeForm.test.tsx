import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../lib/api';
import { UNKNOWN_JOIN_TITLE } from './joinCopy';
import { JoinByCodeForm } from './JoinByCodeForm';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api } = await import('../../lib/api');

describe('JoinByCodeForm', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    vi.mocked(api.get).mockReset();
  });

  it('stays on the dashboard and shows a notice when the code does not resolve', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiClientError(404, 'Session not found — check the code', 'INVALID_CODE'),
    );
    const user = userEvent.setup();
    render(<JoinByCodeForm />);

    await user.type(screen.getByPlaceholderText(/have a code/i), 'ZZZZ-ZZZZ');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('dialog', { name: UNKNOWN_JOIN_TITLE })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('goes to the join page when the code is live', async () => {
    vi.mocked(api.get).mockResolvedValue({ id: 's1' });
    const user = userEvent.setup();
    render(<JoinByCodeForm />);

    await user.type(screen.getByPlaceholderText(/have a code/i), 'K7NP-3WQZ');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/join/K7NP-3WQZ'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
