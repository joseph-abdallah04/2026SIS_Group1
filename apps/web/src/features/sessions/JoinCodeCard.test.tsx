import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const copyText = vi.fn();

vi.mock('../../lib/copyText', () => ({
  copyText: (...args: unknown[]) => copyText(...args),
}));

const { JoinCodeCard } = await import('./JoinCodeCard');

describe('JoinCodeCard', () => {
  beforeEach(() => {
    copyText.mockReset();
    copyText.mockResolvedValue(true);
  });

  it('shows the code and copies it', async () => {
    const user = userEvent.setup();
    render(<JoinCodeCard code="K7NP-3WQZ" />);

    expect(screen.getByLabelText('Join code')).toHaveValue('K7NP-3WQZ');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(copyText).toHaveBeenCalledWith('K7NP-3WQZ');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('explains how to copy by hand when the clipboard is refused', async () => {
    const user = userEvent.setup();
    copyText.mockResolvedValue(false);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: () => false,
    });
    render(<JoinCodeCard code="K7NP-3WQZ" />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByText(/copy it yourself/i)).toBeInTheDocument();
  });
});
