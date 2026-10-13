import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionClock, meetingDuration } from './SessionClock';

const MIN = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('meetingDuration', () => {
  it('reads in minutes, then hours and minutes', () => {
    expect(meetingDuration(20_000)).toBe('Just started');
    expect(meetingDuration(32 * MIN + 59_000)).toBe('32 min');
    expect(meetingDuration(60 * MIN)).toBe('1 h');
    expect(meetingDuration(125 * MIN)).toBe('2 h 5 min');
  });

  it('never goes negative when a clock runs a little behind the server', () => {
    expect(meetingDuration(-5_000)).toBe('Just started');
  });
});

describe('SessionClock', () => {
  it('counts from when the session started, and keeps counting', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:32:00Z'));
    render(<SessionClock startedAt="2026-10-13T10:00:00Z" />);
    expect(screen.getByText(/32 min/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/33 min/)).toBeInTheDocument();
  });

  it('shows nothing without a start time', () => {
    const { container } = render(<SessionClock startedAt={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
