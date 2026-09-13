import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthoredProposalsResponse } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

vi.mock('../tools/CreativeToolsContext', () => ({
  useCreativeTools: () => ({ openEditorForExtend: vi.fn() }),
}));

const { api } = await import('../../lib/api');
const { MyProposalsLauncher } = await import('./MyProposalsLauncher');

const EMPTY: AuthoredProposalsResponse = {
  sessionId: 's1',
  currentQuestionId: 'q1',
  groups: [],
};

function renderLauncher() {
  render(<MyProposalsLauncher sessionId="s1" revision="r1" canPropose />);
  return screen.getByRole('button', { name: /reuse/i });
}

describe('my proposals launcher', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  // A list that never arrived is not an empty list. The panel is the only
  // place the reason is written, so a dead button would hide it behind a
  // tooltip that says the opposite of what happened.
  it('still opens after the list fails to load, and says why', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network unreachable'));

    const button = renderLauncher();
    await vi.waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));

    await userEvent.click(button);

    expect(screen.getByRole('alert').textContent).toContain('Network unreachable');
  });

  it('does not claim there is nothing to reuse when the list failed', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network unreachable'));

    const button = renderLauncher();

    await vi.waitFor(() => expect(button.getAttribute('title')).toContain('could not be loaded'));
  });

  // The button stays dim when the answer is known and it is nothing, which is
  // the ordinary state on the first question of a session.
  it('stays closed when the list loads and there is nothing to reuse', async () => {
    vi.mocked(api.get).mockResolvedValue(EMPTY);

    const button = renderLauncher();

    await vi.waitFor(() => expect(button.getAttribute('title')).toContain('Nothing to reuse yet'));
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
