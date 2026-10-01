import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NOTICE_AUTO_HIDE_MS, VoiceNotice } from './VoiceNotice';

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** A healthy call: connected, publishing, nothing for the banner to say. */
function healthyProps() {
  return {
    status: 'connected' as const,
    micStatus: 'live' as const,
    micPermissionDenied: false,
    error: null,
    audioBlocked: false,
    retry: vi.fn(),
    requestMicrophone: vi.fn(),
    unlockAudio: vi.fn(),
  };
}

describe('VoiceNotice', () => {
  it('renders nothing while voice is healthy', () => {
    render(<VoiceNotice {...healthyProps()} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers a retry that re-prompts when the mic was refused but is not permanently blocked', async () => {
    const props = { ...healthyProps(), micStatus: 'blocked' as const };
    const user = userEvent.setup();
    render(<VoiceNotice {...props} />);

    // Says what is still true — you can hear the room — rather than reading as
    // a dead session.
    expect(screen.getByRole('status')).toHaveTextContent('You can hear everyone');
    expect(screen.getByRole('status')).toHaveTextContent('then try again');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.requestMicrophone).toHaveBeenCalled();
  });

  it('sends you to browser site settings once the block is permanent, since a retry cannot re-prompt', () => {
    render(<VoiceNotice {...healthyProps()} micStatus="blocked" micPermissionDenied />);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Your browser has blocked the microphone for this site');
    expect(notice).toHaveTextContent('site settings');
    // The retry wording is gone: no browser will re-open the prompt from here.
    expect(notice).not.toHaveTextContent('then try again');
    expect(screen.getByRole('button', { name: 'Recheck' })).toBeInTheDocument();
  });

  it('puts blocked playback ahead of a blocked mic — a silent room beats a silent you', () => {
    render(
      <VoiceNotice
        {...healthyProps()}
        audioBlocked
        micStatus="blocked"
        micPermissionDenied
        status="failed"
      />,
    );

    // Exactly one banner, and it is the playback one.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('holding back audio');
    expect(screen.getByRole('button', { name: 'Enable sound' })).toBeInTheDocument();
  });

  it('surfaces the connection error and a reconnect when voice has given up', async () => {
    const props = {
      ...healthyProps(),
      status: 'failed' as const,
      error: 'You are not a participant in this session, so you cannot join its voice room.',
    };
    const user = userEvent.setup();
    render(<VoiceNotice {...props} />);

    expect(screen.getByRole('status')).toHaveTextContent('not a participant in this session');

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(props.retry).toHaveBeenCalled();
  });

  it('reports a missing input device separately from a refused permission', () => {
    render(<VoiceNotice {...healthyProps()} micStatus="no-device" />);

    expect(screen.getByRole('status')).toHaveTextContent('No working microphone was found');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
  });

  it('shows a quiet, actionless notice while reconnecting', () => {
    render(<VoiceNotice {...healthyProps()} status="reconnecting" />);

    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting to the room');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says nothing when the server has no voice, even with a stale mic state', () => {
    // `micStatus` can still hold a `blocked` from an earlier connected period.
    // Surfacing it here would raise a microphone banner about a room that does
    // not exist, alongside a Reconnect that could never work.
    render(
      <VoiceNotice
        {...healthyProps()}
        status="unavailable"
        micStatus="blocked"
        micPermissionDenied
        error="Lost the voice connection. Reconnect to rejoin."
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  describe('stepping aside', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Voice has given up — the banner the ticket was about. */
    function failedProps() {
      return {
        ...healthyProps(),
        status: 'failed' as const,
        error: 'Lost the voice connection. Reconnect to rejoin.',
      };
    }

    it('lets "Voice offline" go after a few seconds — the header keeps its Reconnect', () => {
      vi.useFakeTimers();
      render(<VoiceNotice {...failedProps()} />);

      advance(NOTICE_AUTO_HIDE_MS - 1);
      expect(screen.getByRole('status')).toHaveTextContent('Lost the voice connection');

      advance(1);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows nothing once it has gone, not the stale mic banner beneath it', () => {
      vi.useFakeTimers();
      // A `blocked` left over from before the drop. Falling through to it would
      // raise "Mic blocked" about a room you are no longer in.
      render(<VoiceNotice {...failedProps()} micStatus="blocked" />);

      advance(NOTICE_AUTO_HIDE_MS);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps counting through a re-render of the same failure', () => {
      vi.useFakeTimers();
      const { rerender } = render(<VoiceNotice {...failedProps()} />);

      advance(NOTICE_AUTO_HIDE_MS / 2);
      // The page re-rendering — a roster update, say — is not a new failure.
      rerender(<VoiceNotice {...failedProps()} />);
      advance(NOTICE_AUTO_HIDE_MS / 2);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('comes back, timer and all, when a Reconnect fails again', () => {
      vi.useFakeTimers();
      const { rerender } = render(<VoiceNotice {...failedProps()} />);
      advance(NOTICE_AUTO_HIDE_MS);

      // Reconnect pressed: the attempt runs, and fails.
      rerender(<VoiceNotice {...failedProps()} status="connecting" />);
      rerender(<VoiceNotice {...failedProps()} />);
      expect(screen.getByRole('status')).toHaveTextContent('Lost the voice connection');

      advance(NOTICE_AUTO_HIDE_MS);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('holds while the pointer is on it, and starts over when it leaves', () => {
      vi.useFakeTimers();
      render(<VoiceNotice {...failedProps()} />);

      fireEvent.pointerEnter(screen.getByRole('status'));
      advance(NOTICE_AUTO_HIDE_MS * 2);
      expect(screen.getByRole('status')).toBeInTheDocument();

      // From the top, not from where it was: whoever went to it was reading.
      fireEvent.pointerLeave(screen.getByRole('status'));
      advance(NOTICE_AUTO_HIDE_MS - 1);
      expect(screen.getByRole('status')).toBeInTheDocument();

      advance(1);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('holds while its button has focus', () => {
      vi.useFakeTimers();
      render(<VoiceNotice {...failedProps()} />);

      const reconnect = screen.getByRole('button', { name: 'Reconnect' });
      act(() => reconnect.focus());
      advance(NOTICE_AUTO_HIDE_MS * 2);
      // Hiding it now would drop keyboard focus onto the page body.
      expect(reconnect).toHaveFocus();

      act(() => reconnect.blur());
      advance(NOTICE_AUTO_HIDE_MS);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it.each([
      { what: 'a refused mic', overrides: { micStatus: 'blocked' as const } },
      {
        what: 'a mic blocked for good',
        overrides: { micStatus: 'blocked' as const, micPermissionDenied: true },
      },
      { what: 'a missing mic', overrides: { micStatus: 'no-device' as const } },
    ])('lets $what go too — the mic toggle keeps its mark and its retry', ({ overrides }) => {
      vi.useFakeTimers();
      render(<VoiceNotice {...healthyProps()} {...overrides} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      advance(NOTICE_AUTO_HIDE_MS);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('raises the mic banner again when asking again is refused again', () => {
      vi.useFakeTimers();
      const { rerender } = render(<VoiceNotice {...healthyProps()} micStatus="blocked" />);
      advance(NOTICE_AUTO_HIDE_MS);

      // Pressing the mic asks again (`requesting`), and is refused again.
      rerender(<VoiceNotice {...healthyProps()} micStatus="requesting" />);
      rerender(<VoiceNotice {...healthyProps()} micStatus="blocked" />);
      expect(screen.getByRole('status')).toHaveTextContent('nobody can hear you');
    });

    it('does not start over when the Permissions API only sharpens the wording', () => {
      vi.useFakeTimers();
      const { rerender } = render(<VoiceNotice {...healthyProps()} micStatus="blocked" />);

      advance(NOTICE_AUTO_HIDE_MS / 2);
      // Same problem, better words: not a new occurrence.
      rerender(<VoiceNotice {...healthyProps()} micStatus="blocked" micPermissionDenied />);
      expect(screen.getByRole('status')).toHaveTextContent('site settings');

      advance(NOTICE_AUTO_HIDE_MS / 2);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps "Sound blocked" up — nothing else says why the room is silent', () => {
      vi.useFakeTimers();
      render(<VoiceNotice {...healthyProps()} audioBlocked />);

      advance(NOTICE_AUTO_HIDE_MS * 3);
      expect(screen.getByRole('button', { name: 'Enable sound' })).toBeInTheDocument();
    });

    it('keeps "Reconnecting" up for as long as it is true', () => {
      vi.useFakeTimers();
      render(<VoiceNotice {...healthyProps()} status="reconnecting" />);

      advance(NOTICE_AUTO_HIDE_MS * 3);
      expect(screen.getByRole('status')).toHaveTextContent('Reconnecting to the room');
    });

    it('lets go of its timer when the view does', () => {
      vi.useFakeTimers();
      const { unmount } = render(<VoiceNotice {...failedProps()} />);

      expect(vi.getTimerCount()).toBeGreaterThan(0);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
