import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from './saveBlob';

describe('saveBlob', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('downloads under the given name and keeps the URL alive until the download has begun', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:card', revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveBlob(new Blob(['x'], { type: 'image/png' }), 'card.png');

    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('card.png');
    expect(link.href).toBe('blob:card');
    // Gone from the page, but the URL it pointed at is not revoked yet.
    expect(link.isConnected).toBe(false);
    expect(revoke).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(revoke).toHaveBeenCalledWith('blob:card');
    click.mockRestore();
  });
});
