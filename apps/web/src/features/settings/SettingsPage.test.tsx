import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionSummary } from '@roundtable/shared';

import { liveMembershipOf } from '../sessions/useSessions';
import { SettingsPage } from './SettingsPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../sessions/useSessions', async () => {
  const actual = await vi.importActual<typeof import('../sessions/useSessions')>(
    '../sessions/useSessions',
  );
  return { ...actual, useSessions: vi.fn() };
});

vi.mock('./ProfilePage', () => ({
  ProfilePage: () => <div>Profile tab</div>,
}));

vi.mock('./LlmSettingsForm', () => ({
  LlmSettingsForm: () => <div>Assistant tab</div>,
}));

const { useSessions } = await import('../sessions/useSessions');

const live: SessionSummary = {
  id: 's-live',
  code: 'ABC123',
  title: 'Sprint planning',
  status: 'active',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  isLeader: true,
  isCurrentMember: true,
};

const idle: SessionSummary = {
  ...live,
  id: 's-ended',
  status: 'ended',
  isCurrentMember: false,
};

describe('liveMembershipOf', () => {
  it('counts lobby and active membership, and ignores sessions they have left', () => {
    expect(liveMembershipOf([{ ...live, status: 'lobby' }])?.id).toBe('s-live');
    expect(liveMembershipOf([live])?.id).toBe('s-live');
    expect(liveMembershipOf([idle])).toBeUndefined();
  });
});

describe('SettingsPage', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    vi.mocked(useSessions).mockReset();
  });

  it('does not show profile or delete-account while a live session is open', () => {
    vi.mocked(useSessions).mockReturnValue({
      sessions: [live],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Taking you back to your live session…')).toBeInTheDocument();
    expect(screen.queryByText('Profile tab')).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s-live', { replace: true });
  });

  it('also bounces a waiting-room member away from settings', () => {
    vi.mocked(useSessions).mockReturnValue({
      sessions: [{ ...live, status: 'lobby' }],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Profile tab')).toBeNull();
    expect(navigateMock).toHaveBeenCalledWith('/sessions/s-live', { replace: true });
  });

  it('shows settings once they are not in a lobby or active session', () => {
    vi.mocked(useSessions).mockReturnValue({
      sessions: [idle],
      loading: false,
      error: null,
      reload: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Profile tab')).toBeInTheDocument();
  });
});
