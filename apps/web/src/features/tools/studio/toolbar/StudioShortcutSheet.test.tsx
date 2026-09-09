import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StudioShortcutSheet } from './StudioShortcutSheet';
import { STUDIO_SHORTCUTS } from '../studioShortcuts';

describe('the shortcut sheet', () => {
  it('stays out of the way until it is asked for', () => {
    render(<StudioShortcutSheet open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every tool shortcut, so the sheet cannot fall behind the tools', () => {
    // Read from the same table the canvas dispatches on: a sheet that lists a
    // key the canvas no longer answers to is worse than no sheet.
    render(<StudioShortcutSheet open onClose={vi.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    for (const entry of STUDIO_SHORTCUTS) {
      expect(sheet).toHaveTextContent(entry.description);
      expect(sheet).toHaveTextContent(entry.label);
    }
  });

  it('names the canvas keys as well as the tools', () => {
    render(<StudioShortcutSheet open onClose={vi.fn()} />);
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Undo');
    expect(sheet).toHaveTextContent('Pan the canvas');
  });

  it('takes the focus when it opens, so a keyboard is not left on the canvas', () => {
    render(<StudioShortcutSheet open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Close shortcuts' })).toHaveFocus();
  });

  it('closes on Escape, on the button, and on the backdrop', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StudioShortcutSheet open onClose={onClose} />);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close shortcuts' }));
    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on a press inside it', async () => {
    // The backdrop closes; the sheet itself has to be safe to read.
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StudioShortcutSheet open onClose={onClose} />);
    await user.click(screen.getByText('Tools'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
