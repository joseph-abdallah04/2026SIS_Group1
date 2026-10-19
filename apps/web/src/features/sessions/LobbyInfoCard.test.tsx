import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const copyText = vi.fn<(value: string) => Promise<boolean>>();
vi.mock('../../lib/copyText', () => ({ copyText: (value: string) => copyText(value) }));

const { LobbyInfoCard } = await import('./LobbyInfoCard');

type Props = Parameters<typeof LobbyInfoCard>[0];

function renderCard(overrides: Partial<Props> = {}) {
  return render(
    <LobbyInfoCard
      title="Q4 planning"
      leaderId="leader-1"
      leaderName="Jordan Avery"
      leaderHere
      code="K7NP-3WQZ"
      {...overrides}
    />,
  );
}

afterEach(() => {
  copyText.mockReset();
  vi.restoreAllMocks();
});

describe('LobbyInfoCard', () => {
  it('says what the session is and who runs it, without a second heading', () => {
    renderCard();

    expect(screen.getByText('Q4 planning')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Jordan Avery')).toBeInTheDocument();
    expect(screen.queryByText(/not here yet/)).not.toBeInTheDocument();
  });

  it('says when the leader is not here, and only once that is known', () => {
    const { rerender } = renderCard({ leaderHere: null });
    expect(screen.queryByText(/not here yet/)).not.toBeInTheDocument();

    rerender(
      <LobbyInfoCard
        title="Q4 planning"
        leaderId="leader-1"
        leaderName={null}
        leaderHere={false}
        code="K7NP-3WQZ"
      />,
    );
    expect(screen.getByText('the leader')).toBeInTheDocument();
    expect(screen.getByText(/not here yet/)).toBeInTheDocument();
  });

  it('shows the code as tiles read as one code', () => {
    renderCard();
    expect(screen.getByRole('img', { name: 'K7NP-3WQZ' })).toBeInTheDocument();
  });

  it('copies the link and the code', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(true);
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(copyText).toHaveBeenLastCalledWith(`${window.location.origin}/join/K7NP-3WQZ`);
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toHaveTextContent('Copied');

    await user.click(screen.getByRole('button', { name: 'Copy join code' }));
    expect(copyText).toHaveBeenLastCalledWith('K7NP-3WQZ');
    expect(screen.getByRole('button', { name: 'Copy join code' })).toHaveTextContent('Copied');
  });

  it('puts the link where it can be selected by hand when copying fails', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(false);
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(screen.getByRole('textbox', { name: 'Invite link' })).toHaveValue(
      `${window.location.origin}/join/K7NP-3WQZ`,
    );
    expect(screen.getByText(/Could not copy automatically/)).toBeInTheDocument();
  });

  it('presents the invite full-screen, and puts it away on Escape, back to its button', async () => {
    const user = userEvent.setup();
    renderCard();
    const present = screen.getByRole('button', { name: 'Present the invite' });

    await user.click(present);
    const dialog = screen.getByRole('dialog', { name: 'Join Q4 planning' });
    expect(dialog).toHaveTextContent(`${window.location.host}/join/K7NP-3WQZ`);
    expect(screen.getAllByRole('img', { name: 'K7NP-3WQZ' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(present).toHaveFocus();
  });

  it('puts the presented invite away on a click anywhere', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Present the invite' }));
    await user.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no invite without a code', () => {
    renderCard({ code: null });
    expect(screen.queryByRole('button', { name: 'Copy invite link' })).not.toBeInTheDocument();
  });
});
