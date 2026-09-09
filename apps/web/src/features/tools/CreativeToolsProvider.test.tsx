import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';
import { describe, expect, it, vi } from 'vitest';

import { CreativeToolbar } from '../toolbar/CreativeToolbar';
import { CreativeStudio } from './CreativeStudio';
import { useCreativeTools } from './CreativeToolsContext';
import { CreativeToolsProvider } from './CreativeToolsProvider';

interface HarnessProps {
  initialEntry?: string;
  isLive?: boolean;
  proposals?: BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
}

function Harness({
  initialEntry = '/sessions/demo',
  isLive = true,
  proposals = [],
  propose,
}: HarnessProps) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <CreativeToolsProvider
        isLive={isLive}
        proposals={proposals}
        propose={propose}
        editProposal={async () => {}}
      >
        <CreativeToolbar />
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
  // The assistant proposes straight from its chat panel, without ever opening or closing a
  // studio tool — and closing is what used to release the write lock. One propose per page
  // load, every one after it a silent `false` the panel could only report as a rejection.
  it('allows a second proposal without an editor being opened and closed in between', async () => {
    // Typed so the assertion below can read what the second call actually sent.
    const propose = vi.fn<(input: ProposalCreateInput) => Promise<void>>(async () => undefined);

    function TwiceButton() {
      const { submitArtifact } = useCreativeTools();
      return (
        <button
          onClick={async () => {
            const first = await submitArtifact({ type: 'sticky', text: 'one', color: 'yellow' });
            const second = await submitArtifact({ type: 'sticky', text: 'two', color: 'blue' });
            results.push(first, second);
          }}
        >
          Propose twice
        </button>
      );
    }
    const results: boolean[] = [];

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sessions/demo']}>
        <CreativeToolsProvider
          isLive
          proposals={[]}
          propose={propose}
          editProposal={async () => {}}
        >
          <TwiceButton />
        </CreativeToolsProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Propose twice' }));

    expect(results).toEqual([true, true]);
    expect(propose).toHaveBeenCalledTimes(2);
    expect(propose.mock.calls[1]?.[0]).toMatchObject({
      artifactJson: { type: 'sticky', text: 'two' },
    });
  });

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
    expect(await screen.findByRole('heading', { name: 'Sticky proposed' })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Sticky proposed' })).toBeInTheDocument();
  });

  it('keeps the write lock when the studio closes before acknowledgement', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Back to pinboard' }));

    expect(screen.getByRole('button', { name: 'New sticky' })).toBeDisabled();
    expect(propose).toHaveBeenCalledTimes(1);

    await act(async () => finishProposal?.());
    expect(screen.getByRole('button', { name: 'New sticky' })).toBeEnabled();
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
      extendsProposalId: null,
      reactions: [],
    };

    render(
      <MemoryRouter initialEntries={['/sessions/demo']}>
        <CreativeToolsProvider
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
