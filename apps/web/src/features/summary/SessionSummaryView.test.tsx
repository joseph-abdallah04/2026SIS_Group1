import type { BoardItem, SessionRecap } from '@roundtable/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from '../../lib/saveBlob';
import { copyText } from '../../lib/copyText';
import { cardWidth } from '../pinboard/cardMetrics';
import { SessionSummaryView } from './SessionSummaryView';

vi.mock('../../lib/saveBlob', () => ({ saveBlob: vi.fn() }));
vi.mock('../../lib/copyText', () => ({ copyText: vi.fn(async () => true) }));

function sticky(id: string, text: string): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId: 'u2',
    authorName: 'Ada',
    type: 'sticky',
    artifactJson: { type: 'sticky', text, color: 'yellow' },
    x: 0,
    y: 0,
    createdAt: '2026-09-01T01:10:00.000Z',
    z: 0,
    editedAt: null,
    extendsProposalId: null,
    extendsFrom: null,
    reactions: [],
  };
}

const RECAP: SessionRecap = {
  sessionId: 's1',
  title: 'Roadmap',
  createdAt: '2026-09-01T00:00:00.000Z',
  startedAt: '2026-09-01T01:00:00.000Z',
  endedAt: '2026-09-01T02:00:00.000Z',
  leaderId: 'leader-1',
  participants: [
    { userId: 'leader-1', displayName: 'Jordan', isLeader: true },
    { userId: 'u2', displayName: 'Ada', isLeader: false },
  ],
  questions: [
    {
      id: 'q1',
      position: 0,
      text: 'What ships first?',
      status: 'answered',
      proposals: [sticky('p1', 'The API'), sticky('p2', 'The UI')],
      winnerProposalId: 'p1',
      tiedProposalIds: [],
      tallies: [
        { proposalId: 'p1', votes: 2, percent: 67 },
        { proposalId: 'p2', votes: 1, percent: 33 },
      ],
      votedCount: 3,
    },
    {
      id: 'q2',
      position: 1,
      text: 'What can wait?',
      status: 'skipped',
      proposals: [],
      winnerProposalId: null,
      tiedProposalIds: [],
      tallies: [],
      votedCount: 0,
    },
  ],
};

describe('SessionSummaryView', () => {
  it('shows who took part, the shortlist, and the winner', () => {
    render(<SessionSummaryView summary={RECAP} viewerId="u2" />);

    expect(screen.getByRole('heading', { name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('Leader')).toBeInTheDocument();
    expect(screen.getByText('What ships first?')).toBeInTheDocument();
    expect(screen.getByText('The API')).toBeInTheDocument();
    expect(screen.getByText('The UI')).toBeInTheDocument();
    expect(screen.getByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Nothing was shortlisted for this question.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download Session Summary' }),
    ).not.toBeInTheDocument();
  });

  // A sticky grows with its note, so a slot sized for the smallest one let a
  // long winning note spill out past its winner ring.
  it('sizes each proposal’s slot, and its winner ring, to the card itself', () => {
    const long = sticky('p1', 'a'.repeat(280));
    render(
      <SessionSummaryView
        summary={{
          ...RECAP,
          questions: [{ ...RECAP.questions[0]!, proposals: [long, sticky('p2', 'The UI')] }],
        }}
        viewerId="u2"
      />,
    );

    const slot = screen.getByText('Winner').closest('li')!;
    expect(slot).toHaveStyle({ width: `${cardWidth(long)}px` });
    expect(slot.querySelector('article')?.parentElement?.parentElement).toHaveStyle({
      width: `${cardWidth(long)}px`,
    });
  });

  it('labels a tie on every shortlisted proposal that shares the top score', () => {
    render(
      <SessionSummaryView
        summary={{
          ...RECAP,
          questions: [
            {
              ...RECAP.questions[0]!,
              winnerProposalId: null,
              tiedProposalIds: ['p1', 'p2'],
              tallies: [
                { proposalId: 'p1', votes: 1, percent: 50 },
                { proposalId: 'p2', votes: 1, percent: 50 },
              ],
              votedCount: 2,
            },
          ],
        }}
        viewerId="u2"
      />,
    );

    expect(screen.getAllByText('Tied')).toHaveLength(2);
    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
  });
});

const CANVAS: BoardItem = {
  ...sticky('p3', ''),
  type: 'diagram',
  artifactJson: {
    type: 'diagram',
    nodes: [{ id: 'n1', label: 'Ledger', x: 24, y: 24, shape: 'box' }],
    edges: [],
  },
};

const WITH_CANVAS: SessionRecap = {
  ...RECAP,
  questions: [
    { ...RECAP.questions[0]!, proposals: [...RECAP.questions[0]!.proposals, CANVAS] },
    RECAP.questions[1]!,
  ],
};

const menuLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('SessionSummaryView card actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(saveBlob).mockClear();
  });

  it('gives cards no menu unless the page asks for one', () => {
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" />);
    expect(screen.queryByRole('button', { name: 'Proposal actions' })).toBeNull();
  });

  it('opens the same menu as the board, less anything that changes a card', async () => {
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" cardActions />);

    const buttons = screen.getAllByRole('button', { name: 'Proposal actions' });
    // Two notes and a canvas.
    expect(buttons).toHaveLength(3);
    await userEvent.click(buttons[2]!);
    expect(menuLabels()).toEqual(['Enlarge', 'Export as PNG', 'Export as SVG']);
  });

  it('opens on a right-click too', () => {
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" cardActions />);

    const notCancelled = fireEvent.contextMenu(screen.getByText('The API'), {
      clientX: 10,
      clientY: 10,
    });
    expect(notCancelled).toBe(false);
    expect(menuLabels()).toEqual(['Copy text']);
  });

  it('saves a canvas as an SVG and says so', async () => {
    // The page's font is not reachable here; the file is saved without it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" cardActions />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Proposal actions' })[2]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export as SVG' }));

    expect(
      await within(screen.getByRole('status')).findByText('Exported diagram as SVG'),
    ).toBeInTheDocument();
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(saveBlob).mock.calls[0]!;
    expect(filename).toMatch(/^roundtable-diagram-ada-\d{2}-\d{2}\.svg$/);
    expect(blob.type).toBe('image/svg+xml');
    expect(await blob.text()).toContain('>Ledger</tspan>');
  });

  it('copies a note and says so', async () => {
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" cardActions />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Proposal actions' })[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }));

    expect(copyText).toHaveBeenCalledWith('The API');
    expect(
      await within(screen.getByRole('status')).findByText('Copied to clipboard'),
    ).toBeInTheDocument();
  });
});
