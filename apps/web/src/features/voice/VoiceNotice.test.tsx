import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VoiceNotice } from './VoiceNotice';

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
});
