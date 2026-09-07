import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ConfirmRemoveDialog } from './ConfirmRemoveDialog';

/**
 * jsdom implements `<dialog>` as an element but not its top-layer behaviour, so
 * `showModal` and `close` have to be stood in for. Everything this dialog is
 * actually asked to do — which buttons it offers, what it says, what it calls,
 * and Escape — happens in the DOM either way.
 */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
});

function renderDialog(overrides: Partial<Parameters<typeof ConfirmRemoveDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmRemoveDialog
      kind="sticky note"
      isOwn
      pending={false}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onCancel, onConfirm };
}

describe('confirm remove dialog', () => {
  it('asks before removing, and names what is about to go', () => {
    renderDialog();

    expect(screen.getByRole('heading', { name: 'Delete this proposal?' })).toBeTruthy();
    expect(screen.getByText(/sticky note/)).toBeTruthy();
    expect(screen.getByText(/can't be undone/)).toBeTruthy();
  });

  // Cancel leaves the item untouched everywhere: the parent closes the dialog
  // and nothing is sent.
  it('cancels without deleting', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('deletes once when confirmed', async () => {
    const { onConfirm, onCancel } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  /**
   * Escape has to reach the parent rather than only closing the element, or the
   * dialog leaves the screen while the card still believes it is open.
   *
   * The `cancel` event is dispatched here rather than a key press, because
   * translating Escape into `cancel` is the browser's half of the contract and
   * jsdom does not implement it. What is worth asserting is our half: that the
   * handler tells the parent, and stops the browser closing the dialog behind
   * the parent's back.
   */
  it('cancels when the dialog is dismissed', () => {
    const { onCancel, onConfirm } = renderDialog();
    const dialog = document.body.querySelector('dialog');

    const dismissed = dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    // preventDefault, so the element cannot close itself out from under the
    // state that decides whether it is rendered at all.
    expect(dismissed).toBe(false);
  });

  it('ignores a dismissal while the delete is in flight', () => {
    const { onCancel } = renderDialog({ pending: true });

    document.body.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(onCancel).not.toHaveBeenCalled();
  });

  // Cancel takes focus so that a stray Enter, on the way to reading the
  // prompt, cannot delete the proposal.
  it('opens with Cancel focused, not Delete', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  // Removing someone else's idea deserves saying so out loud.
  it('says when a leader is removing work that is not theirs', () => {
    renderDialog({ isOwn: false, kind: 'drawing' });

    expect(screen.getByText(/someone else's drawing as session leader/)).toBeTruthy();
  });

  // While the removal is in flight neither button does anything: a second
  // press must not send a second delete, and cancelling mid-write would leave
  // the card believing nothing happened.
  it('closes both buttons while the delete is in flight', () => {
    renderDialog({ pending: true });

    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Deleting…' }).hasAttribute('disabled')).toBe(true);
  });

  // Cards sit inside the canvas's scale transform, and a transformed ancestor
  // becomes the containing block for everything under it. Left in place, the
  // prompt would inherit the board's zoom and be laid out against the card.
  it('renders outside the card, on the document body', () => {
    const { container } = render(
      <ConfirmRemoveDialog
        kind="diagram"
        isOwn
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(container.querySelector('dialog')).toBeNull();
    expect(document.body.querySelector('dialog')).not.toBeNull();
  });
});
