import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardHeader } from './BoardHeader';

type Props = Parameters<typeof BoardHeader>[0];

function renderHeader(overrides: Partial<Props> = {}) {
  return render(
    <BoardHeader
      question="How might we make onboarding less like paperwork?"
      sessionTitle="Onboarding retro"
      questionNumber="Q2"
      phase="Discussing"
      connection="live"
      {...overrides}
    />,
  );
}

const status = () => document.querySelector<HTMLElement>('[data-board-status]')!;

/** The status line with some parts taken out, as text. */
function statusWithout(selector: string): string {
  const copy = status().cloneNode(true) as HTMLElement;
  copy.querySelectorAll(selector).forEach((node) => node.remove());
  return copy.textContent ?? '';
}
/** What is seen: dots, no pauses. */
const shown = () => statusWithout('.sr-only');
/** What a screen reader takes: pauses, no dots. */
const spoken = () => statusWithout('[aria-hidden="true"]');

describe('BoardHeader', () => {
  // First in the file: React reports a missing key once per component, so a
  // later test would be told nothing.
  it('takes the page’s pieces as they come, without React asking for keys', () => {
    // The countdown and the clock arrive as plain elements from the page.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderHeader({
        phaseDetails: [<span>3 selected</span>, <span>4:12 left</span>],
        clock: <span>32 min</span>,
      });
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('gives the question the first line, and its state and the session’s the second', () => {
    renderHeader({
      phaseDetails: [<span key="t">4:12 left</span>],
      clock: <span>32 min</span>,
    });

    expect(screen.getByText('How might we make onboarding less like paperwork?')).toHaveAttribute(
      'title',
      'How might we make onboarding less like paperwork?',
    );
    expect(shown()).toBe('Q2·Discussing·4:12 leftLive·32 min');
    expect(spoken()).toBe('Q2, Discussing, 4:12 left. Live, 32 min');
  });

  it('heads the page with the session’s title once the agenda is done', () => {
    renderHeader({ question: null, questionNumber: null, phase: 'Agenda complete' });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Onboarding retro');
    expect(within(status()).getByText('Agenda complete')).toBeInTheDocument();
    expect(within(status()).queryByText('Q2')).toBeNull();
  });

  it('says "No call" as part of the session’s state', () => {
    renderHeader({ noCall: true });
    expect(shown()).toMatch(/Live·No call$/);
  });

  it('puts "Reconnecting…" or "Session ended" where "Live" was', () => {
    const { unmount } = renderHeader({ connection: 'reconnecting' });
    expect(within(status()).getByText('Reconnecting…')).toBeInTheDocument();
    expect(within(status()).queryByText('Live')).toBeNull();
    unmount();

    renderHeader({ connection: 'ended' });
    expect(within(status()).getByText('Session ended')).toBeInTheDocument();
  });

  it('keeps people apart from the controls with a divider, and leaves the middle empty', () => {
    renderHeader({
      people: <button type="button">People</button>,
      controls: <button type="button">Mic</button>,
      exit: <button type="button">End session</button>,
    });

    const right = screen.getByRole('button', { name: 'People' }).parentElement!;
    expect([...right.children].map((child) => child.textContent || 'divider')).toEqual([
      'People',
      'divider',
      'Mic',
      'End session',
    ]);
  });
});
