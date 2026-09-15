import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../toolbar/CreativeToolbar';
import { STICKY_MAX_LINES, STICKY_TEXT_LIMIT } from './artifactLimits';
import { CreativeStudio } from './CreativeStudio';
import { useCreativeTools } from './CreativeToolsContext';
import { CreativeToolsProvider } from './CreativeToolsProvider';
import { draftKeyFor } from './sticky/stickyDraft';

interface HarnessProps {
  initialEntry?: string;
  isLive?: boolean;
  proposals?: BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
  sessionId?: string;
  questionId?: string;
  viewerId?: string | null;
  children?: React.ReactNode;
}

function Harness({
  initialEntry = '/sessions/demo',
  isLive = true,
  proposals = [],
  propose,
  sessionId = 'session-1',
  questionId = 'question-1',
  viewerId = null,
  children,
}: HarnessProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreativeToolsProvider
        sessionId={sessionId}
        questionId={questionId}
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

/**
 * Selects characters `from` to `to` of the note, as a drag across them would.
 * Every line is an element of its own, and the break between two counts once.
 */
function selectInNote(note: HTMLElement, from: number, to: number) {
  const points: { node: Node; offset: number }[] = [];
  let reached = 0;
  for (const line of note.querySelectorAll('.rt-sticky-line')) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = (node as Text).data.length;
      for (const target of [from, to]) {
        if (points.length < 2 && target >= reached && target <= reached + length) {
          points.push({ node, offset: target - reached });
        }
      }
      reached += length;
    }
    reached += 1;
  }
  const [start, end] = points;
  if (!start || !end) throw new Error('selection outside the note');
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
  document.dispatchEvent(new Event('selectionchange'));
}

function ExtendButton({ proposal }: { proposal: BoardItem }) {
  const { openEditorForExtend } = useCreativeTools();
  return <button onClick={() => openEditorForExtend(proposal)}>Extend fixture</button>;
}

function EditButton({ proposal, label = 'Edit fixture' }: { proposal: BoardItem; label?: string }) {
  const { openEditorForEdit } = useCreativeTools();
  return <button onClick={() => openEditorForEdit(proposal)}>{label}</button>;
}

describe('creative sticky flow', () => {
  it('proposes a coloured sticky exactly as typed through the existing write contract', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(screen.getByLabelText('Note'), '  Keep the idea focused.  ');
    await user.click(screen.getByRole('button', { name: 'pink sticky' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith({
      type: 'sticky',
      artifactJson: {
        type: 'sticky',
        // Spaces and all: whitespace may be deliberate, so none of it is tidied.
        text: '  Keep the idea focused.  ',
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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(screen.getByLabelText('Note'), 'Keep this write locked');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: 'Sticky' })).toBeDisabled();
    expect(propose).toHaveBeenCalledTimes(1);

    await act(async () => finishProposal?.());
    expect(screen.getByRole('button', { name: 'Sticky' })).toBeEnabled();
  });

  // Enter held down stops at the line limit, and the count says why.
  it('stops starting new lines at the line limit, and says so', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(screen.getByLabelText('Note'), `Idea${'{Enter}'.repeat(STICKY_MAX_LINES + 5)}`);

    expect(screen.getByLabelText('Note').querySelectorAll('.rt-sticky-line')).toHaveLength(
      STICKY_MAX_LINES,
    );
    expect(screen.getByText(`${STICKY_MAX_LINES} lines max`)).toBeInTheDocument();

    await user.keyboard('{Backspace}');
    expect(screen.queryByText(`${STICKY_MAX_LINES} lines max`)).toBeNull();
  });

  // The limit is a count of characters. Past it, nothing more goes in, pasted
  // or typed, and the count says Full rather than a number.
  it('stops at the character limit and says Full', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.click(screen.getByLabelText('Note'));
    await user.paste('a'.repeat(STICKY_TEXT_LIMIT + 40));

    expect(screen.getByLabelText('Note').textContent).toHaveLength(STICKY_TEXT_LIMIT);
    expect(screen.getByText('Full')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Note'), 'more');
    expect(screen.getByLabelText('Note').textContent).toHaveLength(STICKY_TEXT_LIMIT);
  });

  it('proposes the formatting with the words', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    const note = screen.getByLabelText('Note');
    await user.type(note, 'Ship the beta');
    selectInNote(note, 0, 4);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    selectInNote(note, 9, 13);
    await user.click(screen.getByRole('button', { name: 'Italic' }));
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactJson: {
          type: 'sticky',
          text: 'Ship the beta',
          color: 'yellow',
          marks: [
            { from: 0, to: 4, style: 'bold' },
            { from: 9, to: 13, style: 'italic' },
          ],
        },
      }),
    );
  });

  it('proposes links and nested lists with the words', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    const note = screen.getByLabelText('Note');
    await user.type(note, '- Plan{Enter}Read the spec{Tab}');
    selectInNote(note, 14, 18);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    // Enter in the address applies the link; it must not propose the sticky.
    await user.type(screen.getByRole('textbox', { name: 'Link address' }), 'example.com{Enter}');
    expect(propose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactJson: {
          type: 'sticky',
          text: 'Plan\nRead the spec',
          color: 'yellow',
          lines: ['bullet', 'bullet'],
          levels: [0, 1],
          links: [{ from: 14, to: 18, href: 'https://example.com/' }],
        },
      }),
    );
  });

  // Bold pressed with nothing selected is for what is typed next, the way a
  // word processor carries on.
  it('types in bold after Bold is pressed with nothing selected, until it is pressed again', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => undefined);
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    const note = screen.getByLabelText('Note');
    await user.click(note);
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('Loud');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await user.keyboard(' quiet');
    await user.click(screen.getByRole('button', { name: 'Propose' }));

    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactJson: expect.objectContaining({
          text: 'Loud quiet',
          marks: [{ from: 0, to: 4, style: 'bold' }],
        }),
      }),
    );
  });

  it('formats with the keyboard shortcuts too', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    const note = screen.getByLabelText('Note');
    await user.type(note, 'Underlined');
    selectInNote(note, 0, 10);
    await user.keyboard('{Control>}u{/Control}');

    expect(note.querySelector('[data-sticky-styles="underline"]')).toHaveTextContent('Underlined');
    expect(screen.getByRole('button', { name: 'Underline' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // Only the words come in. Whatever was pasted is never read as markup.
  it('pastes only the words, never markup', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    const note = screen.getByLabelText('Note');
    await user.click(note);
    await user.paste('<b onmouseover="alert(1)">Loud</b>');

    expect(note.textContent).toBe('<b onmouseover="alert(1)">Loud</b>');
    expect(note.querySelector('b')).toBeNull();
  });

  it('undoes and redoes what was written', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    const note = screen.getByLabelText('Note');
    await user.type(note, 'Hello');
    await user.keyboard('{Control>}z{/Control}');
    expect(note.textContent).toBe('');

    await user.keyboard('{Control>}y{/Control}');
    expect(note.textContent).toBe('Hello');
  });

  it('disables creation while offline', () => {
    const propose = vi.fn(async () => undefined);
    render(<Harness isLive={false} propose={propose} />);

    expect(screen.getByRole('button', { name: 'Sticky' })).toBeDisabled();
  });

  it('turns a server acknowledgement code into actionable copy', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(async () => Promise.reject({ code: 'QUESTION_CLOSED' }));
    render(<Harness propose={propose} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
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
          sessionId="session-1"
          questionId="question-1"
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
    expect(screen.getByLabelText('Note')?.textContent).toBe('Original idea');
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
  const note = () => screen.queryByLabelText('Note') as HTMLElement | null;

  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps what was written, colour included, when the popup is closed', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'Half an idea');
    await user.click(screen.getByRole('button', { name: 'pink sticky' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(note()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Sticky' }));

    expect(note()?.textContent).toBe('Half an idea');
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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'Half an idea');
    await user.click(screen.getByRole('button', { name: 'Something on the board' }));

    expect(note()).toBeNull();
    expect(onBoard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(note()?.textContent).toBe('Half an idea');
  });

  it('stays open on a press inside it', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.click(screen.getByRole('button', { name: 'blue sticky' }));
    await user.click(note()!);

    expect(note()).not.toBeNull();
  });

  // Pressing it would otherwise close the popup and open it straight back.
  it('stays open when its own toolbar button is pressed again', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'Still here');
    const opened = note();
    await user.click(screen.getByRole('button', { name: 'Sticky' }));

    expect(note()).toBe(opened);
  });

  it('closes on Escape and hands focus back to what opened it', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    const opener = screen.getByRole('button', { name: 'Sticky' });
    await user.click(opener);
    await user.keyboard('{Escape}');

    expect(note()).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('starts empty again once the draft has been proposed', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} {...inSession} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'Ship it');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await waitFor(() => expect(note()).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(note()?.textContent).toBe('');
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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'On its way');
    await user.click(screen.getByRole('button', { name: 'Propose' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => land?.());

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(note()?.textContent).toBe('');
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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'My own idea');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Extend fixture' }));
    expect(note()?.textContent).toBe('Original idea');
    await user.type(note()!, ' and more');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(note()?.textContent).toBe('My own idea');
  });

  describe('while editing a sticky', () => {
    const mine: BoardItem = { ...parent, id: 'proposal-mine', authorId: 'user-1' };
    const other: BoardItem = {
      ...mine,
      id: 'proposal-other',
      artifactJson: { type: 'sticky', text: 'Second idea', color: 'green' },
    };

    // Closing an edit halfway, by a press on the board, keeps what was changed.
    it('keeps the edit as a draft of its own, and opens it again on that sticky', async () => {
      const user = userEvent.setup();
      render(
        <Harness propose={vi.fn(async () => undefined)} proposals={[mine]} {...inSession}>
          <EditButton proposal={mine} />
        </Harness>,
      );

      await user.click(screen.getByRole('button', { name: 'Edit fixture' }));
      await user.type(note()!, ' made better');
      await user.click(screen.getByRole('button', { name: 'pink sticky' }));
      await user.click(screen.getByRole('button', { name: 'Close' }));

      await user.click(screen.getByRole('button', { name: 'Edit fixture' }));
      expect(note()?.textContent).toBe('Original idea made better');
      expect(screen.getByRole('button', { name: 'pink sticky' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('keeps each edit apart, and apart from the new sticky being written', async () => {
      const user = userEvent.setup();
      render(
        <Harness propose={vi.fn(async () => undefined)} proposals={[mine, other]} {...inSession}>
          <EditButton proposal={mine} />
          <EditButton proposal={other} label="Edit other fixture" />
        </Harness>,
      );

      await user.click(screen.getByRole('button', { name: 'Sticky' }));
      await user.type(note()!, 'Brand new');
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(screen.getByRole('button', { name: 'Edit fixture' }));
      await user.type(note()!, ' one');
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(screen.getByRole('button', { name: 'Edit other fixture' }));
      await user.type(note()!, ' two');
      await user.click(screen.getByRole('button', { name: 'Close' }));

      await user.click(screen.getByRole('button', { name: 'Edit fixture' }));
      expect(note()?.textContent).toBe('Original idea one');
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(screen.getByRole('button', { name: 'Edit other fixture' }));
      expect(note()?.textContent).toBe('Second idea two');
      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(screen.getByRole('button', { name: 'Sticky' }));
      expect(note()?.textContent).toBe('Brand new');
    });

    it('keeps nothing for an edit opened and closed without a change', async () => {
      const user = userEvent.setup();
      render(
        <Harness propose={vi.fn(async () => undefined)} proposals={[mine]} {...inSession}>
          <EditButton proposal={mine} />
        </Harness>,
      );

      await user.click(screen.getByRole('button', { name: 'Edit fixture' }));
      await user.type(note()!, '!');
      await user.keyboard('{Backspace}');
      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(localStorage.length).toBe(0);
    });

    // Once the proposal is updated, the next edit starts from the proposal.
    it('says Update proposal, and drops the draft once the proposal is updated', async () => {
      const user = userEvent.setup();
      render(
        <Harness propose={vi.fn(async () => undefined)} proposals={[mine]} {...inSession}>
          <EditButton proposal={mine} />
        </Harness>,
      );

      await user.click(screen.getByRole('button', { name: 'Edit fixture' }));
      expect(screen.queryByRole('button', { name: 'Propose' })).toBeNull();
      await user.type(note()!, ' made better');
      await user.click(screen.getByRole('button', { name: 'Update proposal' }));
      await waitFor(() => expect(note()).toBeNull());

      expect(localStorage.length).toBe(0);
    });
  });

  // No session or no signed-in viewer means nowhere to keep a draft for.
  it('keeps nothing where there is nobody to keep it for', async () => {
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'Nowhere to go');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Sticky' }));

    expect(note()?.textContent).toBe('');
    expect(localStorage.length).toBe(0);
  });
});

describe('sticky drafts across questions', () => {
  const note = () => screen.queryByLabelText('Note') as HTMLElement | null;
  const board = (questionId: string) => (
    <Harness
      propose={vi.fn(async () => undefined)}
      sessionId="session-1"
      questionId={questionId}
      viewerId="user-1"
    />
  );

  beforeEach(() => {
    localStorage.clear();
  });

  // The board keeps one set of tools across the agenda. A note half-written
  // for one question is an answer to that question, not the next one.
  it('does not open a draft written for one question on another', async () => {
    const user = userEvent.setup();
    const { rerender } = render(board('question-1'));

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'For question one');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    rerender(board('question-2'));
    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(note()?.textContent).toBe('');
    await user.type(note()!, 'For question two');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    rerender(board('question-1'));
    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(note()?.textContent).toBe('For question one');
  });

  // Moving on while the popup is open must not carry the note across, or keep
  // writing one question's note under the next question's name.
  it('starts the open popup afresh when the board moves to another question', async () => {
    const user = userEvent.setup();
    const { rerender } = render(board('question-1'));

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'For question one');
    rerender(board('question-2'));

    expect(note()?.textContent).toBe('');
    expect(localStorage.getItem(draftKeyFor('session-1', 'question-2', 'user-1'))).toBeNull();
  });
});

describe('closing the sticky popup', () => {
  const note = () => screen.queryByLabelText('Note') as HTMLElement | null;

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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
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

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(note()).toBeNull();
  });

  // Pressing Sticky while it fades is asking for it back, not a second
  // close that lands a moment later and shuts it anyway.
  it('comes back if its own button is pressed while it fades', async () => {
    motion({ reduced: false });
    const user = userEvent.setup();
    render(<Harness propose={vi.fn(async () => undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.type(note()!, 'Wait');

    // Close, then press Sticky straight after, with nothing awaited in
    // between: no timer can run until this yields, so the fade cannot finish
    // between the two however busy the machine is. Awaited presses made this
    // fail whenever the whole suite ran at once.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const newSticky = screen.getByRole('button', { name: 'Sticky' });
    fireEvent.pointerDown(newSticky);
    fireEvent.click(newSticky);

    // Well past the fade: a close that was not cancelled would have landed.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(note()?.textContent).toBe('Wait');
    expect(note()?.closest('form')).toHaveClass('rt-sticky-popup-rise');
  });

  // The draft is cleared the moment a proposal lands, and the popup fades for a
  // moment after that with the note still focused. A keystroke then must not
  // write the proposed note straight back as a draft.
  it('does not bring a proposed note back as a draft when typed into as it fades', async () => {
    motion({ reduced: false });
    localStorage.clear();
    // The fade's own timer, held until this test lets it run, so the popup
    // cannot finish closing before the keystroke lands however busy the
    // machine is. Every other timer runs as normal.
    const realSetTimeout = window.setTimeout;
    let finishFade: (() => void) | undefined;
    const timers = vi.spyOn(window, 'setTimeout').mockImplementation(((
      handler: TimerHandler,
      delay?: number,
      ...rest: unknown[]
    ) => {
      if (delay === 150) {
        finishFade = handler as () => void;
        return 0;
      }
      return realSetTimeout(handler, delay, ...rest);
    }) as typeof window.setTimeout);
    try {
      const user = userEvent.setup();
      let land: (() => void) | undefined;
      const propose = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            land = resolve;
          }),
      );
      render(<Harness propose={propose} sessionId="session-1" viewerId="user-1" />);
      const key = draftKeyFor('session-1', 'question-1', 'user-1');

      await user.click(screen.getByRole('button', { name: 'Sticky' }));
      await user.type(note()!, 'Ship it');
      expect(localStorage.getItem(key)).not.toBeNull();
      await user.click(screen.getByRole('button', { name: 'Propose' }));
      await act(async () => land?.());

      // Landed, draft cleared, and fading with the note still focused.
      await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
      expect(note()?.closest('form')).toHaveClass('rt-sticky-popup-fade');
      await user.keyboard(', and again');
      expect(localStorage.getItem(key)).toBeNull();

      act(() => finishFade?.());
      expect(note()).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Sticky' }));
      expect(note()?.textContent).toBe('');
    } finally {
      timers.mockRestore();
    }
  });
});
