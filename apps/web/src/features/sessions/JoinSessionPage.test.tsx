import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../../lib/api';
import { UNKNOWN_JOIN_BODY, UNKNOWN_JOIN_TITLE } from './joinCopy';
import { JoinSessionPage } from './JoinSessionPage';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api } = await import('../../lib/api');

function renderJoin(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinSessionPage />} />
        <Route path="/dashboard" element={<p>dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JoinSessionPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('explains a missing session and offers a way back to the dashboard', async () => {
    vi.mocked(api.get).mockRejectedValue(
      new ApiClientError(404, 'Session not found — check the code', 'INVALID_CODE'),
    );
    renderJoin('ZZZZ-ZZZZ');

    expect(await screen.findByRole('heading', { name: UNKNOWN_JOIN_TITLE })).toBeInTheDocument();
    expect(screen.getByText(UNKNOWN_JOIN_BODY)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.queryByText(/session not found — check the code/i)).not.toBeInTheDocument();
  });

  it('shows the preview when the code is live', async () => {
    vi.mocked(api.get).mockResolvedValue({
      id: 's1',
      title: 'Roadmap',
      status: 'lobby',
      leaderId: 'u1',
      questionCount: 2,
    });
    renderJoin('K7NP-3WQZ');

    await waitFor(() => expect(screen.getByText('Roadmap')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Join session' })).toBeInTheDocument();
  });
});
