import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../toolbar/CreativeToolbar';
import { CreativeStudio } from './CreativeStudio';
import { useCreativeTools } from './CreativeToolsContext';
import { CreativeToolsProvider } from './CreativeToolsProvider';

interface HarnessProps {
  initialEntry?: string;
  isLive?: boolean;
  proposals?: BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
  sessionId?: string;
  viewerId?: string | null;
  children?: React.ReactNode;
}

function Harness({
  initialEntry = '/sessions/demo',
  isLive = true,
  proposals = [],
  propose,
  sessionId,
  viewerId = null,
  children,
}: HarnessProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreativeToolsProvider
        sessionId={sessionId}
        viewerId={viewerId}
        isLive={isLive}
        proposals={proposals}
        propose={propose}
        editProposal={async () => {}}
      >
        <CreativeToolbar />
        {children}
        <CreativeStudio />
      </CreativeToolsProvider>
    </MemoryRouter>
  );
}

function ExtendButton({ proposal }: { proposal: BoardItem }) {
  const { openEditorForExtend } = useCreativeTools();
  return <button onClick={() => openEditorForExtend(proposal)}>Extend fixture</button>;
}

describe('creative sticky flow', () => {
  it('trims and proposes a coloured sticky through the existing write contract', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(screen.getByLabelText('Note'), '  Keep the idea focused.  ');
    await user.click(screen.getByRole('button', { name: 'pink sticky' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith({
      type: 'sticky',
      artifactJson: {
        type: 'sticky',
        text: 'Keep the idea focused.',
        color: 'pink',
      },
      x: 32,
      y: 32,
    });
    // The sticky is on the board behind it, so the popup gets out of the way
    // instead of confirming what the board is already showing.
    await waitFor(() => expect(screen.queryByLabelText('Note')).not.toBeInTheDocument());
  });

  it('prevents duplicate writes while a proposal is in flight', async () => {
    const user = userEvent.setup();
    let finishProposal: (() => void) | undefined;
    const propose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishProposal = resolve;
        }),
    );
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(screen.getByLabelText('Note'), 'Only submit this once');
    const proposeButton = screen.getByRole('button', { name: 'Propose' });
    await user.click(proposeButton);

    expect(proposeButton).toBeDisabled();
    await user.click(proposeButton);
    expect(propose).toHaveBeenCalledTimes(1);

    await act(async () => finishProposal?.());
    // The sticky is on the board behind it, so the popup gets out of the way
    // instead of confirming what the board is already showing.
    await waitFor(() => expect(screen.queryByLabelText('Note')).not.toBeInTheDocument());
  });

  it('keeps the write lock when the popup closes before acknowledgement', async () => {
    const user = userEvent.setup();
    let finishProposal: (() => void) | undefined;
    const propose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishProposal = resolve;
        }),
    );
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(screen.getByLabelText('Note'), 'Keep this write locked');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: 'New sticky' })).toBeDisabled();
    expect(propose).toHaveBeenCalledTimes(1);

    await act(async () => finishProposal?.());
    expect(screen.getByRole('button', { name: 'New sticky' })).toBeEnabled();
  });

  it('stops taking text once the note fills the largest sticky', async () => {
    // A stand-in layout in which a note longer than twelve characters overflows
    // the largest sticky, whatever the character count says.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const note = this.querySelector('p')?.textContent ?? '';
        const width = parseFloat(this.style.width) || 0;
        return { width, height: note.length > 12 ? width + 50 : 100 } as DOMRect;
      });
    try {
      const user = userEvent.setup();
      render(<Harness propose={vi.fn(async () => undefined)} />);

      await user.click(screen.getByRole('button', { name: 'New sticky' }));
      await user.type(screen.getByLabelText('Note'), 'Keep the idea focused.');

      // Trailing spaces still go in: they take no room, and proposing trims them.
      expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value.trim()).toBe(
        'Keep the ide',
      );
    } finally {
      rect.mockRestore();
    }
  });

  it('disables creation while offline', () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness isLive={false} propose={propose} />);

    expect(screen.getByRole('button', { name: 'New sticky' })).toBeDisabled();
  });

  it('turns a server acknowledgement code into actionable copy', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => Promise.reject({ code: 'QUESTION_CLOSED' }));
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(screen.getByLabelText('Note'), 'A late idea');
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This question is no longer accepting proposals.',
    );
  });

  it('prefills a copied sticky and preserves its parent link', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => undefined);
    const parent: BoardItem = {
      id: 'proposal-parent',
      questionId: 'question-1',
      authorId: 'user-1',
      authorName: 'Alice',
      type: 'sticky',
      artifactJson: { type: 'sticky', text: 'Original idea', color: 'blue' },
      x: 32,
      y: 32,
      createdAt: '2026-09-02T00:00:00.000Z',
      editedAt: null,
      extendsProposalId: null,
      reactions: [],
    };

    render(
      <MemoryRouter initialEntries={['/sessions/demo']}>
        <CreativeToolsProvider
          viewerId={null}
          isLive
          proposals={[parent]}
          propose={propose}
          editProposal={async () => {}}
        >
          <ExtendButton proposal={parent} />
          <CreativeStudio />
        </CreativeToolsProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Extend fixture' }));
    expect(screen.getByLabelText('Note')).toHaveValue('Original idea');
    expect(screen.getByText("Extending Alice's sticky")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({ extendsProposalId: 'proposal-parent' }),
    );
  });
});

describe('sticky drafts', () => {
  const parent: BoardItem = {
    id: 'proposal-parent',
    questionId: 'question-1',
    authorId: 'user-2',
    authorName: 'Alice',
    type: 'sticky',
    artifactJson: { type: 'sticky', text: 'Original idea', color: 'blue' },
    x: 32,
    y: 32,
    createdAt: '2026-09-02T00:00:00.000Z',
    editedAt: null,
    extendsProposalId: null,
    reactions: [],
  };

  const inSession = { sessionId: 'session-1', viewerId: 'user-1' };
  const note = () => screen.queryByLabelText('Note') as HTMLTextAreaElement | null;

  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps what was written, colour included, when the popup is closed', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'Half an idea');
    await user.click(screen.getByRole('button', { name: 'pink sticky' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(note()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'New sticky' }));

    expect(note()).toHaveValue('Half an idea');
    expect(screen.getByRole('button', { name: 'pink sticky' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // The board is not locked behind the popup: a press on it closes the popup
  // and still does what it was a press on.
  it('closes on a press outside, lets the press through, and keeps the note', async () => {
    const user = userEvent.setup();
    const onBoard = vi.fn();
    render(
      <Harness propose={vi.fn(async () => undefined)} {...inSession}>
        <button onClick={onBoard}>Something on the board</button>
      </Harness>,
    );

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'Half an idea');
    await user.click(screen.getByRole('button', { name: 'Something on the board' }));

    expect(note()).toBeNull();
    expect(onBoard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    expect(note()).toHaveValue('Half an idea');
  });

  it('stays open on a press inside it', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.click(screen.getByRole('button', { name: 'blue sticky' }));
    await user.click(note()!);

    expect(note()).not.toBeNull();
  });

  // Pressing it would otherwise close the popup and open it straight back.
  it('stays open when its own toolbar button is pressed again', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'Still here');
    const opened = note();
    await user.click(screen.getByRole('button', { name: 'New sticky' }));

    expect(note()).toBe(opened);
  });

  it('closes on Escape and hands focus back to what opened it', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    const opener = screen.getByRole('button', { name: 'New sticky' });
    await user.click(opener);
    await user.keyboard('{Escape}');

    expect(note()).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('starts empty again once the draft has been proposed', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'Ship it');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await waitFor(() => expect(note()).toBeNull());

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    expect(note()).toHaveValue('');
  });

  // The popup can be closed while a proposal is still on its way. The note
  // that lands must not come back as a draft.
  it('drops the draft when a proposal lands after the popup was closed', async () => {
    const user = userEvent.setup();
    let land: (() => void) | undefined;
    const propose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          land = resolve;
        }),
    );
    render(<Harness propose={propose} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'On its way');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => land?.());

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    expect(note()).toHaveValue('');
  });

  // Extending opens on somebody else's words. Reading the draft into it would
  // mix two notes, and writing it back would lose the draft.
  it('leaves the draft alone while extending another sticky', async () => {
    const user = userEvent.setup();
    render(
      <Harness propose={vi.fn(async () => undefined)} proposals={[parent]} {...inSession}>
        <ExtendButton proposal={parent} />
      </Harness>,
    );

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'My own idea');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Extend fixture' }));
    expect(note()).toHaveValue('Original idea');
    await user.type(note()!, ' and more');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    expect(note()).toHaveValue('My own idea');
  });

  // No session or no signed-in viewer means nowhere to keep a draft for.
  it('keeps nothing where there is nobody to keep it for', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'Nowhere to go');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'New sticky' }));

    expect(note()).toHaveValue('');
    expect(localStorage.length).toBe(0);
  });
});

describe('closing the sticky popup', () => {
  const note = () => screen.queryByLabelText('Note') as HTMLTextAreaElement | null;

  /** Answers media queries the way a browser would, with or without reduced motion. */
  function motion({ reduced }: { reduced: boolean }) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: reduced && query.includes('reduce'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  }

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('fades out before it goes', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Still there, on its way out, and no longer taking presses.
    expect(note()?.closest('form')).toHaveClass('rt-sticky-popup-fade');
    expect(screen.getByRole('dialog')).toHaveClass('pointer-events-none');
    await waitFor(() => expect(note()).toBeNull());
  });

  it('goes at once for somebody who has asked for less motion', async () => {
    motion({ reduced: true });
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(note()).toBeNull();
  });

  // Pressing New sticky while it fades is asking for it back, not a second
  // close that lands a moment later and shuts it anyway.
  it('comes back if its own button is pressed while it fades', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await user.type(note()!, 'Wait');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'New sticky' }));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(note()).toHaveValue('Wait');
    expect(note()?.closest('form')).toHaveClass('rt-sticky-popup-rise');
  });
});
