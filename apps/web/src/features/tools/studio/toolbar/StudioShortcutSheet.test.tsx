import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StudioShortcutSheet } from './StudioShortcutSheet';
import { STUDIO_SHORTCUTS } from '../studioShortcuts';

function renderSheet(open: boolean, onClose = vi.fn()) {
  const triggerRef = createRef<HTMLButtonElement>();
  render(
    <>
      <button ref={triggerRef} type="button">
        ?
      </button>
      <StudioShortcutSheet open={open} onClose={onClose} triggerRef={triggerRef} />
    </>,
  );
  return { onClose, triggerRef };
}

describe('the shortcut sheet', () => {
  it('stays out of the way until it is asked for', () => {
    renderSheet(false);
    expect(screen.queryByRole('group', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('lists every tool shortcut, so the sheet cannot fall behind the tools', () => {
    // Read from the same table the canvas dispatches on: a sheet that lists a
    // key the canvas no longer answers to is worse than no sheet.
    renderSheet(true);
    const sheet = screen.getByRole('group', { name: 'Keyboard shortcuts' });
    for (const entry of STUDIO_SHORTCUTS) {
      expect(sheet).toHaveTextContent(entry.description);
      expect(sheet).toHaveTextContent(entry.label);
    }
  });

  it('names the canvas keys as well as the tools', () => {
    renderSheet(true);
    const sheet = screen.getByRole('group', { name: 'Keyboard shortcuts' });
    expect(sheet).toHaveTextContent('Undo');
    expect(sheet).toHaveTextContent('Pan the canvas');
  });

  it('leaves the canvas visible: it is a reference, not a modal', () => {
    // Dimming the whole board to read one line of a key list is out of
    // proportion to what the list is for.
    renderSheet(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape and on a press outside it', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet(true);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Escape to itself, so dismissing it cannot close the studio', async () => {
    // The studio is a native <dialog>: an un-prevented Escape is a close
    // request, and the browser shuts the whole editor on it. Stopping the
    // keydown does not reach that — only preventing its default does — so
    // dismissing any sub-toolbar used to take the canvas down with it.
    const user = userEvent.setup();
    renderSheet(true);

    let seen: KeyboardEvent | null = null;
    const listener = (event: KeyboardEvent) => {
      seen = event;
    };
    // Capture phase, like the sheet's own handler: listeners on the same node
    // run in registration order and are not cut off by `stopPropagation`.
    document.addEventListener('keydown', listener, true);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', listener, true);

    expect(seen).not.toBeNull();
    expect(seen!.defaultPrevented).toBe(true);
  });

  it('does not close on a press inside it', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet(true);
    await user.click(screen.getByText('Tools'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
