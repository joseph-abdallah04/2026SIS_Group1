import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MUTE_ALL, type LeaderMute } from '../voice';
import { MuteAllButton } from './MuteAllButton';

function moderation(pending: ReadonlySet<string> = new Set()): LeaderMute {
  return { mute: vi.fn(async () => undefined), pending, error: null };
}

describe('MuteAllButton', () => {
  it('mutes everyone at once, naming nobody', async () => {
    const user = userEvent.setup();
    const mod = moderation();
    render(<MuteAllButton moderation={mod} anyoneToMute />);

    await user.click(screen.getByRole('button', { name: 'Mute all' }));
    expect(mod.mute).toHaveBeenCalledWith();
  });

  it('rests while nobody else has their microphone on', () => {
    render(<MuteAllButton moderation={moderation()} anyoneToMute={false} />);

    expect(screen.getByRole('button', { name: 'Mute all' })).toBeDisabled();
  });

  it('holds while its mute is on the way', () => {
    render(<MuteAllButton moderation={moderation(new Set([MUTE_ALL]))} anyoneToMute />);

    expect(screen.getByRole('button', { name: 'Muting…' })).toBeDisabled();
  });
});
