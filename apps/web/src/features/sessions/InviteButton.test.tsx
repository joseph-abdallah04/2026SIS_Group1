import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const copyText = vi.fn<(value: string) => Promise<boolean>>();
vi.mock('../../lib/copyText', () => ({ copyText: (value: string) => copyText(value) }));

const { InviteButton } = await import('./InviteButton');

const LINK = `${window.location.origin}/join/QF7K-28MX`;
const trigger = () => screen.getByRole('button', { name: 'Invite people' });
const panel = () => screen.queryByRole('dialog', { name: 'Invite people' });

afterEach(() => {
  copyText.mockReset();
});

describe('InviteButton', () => {
  it('opens a panel with the link and the code, and closes on a second press', async () => {
    const user = userEvent.setup();
    render(<InviteButton code="QF7K-28MX" />);

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(panel()).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Invite link' })).toHaveValue(LINK);
    expect(screen.getByRole('button', { name: 'Copy code QF7K-28MX' })).toBeInTheDocument();

    await user.click(trigger());
    expect(panel()).toBeNull();
  });

  it('copies the link, then the code, saying so on the one pressed', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(true);
    render(<InviteButton code="QF7K-28MX" />);
    await user.click(trigger());

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(copyText).toHaveBeenLastCalledWith(LINK);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy code QF7K-28MX' }));
    expect(copyText).toHaveBeenLastCalledWith('QF7K-28MX');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('says where to find the code when copying fails', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(false);
    render(<InviteButton code="QF7K-28MX" />);
    await user.click(trigger());

    await user.click(screen.getByRole('button', { name: 'Copy code QF7K-28MX' }));
    expect(screen.getByRole('status')).toHaveTextContent('The code is QF7K-28MX');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<InviteButton code="QF7K-28MX" />);
    await user.click(trigger());

    await user.keyboard('{Escape}');
    expect(panel()).toBeNull();
  });
});
