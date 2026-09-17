import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionCodeSchema } from '@roundtable/shared/schemas';

import { LandingPage } from './LandingPage';
import { FILM_SCENES } from './SessionFilm';
import { DEMO } from './story';

beforeAll(() => {
  class FakeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = FakeObserver as unknown as typeof ResizeObserver;
});

function encodeSegment(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function liveToken(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encodeSegment({ alg: 'none' })}.${encodeSegment({ userId: 'u1', exp })}.sig`;
}

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('renders the headline and public auth links without requiring a token', () => {
    renderLanding();

    expect(
      screen.getByRole('heading', { name: /every question leaves with an answer/i }),
    ).toBeInTheDocument();

    const login = screen.getAllByRole('link', { name: /log in/i });
    const signup = screen.getAllByRole('link', { name: /sign up/i });
    expect(login.length).toBeGreaterThan(0);
    expect(signup.length).toBeGreaterThan(0);
    expect(login[0]).toHaveAttribute('href', '/login');
    expect(signup[0]).toHaveAttribute('href', '/signup');
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('walks through the whole session, from agenda to recap', () => {
    renderLanding();

    for (const heading of [
      /a session is an agenda you work through live/i,
      /talk on a call\. put the ideas on the board/i,
      /the leader shortlists\. everyone votes once/i,
      /it can draft ideas\. it cannot post them/i,
      /the recap is the list of answers/i,
      /create a session\. send the join code/i,
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('links the header nav to each section anchor', () => {
    renderLanding();

    const nav = screen.getByRole('navigation', { name: /page sections/i });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['#how-it-runs', '#pinboard', '#voting', '#assistant', '#recap']);
  });

  it('shows Dashboard in the header when a live token is stored', () => {
    localStorage.setItem('rt_token', liveToken());
    renderLanding();

    const dashboard = screen.getAllByRole('link', { name: /dashboard/i });
    expect(dashboard[0]).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign up$/i })).not.toBeInTheDocument();
  });

  it('describes voting the way the ballot works, not as last-ballot-wins', () => {
    renderLanding();

    expect(
      screen.getByText(/you can change your mind until they end the round/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the running tally is on the cards while voting is open/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/last ballot/i)).not.toBeInTheDocument();
    expect(FILM_SCENES[3]?.body).toMatch(/until the leader ends the round/);
    expect(FILM_SCENES[3]?.body).not.toMatch(/last ballot/);
  });

  it('says the leader can remove a card, not that only the author can delete', () => {
    renderLanding();

    expect(
      screen.getByText(
        /only the author can edit what they posted\. the leader can take a card off the board/i,
      ),
    ).toBeInTheDocument();
  });

  it('uses a demo join code that matches the real format', () => {
    expect(sessionCodeSchema.safeParse(DEMO.joinCode).success).toBe(true);
  });

  it('scrolls to the section named in the URL hash', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, '', '/#voting');
    renderLanding();

    const voting = document.getElementById('voting');
    expect(voting).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances).toContain(voting);
  });
});
