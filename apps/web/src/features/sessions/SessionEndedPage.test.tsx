import type { SessionRecap } from '@roundtable/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionDetail } from './useSessionDetail';

const RECAP: SessionRecap = {
  sessionId: 's1',
  title: 'Roadmap',
  createdAt: '2026-09-01T00:00:00.000Z',
  startedAt: '2026-09-01T01:00:00.000Z',
  endedAt: '2026-09-01T02:00:00.000Z',
  leaderId: 'leader-1',
  participants: [{ userId: 'leader-1', displayName: 'Leader', isLeader: true }],
  questions: [
    {
      id: 'q1',
      position: 0,
      text: 'What ships first?',
      status: 'answered',
      votingEnabled: true,
      proposals: [],
      winnerProposalId: null,
      tiedProposalIds: [],
      tallies: [],
      votedCount: 0,
    },
  ],
};

const reload = vi.fn();
let loaded: { summary: SessionRecap | null; loading: boolean; error: string | null };

vi.mock('../summary/useSessionSummary', () => ({
  useSessionSummary: () => ({ ...loaded, reload }),
}));
vi.mock('../../lib/currentUser', () => ({
  useCurrentUserId: () => 'leader-1',
  getCurrentUserId: () => 'leader-1',
}));
vi.mock('../../lib/auth', async () => {
  const actual = await vi.importActual<typeof import('../../lib/auth')>('../../lib/auth');
  return { ...actual, getToken: () => 'test-jwt' };
});
vi.mock('../auth/api', () => ({
  getMe: () => new Promise(() => {}),
  logout: vi.fn(),
}));

const { SessionEndedPage } = await import('./SessionEndedPage');

const SESSION: SessionDetail = {
  id: 's1',
  code: null,
  title: 'Roadmap',
  leaderId: 'leader-1',
  status: 'ended',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  startedAt: new Date('2026-09-01T01:00:00.000Z'),
  endedAt: new Date('2026-09-01T02:00:00.000Z'),
  discussionTimerSeconds: null,
  votingTimerSeconds: null,
  voiceEnabled: false,
  questions: [
    {
      id: 'q1',
      sessionId: 's1',
      text: 'What ships first?',
      position: 0,
      status: 'answered',
      votingEnabled: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  ],
};

function SearchProbe() {
  const [params] = useSearchParams();
  return <span>{`view:${params.get('view') ?? ''} question:${params.get('question') ?? ''}`}</span>;
}

/** The app's bar: found by its trail, since each question card has a header of its own. */
function appBar(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('header')!;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionEndedPage session={SESSION} />
      <SearchProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loaded = { summary: RECAP, loading: false, error: null };
  reload.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionEndedPage', () => {
  it('shows the recap under the app’s bar, with the way back and both actions in the bar', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What ships first?/ })).toBeInTheDocument();

    const bar = appBar();
    expect(within(bar).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(within(bar).getByText('Recap')).toHaveAttribute('aria-current', 'page');
    expect(within(bar).getByRole('button', { name: 'Review boards' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Download PDF' })).toBeInTheDocument();
  });

  // The setup pages' shell: the bar stays put, only the page under it scrolls.
  it('scrolls the page under the bar, not the bar with it', () => {
    renderPage();

    const scroller = document.querySelector('[data-page-scroll]');
    expect(scroller).toHaveClass('overflow-y-auto');
    expect(scroller).toContainElement(screen.getByRole('heading', { name: 'Roadmap' }));
    expect(scroller).not.toContainElement(appBar());
  });

  it('asks for the PDF with the bearer header and the viewer’s time zone', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="Roadmap-recap.pdf"' }),
      blob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/s1/summary.pdf?tz=${encodeURIComponent(zone)}`,
      { headers: { Authorization: 'Bearer test-jwt' } },
    );
    expect(await screen.findByText('Downloaded Roadmap-recap.pdf')).toBeInTheDocument();
  });

  // B11: said where it is heard, and gone again, rather than a red line left beside the button.
  it('says a failed download in the page’s status region', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: 'The PDF could not be built' }),
      }),
    );

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

    const status = screen.getByRole('status');
    expect(await within(status).findByText('The PDF could not be built')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('opens the boards on the first question', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Review boards' }));

    expect(screen.getByText('view:boards question:q1')).toBeInTheDocument();
  });

  // Tristan's addition: a way back, written out, at the top of the page.
  it('has a Back to dashboard link at the top of the page', () => {
    renderPage();

    const back = screen.getByRole('link', { name: 'Back to dashboard' });
    expect(back).toHaveAttribute('href', '/dashboard');
    expect(appBar()).not.toContainElement(back);
  });

  it('opens one question’s board from its card', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Open the board for question 1' }));

    expect(screen.getByText('view:boards question:q1')).toBeInTheDocument();
  });

  it('marks the moment the meeting ended, and only then', () => {
    const { unmount } = renderPage();
    expect(screen.queryByText(/That’s a wrap/)).not.toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter>
        <SessionEndedPage session={SESSION} justEnded />
      </MemoryRouter>,
    );
    expect(screen.getByText('That’s a wrap. The meeting just ended.')).toBeInTheDocument();
  });

  it('shows the shape of the recap while it loads, and no download yet', () => {
    loaded = { summary: null, loading: true, error: null };
    renderPage();

    expect(screen.getByRole('heading', { name: 'Loading the summary' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument();
  });

  // B10: a failed load used to be a dead end.
  it('offers to try again when the recap would not load', async () => {
    loaded = { summary: null, loading: false, error: 'Network down' };
    renderPage();

    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(within(alert).getByText('Network down')).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
