import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { VoiceStatus } from './useVoiceRoom';
import { VoiceReconnect } from './VoiceReconnect';

const LOST = 'Lost the voice connection. Reconnect to rejoin.';

describe('VoiceReconnect', () => {
  it('says voice is offline, and reconnects on press', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<VoiceReconnect status="failed" error={LOST} retry={retry} />);

    expect(screen.getByText('Voice offline')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reconnect voice' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps the reason the banner gave, after the banner has gone', () => {
    render(<VoiceReconnect status="failed" error={LOST} retry={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Reconnect voice' })).toHaveAccessibleDescription(
      LOST,
    );
  });

  it.each<VoiceStatus>(['idle', 'connecting', 'connected', 'reconnecting', 'unavailable'])(
    'renders nothing while voice is %s',
    (status) => {
      // `idle` includes a duplicate tab, where reconnecting would pull the
      // audio back from the other one; `unavailable` has no room to rejoin.
      const { container } = render(<VoiceReconnect status={status} error={null} retry={vi.fn()} />);

      expect(container).toBeEmptyDOMElement();
    },
  );
});
