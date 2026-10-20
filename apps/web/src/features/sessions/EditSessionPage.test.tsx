import { render, screen } from '@testing-library/react';
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

// B6: the edit page had no way out but the browser's Back, and saving went to
// the dashboard instead of back to the draft.
describe('EditSessionPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    updateMock.mockReset();
  });

  it('goes back to the draft on Cancel, and to the dashboard from the header', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(navigateMock).toHaveBeenLastCalledWith('/sessions/s1');

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
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s1');
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

  it('goes back to the draft once saved', async () => {
    const user = userEvent.setup();
    updateMock.mockResolvedValue(draft);
    renderPage();

    await user.type(screen.getByLabelText('Session title'), ' v2');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Roadmap v2' }));
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s1');
  });
});
