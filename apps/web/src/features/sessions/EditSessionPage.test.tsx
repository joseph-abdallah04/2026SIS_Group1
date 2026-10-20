import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionDetail } from './useSessionDetail';

const navigateMock = vi.fn();
const updateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const draft = {
  id: 's1',
  title: 'Roadmap',
  status: 'draft',
  leaderId: 'leader-1',
  discussionTimerSeconds: null,
  votingTimerSeconds: null,
  voiceEnabled: false,
  questions: [{ id: 'q1', text: 'What ships first?', votingEnabled: true }],
} as unknown as SessionDetail;

vi.mock('./useSessionDetail', () => ({
  useSessionDetail: () => ({ session: draft, loading: false, error: null }),
}));
vi.mock('./useUpdateSession', () => ({
  useUpdateSession: () => ({ update: updateMock, submitting: false, error: null }),
}));
vi.mock('./useDeleteSession', () => ({
  useDeleteSession: () => ({ remove: vi.fn(), deleting: false, error: null }),
}));
vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const { api, ApiClientError } = await import('../../lib/api');
const { EditSessionPage } = await import('./EditSessionPage');

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/sessions/s1/edit']}>
      <Routes>
        <Route path="/sessions/:id/edit" element={<EditSessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// B6: the edit page had no way out but the browser's Back. Every way out now
// goes to the dashboard, where drafts are opened from (straight into this
// page), and saving points the draft out there.
describe('EditSessionPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    updateMock.mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('goes back to the dashboard on Cancel, and from the header', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenLastCalledWith('/dashboard');

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(navigateMock).toHaveBeenLastCalledWith('/dashboard');
  });

  it('asks before throwing changes away', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Session title'), ' v2');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard your changes?' })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  // Code review: the create page warned before refresh or close, the edit page did not.
  it('warns before the page is closed once something has been changed', async () => {
    const user = userEvent.setup();
    renderPage();

    const untouched = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(untouched);
    expect(untouched.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Session title'), ' v2');
    const changed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(changed);
    expect(changed.defaultPrevented).toBe(true);
  });

  it('goes back to the dashboard once saved, pointing the draft out', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(draft);
    renderPage();

    await user.type(screen.getByLabelText('Session title'), ' v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Roadmap v2' }));
    expect(navigateMock).toHaveBeenCalledWith('/dashboard', { state: { savedDraftId: 's1' } });
  });

  // Drafts open from the dashboard straight into this page, so it is where one
  // is started: the edits are saved, then the room opens.
  it('saves and opens the room, then goes on to the waiting room', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(draft);
    vi.mocked(api.post).mockResolvedValue({ ...draft, status: 'lobby', code: 'K7NP-3WQZ' });
    renderPage();

    await user.type(screen.getByLabelText('Session title'), ' v2');
    await user.click(screen.getByRole('button', { name: /open the room/i }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Roadmap v2' }));
    expect(api.post).toHaveBeenCalledWith('/api/sessions/s1/open', {});
    await waitFor(
      () => expect(navigateMock).toHaveBeenCalledWith('/sessions/s1', { replace: true }),
      { timeout: 4000 },
    );
  });

  it('goes to the draft, which says why, when the room will not open', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(draft);
    vi.mocked(api.post).mockRejectedValue(
      new ApiClientError(409, 'Add a question first', 'NO_QUESTIONS'),
    );
    renderPage();

    await user.click(screen.getByRole('button', { name: /open the room/i }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/sessions/s1', {
        replace: true,
        state: { openError: 'Add a question first' },
      }),
    );
  });

  it('does not open the room when saving the edits fails', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(null);
    renderPage();

    await user.click(screen.getByRole('button', { name: /open the room/i }));

    expect(api.post).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
