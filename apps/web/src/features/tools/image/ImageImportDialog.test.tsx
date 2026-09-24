import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImageArtifact } from '@roundtable/shared';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProposeResult } from '../CreativeToolsContext';
import { ImageImportDialog } from './ImageImportDialog';
import { ImageImportError, type DecodedImage } from './imageEncoding';
import { TINY_PNG } from './testImages';

// jsdom has no object URLs; the dialog only needs something to point <img> at.
beforeAll(() => {
  URL.createObjectURL ??= vi.fn(() => 'blob:picture');
  URL.revokeObjectURL ??= vi.fn();
});

const photo = new File(['bytes'], 'whiteboard.png', { type: 'image/png' });

/** A picture as the decoder would hand it over, without decoding anything. */
function decoded(width = 1200, height = 800): DecodedImage {
  return { bitmap: { close: vi.fn() } as unknown as ImageBitmap, width, height };
}

function renderDialog({
  decode = vi.fn(async () => decoded()),
  encode = vi.fn(
    async (_: DecodedImage, crop: { width: number; height: number }) =>
      ({
        type: 'image',
        src: TINY_PNG,
        width: crop.width,
        height: crop.height,
      }) satisfies ImageArtifact,
  ),
  onPropose = vi.fn(async (): Promise<ProposeResult> => ({ ok: true })),
  onClose = vi.fn(),
} = {}) {
  render(
    <ImageImportDialog
      file={photo}
      decode={decode}
      encode={encode as never}
      onPropose={onPropose}
      onClose={onClose}
    />,
  );
  return { decode, encode, onPropose, onClose };
}

describe('ImageImportDialog', () => {
  it('proposes the whole picture when nothing is changed', async () => {
    const user = userEvent.setup();
    const { encode, onPropose, onClose } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Propose image' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(encode).toHaveBeenCalledWith(expect.anything(), {
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
    });
    expect(onPropose).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image', width: 1200, height: 800 }),
    );
  });

  // A drop and then Enter puts the picture up without reaching for the mouse.
  it('is ready to propose with Enter the moment the picture is read', async () => {
    const user = userEvent.setup();
    const { onPropose } = renderDialog();

    const propose = await screen.findByRole('button', { name: 'Propose image' });
    await waitFor(() => expect(propose).toHaveFocus());
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onPropose).toHaveBeenCalledTimes(1));
  });

  // Like every other proposal: nothing to label, nothing to fill in.
  it('asks for no caption', async () => {
    renderDialog();
    await screen.findByRole('button', { name: 'Propose image' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  /**
   * Drags a handle of the frame by a distance in the picture's own pixels,
   * turned into screen pixels at whatever size the dialog draws the picture.
   */
  function dragHandle(handle: string, pictureDx: number, pictureDy: number) {
    const target = document.querySelector<HTMLElement>(`[data-crop-handle="${handle}"]`)!;
    const cropper = screen.getByRole('group', { name: /crop area/i }).parentElement!;
    const scale = parseFloat(cropper.style.width) / 1200;
    const dx = pictureDx * scale;
    const dy = pictureDy * scale;
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: 500, clientY: 400 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 500 + dx, clientY: 400 + dy });
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 500 + dx, clientY: 400 + dy });
  }

  it('crops by dragging the frame, and puts the whole picture back on Reset', async () => {
    const user = userEvent.setup();
    const { encode } = renderDialog();

    // Said once, until somebody crops.
    expect(await screen.findByText(/drag the edges to crop/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();

    dragHandle('se', -200, -100);
    expect(screen.getByText('1000 × 700')).toBeInTheDocument();
    expect(screen.queryByText(/drag the edges to crop/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /reset/i }));
    // The whole picture again: the hint is back, and the size of a picture
    // nobody has cropped is not shown.
    expect(screen.getByText(/drag the edges to crop/i)).toBeInTheDocument();
    expect(screen.queryByText(/\d+ × \d+/)).toBeNull();

    dragHandle('w', 100, 0);
    await user.click(screen.getByRole('button', { name: 'Propose image' }));
    await waitFor(() =>
      expect(encode).toHaveBeenCalledWith(expect.anything(), {
        x: 100,
        y: 0,
        width: 1100,
        height: 800,
      }),
    );
  });

  it('moves the frame with the arrow keys', async () => {
    renderDialog();
    await screen.findByText(/drag the edges to crop/i);

    dragHandle('se', -200, -100);
    const frame = screen.getByRole('group', { name: /crop area/i });
    const before = frame.style.left;
    fireEvent.keyDown(frame, { key: 'ArrowRight' });

    expect(frame.style.left).not.toBe(before);
  });

  // A rejection from the board is said in the dialog, and the crop survives it.
  it('keeps the dialog open with the reason when the board refuses', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({
      onPropose: vi.fn(async () => ({ ok: false as const, error: 'Proposals are locked' })),
    });

    await user.click(await screen.findByRole('button', { name: 'Propose image' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Proposals are locked');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Propose image' })).toBeEnabled();
  });

  it('says why a file could not be read', async () => {
    renderDialog({
      decode: vi.fn(async () => {
        throw new ImageImportError('This image could not be read here. Try a PNG or JPEG.');
      }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/try a png or jpeg/i);
    expect(screen.getByRole('button', { name: 'Propose image' })).toBeDisabled();
  });

  it('closes on Escape and on Cancel', async () => {
    const user = userEvent.setup();
    const first = renderDialog();
    await screen.findByRole('button', { name: 'Propose image' });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(first.onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(first.onClose).toHaveBeenCalledTimes(2);
  });

  // Closing mid-propose would drop the result the person is waiting on.
  it('cannot be closed while it is proposing', async () => {
    const user = userEvent.setup();
    let land: (value: { ok: true }) => void = () => {};
    const { onClose } = renderDialog({
      onPropose: vi.fn(() => new Promise<{ ok: true }>((resolve) => (land = resolve))),
    });

    await user.click(await screen.findByRole('button', { name: 'Propose image' }));
    await screen.findByRole('button', { name: /proposing/i });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => land({ ok: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
