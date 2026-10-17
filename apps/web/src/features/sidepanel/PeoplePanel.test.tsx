import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LeaderMute, VoiceParticipant } from '../voice';
import type { CallView } from './peopleRoster';

const copyText = vi.fn<(value: string) => Promise<boolean>>();
vi.mock('../../lib/copyText', () => ({ copyText: (value: string) => copyText(value) }));

const { PeoplePanel } = await import('./PeoplePanel');

function person(identity: string, name: string, extra: Partial<VoiceParticipant> = {}) {
  return { identity, name, isLocal: false, isSpeaking: false, isMuted: false, ...extra };
}

const me = person('u-me', 'Priya Shah', { isLocal: true });
const lead = person('u-lead', 'Jordan Avery');
const lena = person('u-lena', 'Lena Novak');

const liveCall = (participants: VoiceParticipant[]): CallView => ({
  participants,
  status: 'connected',
  micStatus: 'live',
});

afterEach(() => {
  copyText.mockReset();
  // jsdom has no execCommand; the field copy reports failure and the API decides.
  vi.restoreAllMocks();
});

function rowOf(name: string) {
  return screen.getByText(name).closest('li')!;
}

describe('PeoplePanel', () => {
  it('lists everyone with where they are, you and the leader marked', () => {
    render(
      <PeoplePanel
        present={[me, lead, lena]}
        call={liveCall([me, lead, { ...lena, isMuted: true }])}
        leaderId="u-lead"
        joinCode={null}
        boardLive
      />,
    );

    // You first. The bubble's initials are hidden from assistive tech, so they
    // are left out of what the row says.
    const first = screen.getAllByRole('listitem')[0]!;
    first.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    expect(first.textContent).toBe('Priya Shah,(you)In call');
    expect(within(rowOf('Jordan Avery')).getByText('Leader')).toBeInTheDocument();
    expect(rowOf('Jordan Avery').querySelector('[data-leader-mark]')).not.toBeNull();
    expect(rowOf('Priya Shah').querySelector('[data-leader-mark]')).toBeNull();
    expect(within(rowOf('Lena Novak')).getByText('Muted')).toBeInTheDocument();
  });

  it('says there is no call in a session without one', () => {
    render(
      <PeoplePanel present={[me, lead]} call={null} leaderId="u-lead" joinCode={null} boardLive />,
    );
    expect(screen.getByText(/no call in this session/i)).toBeInTheDocument();
    expect(within(rowOf('Jordan Avery')).getByText('On the board')).toBeInTheDocument();
  });

  it('copies the join code and the invite link from its footer', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(true);
    render(
      <PeoplePanel present={[me]} call={null} leaderId={null} joinCode="QF7K-28MX" boardLive />,
    );

    expect(screen.getByRole('textbox', { name: 'Join code' })).toHaveValue('QF7K-28MX');

    await user.click(screen.getByRole('button', { name: 'Copy join code' }));
    expect(copyText).toHaveBeenLastCalledWith('QF7K-28MX');
    expect(screen.getByRole('button', { name: 'Copy join code' })).toHaveTextContent('Copied');

    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(copyText).toHaveBeenLastCalledWith(`${window.location.origin}/join/QF7K-28MX`);
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toHaveTextContent('Copied');
    // Only the one pressed last says so.
    expect(screen.getByRole('button', { name: 'Copy join code' })).toHaveTextContent('Code');
  });

  it('puts the link where it can be selected by hand when copying fails', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(false);
    render(
      <PeoplePanel present={[me]} call={null} leaderId={null} joinCode="QF7K-28MX" boardLive />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(screen.getByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${window.location.origin}/join/QF7K-28MX`,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/select the link and copy it yourself/i);
  });

  it('has no invite footer without a join code', () => {
    render(<PeoplePanel present={[me]} call={null} leaderId={null} joinCode={null} boardLive />);
    expect(screen.queryByRole('button', { name: 'Copy invite link' })).toBeNull();
  });

  describe("the leader's mute", () => {
    // From the leader's chair: they are "me" here.
    const leaderMe = person('u-lead', 'Jordan Avery', { isLocal: true });
    const omar = person('u-omar', 'Omar Haddad');

    function moderation(overrides: Partial<LeaderMute> = {}): LeaderMute {
      return { mute: vi.fn(async () => undefined), pending: new Set(), error: null, ...overrides };
    }

    function renderAsLeader(mod: LeaderMute) {
      render(
        <PeoplePanel
          present={[leaderMe, lena, omar, person('u-sofia', 'Sofia Rossi')]}
          call={liveCall([leaderMe, lena, { ...omar, isMuted: true }])}
          leaderId="u-lead"
          joinCode={null}
          boardLive
          moderation={mod}
        />,
      );
    }

    it('offers Mute only for someone whose microphone is on, never the leader', async () => {
      const user = userEvent.setup();
      const mod = moderation();
      renderAsLeader(mod);

      expect(
        screen.getAllByRole('button', { name: /^Mute / }).map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Mute Lena Novak']);
      // Omar is already muted, Sofia is not in the call, Jordan is the leader.
      expect(within(rowOf('Omar Haddad')).queryByRole('button')).toBeNull();
      expect(within(rowOf('Sofia Rossi')).queryByRole('button')).toBeNull();
      expect(within(rowOf('Jordan Avery')).queryByRole('button')).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Mute Lena Novak' }));
      expect(mod.mute).toHaveBeenCalledWith('u-lena');
    });

    it('holds the button while its mute is on the way', () => {
      renderAsLeader(moderation({ pending: new Set(['u-lena']) }));

      expect(screen.getByRole('button', { name: 'Mute Lena Novak' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Mute Lena Novak' })).toHaveTextContent('Muting…');
    });

    it('says when a mute did not go through', () => {
      renderAsLeader(moderation({ error: 'Could not mute them. Try again.' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Could not mute them');
    });

    it('offers nobody a Mute without moderation, as for a member', () => {
      render(
        <PeoplePanel
          present={[me, lead, lena]}
          call={liveCall([me, lead, lena])}
          leaderId="u-lead"
          joinCode={null}
          boardLive
        />,
      );

      expect(screen.queryByRole('button', { name: /^Mute / })).toBeNull();
    });
  });
});
