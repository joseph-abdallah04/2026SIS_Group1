import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The frame has no assistant. If it ever reached for one, this would show it.
const fetchLlmConfig = vi.fn();
vi.mock('../assistant/api', () => ({
  fetchLlmConfig: (...args: unknown[]) => fetchLlmConfig(...args),
  streamAssistantChat: vi.fn(),
}));

const { SidePanelFrame } = await import('./SidePanelFrame');
const { useSidePanel } = await import('./useSidePanel');

function Harness() {
  const control = useSidePanel();
  return (
    <>
      <button type="button" onClick={() => control.open('people')}>
        Snapshot
      </button>
      {/* The board's assistant, asked for where there is none. */}
      <button type="button" onClick={() => control.open('assistant')}>
        Ask
      </button>
      <SidePanelFrame control={control} people={<p>Everyone here</p>} peopleCount={2} />
    </>
  );
}

const strip = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  fetchLlmConfig.mockReset();
});

describe('side panel frame (the waiting room’s)', () => {
  it('has People and Chat only, and never asks about an AI provider', () => {
    render(<Harness />);

    const tabs = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-side-tab'))
      .filter(Boolean);
    expect(tabs).toEqual(['people', 'chat']);
    expect(fetchLlmConfig).not.toHaveBeenCalled();
  });

  it('shows People and the Chat placeholder', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^people$/i));
    expect(screen.getByText('Everyone here')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(strip(/^chat$/i));
    expect(screen.getByText('Chat is coming soon')).toBeInTheDocument();
  });

  it('stays shut when asked for a tab it does not have', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    // No title over an empty body: still closed to its strip.
    expect(screen.queryByText('Assistant')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse side panel' })).toBeNull();
  });

  it('hands focus back to the strip when it closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^people$/i));
    await user.click(screen.getByRole('button', { name: 'Collapse side panel' }));

    expect(screen.queryByText('Everyone here')).toBeNull();
    expect(document.activeElement).toBe(strip(/^people$/i));
  });
});
