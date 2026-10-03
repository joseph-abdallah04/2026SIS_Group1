import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The bubble asks the server whether a provider is configured on mount. Nothing here is
// testing that, so it answers "yes" and stays out of the way.
vi.mock('../../lib/currentUser', () => ({
  getCurrentUserId: () => 'user-1',
  useCurrentUserId: () => 'user-1',
}));

vi.mock('./api', () => ({
  fetchLlmConfig: async () => ({ config: { baseUrl: 'x', model: 'test-model', hasKey: true } }),
  streamAssistantChat: async () => undefined,
}));

const { AssistantBubble } = await import('./AssistantBubble');

const expand = () => screen.queryByRole('button', { name: /expand assistant/i });
const composer = () => screen.queryByPlaceholderText(/ask the assistant/i);

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assistant rail', () => {
  it('swaps the strip for the panel, and back again', async () => {
    const user = userEvent.setup();
    render(<AssistantBubble sessionId="s1" />);

    expect(expand()).toBeTruthy();
    expect(composer()).toBeNull();
    expect(document.querySelector('aside')?.className).toMatch(/w-11/);

    await user.click(expand()!);
    // The strip button is gone while the rail is open — collapse takes its place.
    expect(composer()).toBeTruthy();
    expect(expand()).toBeNull();
    expect(document.querySelector('aside')?.className).toMatch(/border-l/);
    expect(document.querySelector('aside')?.className).toMatch(/w-96/);

    await user.click(screen.getByRole('button', { name: /collapse assistant/i }));
    expect(composer()).toBeNull();
    expect(expand()).toBeTruthy();
  });

  it('returns focus to the strip when the panel closes', async () => {
    const user = userEvent.setup();
    render(<AssistantBubble sessionId="s1" />);

    await user.click(expand()!);
    await user.click(screen.getByRole('button', { name: /collapse assistant/i }));

    // Otherwise focus falls to <body> and a keyboard user loses their place entirely.
    expect(document.activeElement).toBe(expand());
  });

  it('collapses on Escape', async () => {
    const user = userEvent.setup();
    render(<AssistantBubble sessionId="s1" />);

    await user.click(expand()!);
    await user.keyboard('{Escape}');

    expect(composer()).toBeNull();
    expect(expand()).toBeTruthy();
  });

  it('brings the conversation back after a remount, as a refresh would', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      'rt_assistant_chat:user-1:s1',
      JSON.stringify([{ kind: 'user', id: 'u1', text: 'What have we proposed?' }]),
    );

    render(<AssistantBubble sessionId="s1" />);
    await user.click(expand()!);

    expect(screen.getByText('What have we proposed?')).toBeTruthy();
  });
});
