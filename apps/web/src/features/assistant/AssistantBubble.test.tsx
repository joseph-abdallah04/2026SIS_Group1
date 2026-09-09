import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The bubble asks the server whether a provider is configured on mount. Nothing here is
// testing that, so it answers "yes" and stays out of the way.
vi.mock('./api', () => ({
  fetchLlmConfig: async () => ({ config: { baseUrl: 'x', model: 'test-model', hasKey: true } }),
  streamAssistantChat: async () => undefined,
}));

const { AssistantBubble } = await import('./AssistantBubble');

const bubble = () => screen.queryByRole('button', { name: /open ai assistant/i });
const panel = () => screen.queryByRole('dialog', { name: /ai assistant/i });

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bubble and panel', () => {
  it('swaps the button for the panel, and back again', async () => {
    const user = userEvent.setup();
    render(<AssistantBubble sessionId="s1" />);

    expect(bubble()).toBeTruthy();
    expect(panel()).toBeNull();

    await user.click(bubble()!);
    // The two are never on screen together: the panel grows into the space the button held.
    expect(panel()).toBeTruthy();
    expect(bubble()).toBeNull();

    await user.click(screen.getByRole('button', { name: /close assistant/i }));
    expect(panel()).toBeNull();
    expect(bubble()).toBeTruthy();
  });

  it('returns focus to the bubble when the panel closes', async () => {
    const user = userEvent.setup();
    render(<AssistantBubble sessionId="s1" />);

    await user.click(bubble()!);
    await user.click(screen.getByRole('button', { name: /close assistant/i }));

    // Otherwise focus falls to <body> and a keyboard user loses their place entirely.
    expect(document.activeElement).toBe(bubble());
  });

  it('closes on Escape, since the button is no longer there to toggle', async () => {
    const user = userEvent.setup();
    render(<AssistantBubble sessionId="s1" />);

    await user.click(bubble()!);
    await user.keyboard('{Escape}');

    expect(panel()).toBeNull();
    expect(bubble()).toBeTruthy();
  });

  it('brings the conversation back after a remount, as a refresh would', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      'rt_assistant_chat:s1',
      JSON.stringify([{ kind: 'user', id: 'u1', text: 'What have we proposed?' }]),
    );

    render(<AssistantBubble sessionId="s1" />);
    await user.click(bubble()!);

    expect(screen.getByText('What have we proposed?')).toBeTruthy();
  });
});
