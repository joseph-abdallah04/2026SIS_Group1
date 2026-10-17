import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The assistant asks the server whether a provider is configured on mount. Nothing
// here is testing that, so it answers "yes" and stays out of the way. A reply is
// held open until the test lets it finish, so "while the panel was away" can be set up.
let finishReply: (() => void) | null = null;

vi.mock('../../lib/currentUser', () => ({
  getCurrentUserId: () => 'user-1',
  useCurrentUserId: () => 'user-1',
}));

vi.mock('../assistant/api', () => ({
  fetchLlmConfig: async () => ({ config: { baseUrl: 'x', model: 'test-model', hasKey: true } }),
  streamAssistantChat: () =>
    new Promise<void>((resolve) => {
      finishReply = resolve;
    }),
}));

const { SidePanel } = await import('./SidePanel');
const { useSidePanel } = await import('./useSidePanel');

function Harness({ suppressed = false }: { suppressed?: boolean }) {
  const control = useSidePanel();
  return (
    <>
      {/* Outside the panel, as the header's people snapshot is. */}
      <button type="button" onClick={() => control.open('people')}>
        Snapshot
      </button>
      <SidePanel
        control={control}
        suppressed={suppressed}
        people={<p>Everyone here</p>}
        peopleCount={3}
        peopleAction={<button type="button">Mute all</button>}
        sessionId="s1"
      />
    </>
  );
}

const strip = (name: RegExp) => screen.getByRole('button', { name });
const composer = () => screen.queryByPlaceholderText(/ask the assistant/i);

beforeEach(() => {
  sessionStorage.clear();
  finishReply = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('side panel', () => {
  it('starts closed to its strip of People, Chat and Assistant', () => {
    render(<Harness />);
    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-side-tab'))
      .filter(Boolean);
    expect(names).toEqual(['people', 'chat', 'assistant']);
    expect(screen.getByRole('complementary', { name: 'Side panel' })).toBeInTheDocument();
    expect(screen.queryByText('Everyone here')).toBeNull();
  });

  it('shows one feature at a time, and closes on a second press of its button', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^people$/i));
    expect(screen.getByText('Everyone here')).toBeInTheDocument();
    expect(strip(/^people$/i)).toHaveAttribute('aria-pressed', 'true');
    // The title names the feature and how many people there are.
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    await user.click(strip(/^chat$/i));
    expect(screen.queryByText('Everyone here')).toBeNull();
    expect(screen.getByText('Chat is coming soon')).toBeInTheDocument();
    expect(strip(/^people$/i)).toHaveAttribute('aria-pressed', 'false');
    expect(strip(/^chat$/i)).toHaveAttribute(
      'aria-controls',
      screen.getByText('Chat is coming soon').closest('[id]')!.id,
    );

    await user.click(strip(/^chat$/i));
    expect(screen.queryByText('Chat is coming soon')).toBeNull();
    expect(strip(/^chat$/i)).toHaveAttribute('aria-pressed', 'false');
  });

  it("puts People's header action beside the collapse arrow, and only on People", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^people$/i));
    const header = screen.getByRole('button', { name: 'Collapse side panel' }).parentElement!;
    expect(header).toContainElement(screen.getByRole('button', { name: 'Mute all' }));

    await user.click(strip(/^chat$/i));
    expect(screen.queryByRole('button', { name: 'Mute all' })).toBeNull();
  });

  it('closes from the collapse button and hands focus back to the strip', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^assistant/i));
    expect(composer()).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Collapse side panel' }));

    expect(composer()).toBeNull();
    // Otherwise focus falls to <body> and a keyboard user loses their place entirely.
    expect(document.activeElement).toBe(strip(/^assistant/i));
  });

  it('leaves the panel open on Escape, and keeps a half-typed message', async () => {
    // Escape belongs to whatever is in hand: a dialog, the studio, this field.
    // Closing the panel here used to throw the draft away, because the
    // assistant unmounts when the panel closes.
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^assistant/i));
    await user.type(composer()!, 'half a thought');
    await user.keyboard('{Escape}');

    expect(composer()).toHaveValue('half a thought');
  });

  it('does not take Escape from a dialog outside the panel', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <div role="dialog" aria-label="Delete proposal">
          <button type="button">Cancel</button>
        </div>
      </>,
    );

    await user.click(strip(/^assistant/i));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');

    expect(composer()).toBeTruthy();
  });

  it('keeps an inert strip while a ballot covers the board, and stays closed after', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);

    await user.click(strip(/^people$/i));
    rerender(<Harness suppressed />);

    const rail = screen.getByRole('complementary', { name: 'Side panel', hidden: true });
    expect(rail).toHaveAttribute('inert');
    expect(rail.querySelector('[data-side-tab="people"]')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Everyone here')).toBeNull();

    rerender(<Harness />);
    expect(screen.queryByText('Everyone here')).toBeNull();
  });

  it('ignores an open from outside while a ballot covers the board', async () => {
    // The header sits above the ballot, so its snapshot can still be pressed.
    const user = userEvent.setup();
    const { rerender } = render(<Harness suppressed />);

    await user.click(screen.getByRole('button', { name: 'Snapshot' }));
    expect(screen.queryByText('Everyone here')).toBeNull();

    rerender(<Harness />);
    expect(screen.queryByText('Everyone here')).toBeNull();
    // And it still opens normally once the vote is over.
    await user.click(screen.getByRole('button', { name: 'Snapshot' }));
    expect(screen.getByText('Everyone here')).toBeInTheDocument();
  });

  it('keeps the conversation through a switch to another feature', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^assistant/i));
    await user.type(composer()!, 'What have we proposed?{Enter}');
    expect(screen.getByText('What have we proposed?')).toBeInTheDocument();

    await user.click(strip(/^people$/i));
    await user.click(strip(/^assistant/i));
    expect(screen.getByText('What have we proposed?')).toBeInTheDocument();
  });

  it('marks an answer that lands while another feature is showing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(strip(/^assistant/i));
    await user.type(composer()!, 'Give me five stickies{Enter}');
    await user.click(strip(/^people$/i));
    // Still replying, out of sight.
    expect(strip(/^assistant, replying$/i)).toBeInTheDocument();

    await act(async () => {
      finishReply?.();
    });
    expect(strip(/^assistant, new answer$/i)).toBeInTheDocument();

    await user.click(strip(/^assistant/i));
    await user.click(strip(/^people$/i));
    // Seen, so the mark has gone.
    expect(strip(/^assistant$/i)).toBeInTheDocument();
  });

  it('brings the conversation back after a remount, as a refresh would', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(
      'rt_assistant_chat:user-1:s1',
      JSON.stringify([{ kind: 'user', id: 'u1', text: 'What have we proposed?' }]),
    );

    render(<Harness />);
    await user.click(strip(/^assistant/i));

    expect(screen.getByText('What have we proposed?')).toBeTruthy();
  });
});
