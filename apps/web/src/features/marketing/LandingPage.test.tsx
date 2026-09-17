import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LandingPage } from './LandingPage';

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
  });

  it('renders the headline and public auth links without requiring a token', () => {
    renderLanding();

    expect(
      screen.getByRole('heading', { name: /sessions that end in a decision, not a doc/i }),
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
      /six steps, and the same six every time/i,
      /everyone proposes at once/i,
      /one vote each, and the question is closed/i,
      /bring your own model into the room/i,
      /nobody has to write the minutes/i,
      /bring a question\. leave with an answer/i,
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('links the header nav to each section anchor', () => {
    renderLanding();

    const nav = screen.getByRole('navigation', { name: /page sections/i });
    const hrefs = Array.from(nav.querySelectorAll('a')).map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['#how-it-runs', '#pinboard', '#voting', '#assistant']);
  });

  it('shows Dashboard in the header when a live token is stored', () => {
    localStorage.setItem('rt_token', liveToken());
    renderLanding();

    const dashboard = screen.getAllByRole('link', { name: /dashboard/i });
    expect(dashboard[0]).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: /^log in$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^sign up$/i })).not.toBeInTheDocument();
  });
});
