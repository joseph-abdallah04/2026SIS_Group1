import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionCardActions } from './SessionCardActions';

const removeMock = vi.fn();

vi.mock('./useDeleteSession', () => ({
  useDeleteSession: () => ({
    remove: removeMock,
    deleting: false,
    error: null,
  }),
}));

function renderActions(status: 'draft' | 'ended') {
  return render(
    <MemoryRouter>
      <SessionCardActions sessionId="s1" title="Roadmap" status={status} onDeleted={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('SessionCardActions', () => {
  beforeEach(() => {
    removeMock.mockReset();
    removeMock.mockResolvedValue(true);
  });

  it('offers Edit and Delete on a draft, then confirms delete in a dialog', async () => {
    const user = userEvent.setup();
    renderActions('draft');

    await user.click(screen.getByRole('button', { name: /actions for roadmap/i }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/sessions/s1/edit',
    );

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('dialog', { name: 'Delete this draft?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('s1'));
  });

  it('offers Delete but not Edit on an ended session', async () => {
    const user = userEvent.setup();
    renderActions('ended');

    await user.click(screen.getByRole('button', { name: /actions for roadmap/i }));
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(
      screen.getByRole('dialog', { name: 'Delete this session from your dashboard?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('s1'));
  });
});
