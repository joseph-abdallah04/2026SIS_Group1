import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FirstProposalHint, HINT_DELAY_MS, HINT_EXIT_MS } from './FirstProposalHint';
import { hintKeyFor, isHintRetired, retireHint } from './firstProposalHintStorage';

const KEY = hintKeyFor('session-1', 'user-1');
const TITLE = 'Propose your first idea';

const OPEN = {
  sessionId: 'session-1',
  viewerId: 'user-1',
  boardOpen: true,
  isLive: true,
  toolOpen: false,
};

/** jsdom has no matchMedia; give it one that says motion is welcome. */
function allowMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false } as Partial<MediaQueryList>),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  allowMotion();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FirstProposalHint', () => {
  it('rises a moment after an open board is shown', () => {
    render(<FirstProposalHint {...OPEN} />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS);
    });

    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('retracts when dismissed, and is remembered as retired', () => {
    render(<FirstProposalHint {...OPEN} />);
    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS);
    });

    const hint = screen.getByText(TITLE).closest('.rt-hint-rise');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }));

    expect(hint).toHaveClass('rt-hint-retract');
    expect(isHintRetired(KEY)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(HINT_EXIT_MS);
    });
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  // The tool's popup rises from the same spot, so the hint does not linger.
  it('goes at once, and retires, when a tool is opened', () => {
    const { rerender } = render(<FirstProposalHint {...OPEN} />);
    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS);
    });

    rerender(<FirstProposalHint {...OPEN} toolOpen />);

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(isHintRetired(KEY)).toBe(true);
  });

  it('does not come back once retired', () => {
    retireHint(KEY);
    render(<FirstProposalHint {...OPEN} />);

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS * 3);
    });

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('waits while the board is closed to proposals', () => {
    render(<FirstProposalHint {...OPEN} boardOpen={false} />);

    act(() => {
      vi.advanceTimersByTime(HINT_DELAY_MS * 3);
    });

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });
});
