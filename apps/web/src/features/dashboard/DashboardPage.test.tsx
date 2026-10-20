import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SessionSummary } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let sessions: SessionSummary[] | null = [];

vi.mock('../sessions/useSessions', async () => {
  const actual =
    await vi.importActual<typeof import('../sessions/useSessions')>('../sessions/useSessions');
  return {
    ...actual,
    useSessions: () => ({ sessions, loading: sessions === null, error: null, reload: vi.fn() }),
  };
});

vi.mock('../auth/api', () => ({
  getMe: async () => ({
    // A new account, so an empty list is a first visit.
    user: {
      id: 'u1',
      email: 'mo@team.com',
      displayName: 'Mohamad Eldhaibi',
      createdAt: new Date().toISOString(),
    },
  }),
  logout: vi.fn(),
}));

const { DashboardPage } = await import('./DashboardPage');

function session(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    id: 's',
    code: null,
    title: 'Session',
    status: 'ended',
    createdAt: new Date('2026-10-14T10:00:00Z'),
    isLeader: true,
    isCurrentMember: true,
    ...overrides,
  };
}

const renderPage = (state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/dashboard', state }]}>
      <DashboardPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  sessions = [
    session({ id: 'd1', title: 'Q4 roadmap', status: 'draft' }),
    session({
      id: 'p1',
      title: 'Design review',
      decision: { text: 'Group by account', more: 2 },
    }),
    session({
      id: 'p2',
      title: 'September retro',
      isLeader: false,
      createdAt: new Date('2026-09-03T10:00:00Z'),
      decision: null,
    }),
  ];
});

describe('dashboard', () => {
  // Which of the two depends on how old the latest session is (see greeting.test).
  it('greets by first name once there is history', async () => {
    renderPage();
    expect(
      await screen.findByText(/^(Let’s decide|It’s been a while), Mohamad$/),
    ).toBeInTheDocument();
  });

  it('welcomes a first visit by name', async () => {
    sessions = [];
    renderPage();
    expect(await screen.findByText('Welcome to RoundTable, Mohamad')).toBeInTheDocument();
  });

  it('puts joining and leading side by side, under the page heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByLabelText('Session code')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create session/i })).toHaveAttribute(
      'href',
      '/sessions/new',
    );
  });

  it('lists drafts as cards and past sessions by month, with what each decided', () => {
    renderPage();

    // A draft opens straight in its editor.
    expect(screen.getByRole('link', { name: 'Q4 roadmap' })).toHaveAttribute(
      'href',
      '/sessions/d1/edit',
    );
    expect(screen.getByRole('link', { name: 'Q4 roadmap' }).closest('li')).toHaveTextContent(
      'Continue editing',
    );
    const decided = screen.getByRole('link', { name: 'Design review' }).closest('li')!;
    expect(decided).toHaveTextContent('Group by account');
    expect(decided).toHaveTextContent('+2 more');
    expect(decided).toHaveTextContent('You led');
    // One that decided nothing says nothing about it.
    const undecided = screen.getByRole('link', { name: 'September retro' }).closest('li')!;
    expect(undecided).not.toHaveTextContent('Decided');
    expect(undecided).toHaveTextContent('Member');
    expect(screen.getByRole('region', { name: /october 2026/i })).toContainElement(decided);
    expect(screen.getByRole('region', { name: /september 2026/i })).toContainElement(undecided);
  });

  it('says a draft was saved, and points it out', () => {
    renderPage({ savedDraftId: 'd1' });

    expect(screen.getByText('Draft saved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Q4 roadmap' }).closest('li')).toHaveClass(
      'bg-rt-secondary-wash',
    );
  });

  it('says nothing about saving when arriving any other way', () => {
    renderPage();
    expect(screen.queryByText('Draft saved')).not.toBeInTheDocument();
  });

  it('narrows to sessions this person led', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Led by me' }));

    expect(screen.queryByRole('link', { name: 'September retro' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Design review' })).toBeInTheDocument();
  });

  it('says when a search finds nothing, and goes back to everything', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('searchbox'), 'zebra');
    expect(screen.getByText('No sessions match “zebra”')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all sessions' }));
    expect(screen.getByRole('link', { name: 'Design review' })).toBeInTheDocument();
  });

  it('welcomes a first visit instead of showing empty lists', () => {
    sessions = [];
    renderPage();

    expect(screen.getByRole('heading', { name: 'No sessions yet' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('keeps Settings and Log out behind the avatar', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('menuitem', { name: 'Settings' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Account' }));

    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
    expect(menu).toHaveTextContent('mo@team.com');
  });
});
