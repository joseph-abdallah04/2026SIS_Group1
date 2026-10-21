import type { BoardItem, SessionRecap, SessionRecapQuestion } from '@roundtable/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from '../../lib/saveBlob';
import { copyText } from '../../lib/copyText';
import { SessionSummaryView } from './SessionSummaryView';

vi.mock('../../lib/saveBlob', () => ({ saveBlob: vi.fn() }));
vi.mock('../../lib/copyText', () => ({ copyText: vi.fn(async () => true) }));

function sticky(id: string, text: string, author: { id: string; name: string } = ADA): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId: author.id,
    authorName: author.name,
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

const ADA = { id: 'u2', name: 'Ada Lovelace' };
const BEA = { id: 'u4', name: 'Bea Turing' };

const DECIDED: SessionRecapQuestion = {
  id: 'q1',
  position: 0,
  text: 'What ships first?',
  status: 'answered',
  votingEnabled: true,
  proposals: [sticky('p2', 'The UI', BEA), sticky('p1', 'The API')],
  winnerProposalId: 'p1',
  tiedProposalIds: [],
  tallies: [
    { proposalId: 'p2', votes: 1, percent: 33 },
    { proposalId: 'p1', votes: 2, percent: 67 },
  ],
  votedCount: 3,
};

const SKIPPED: SessionRecapQuestion = {
  id: 'q2',
  position: 1,
  text: 'What can wait?',
  status: 'skipped',
  votingEnabled: true,
  proposals: [],
  winnerProposalId: null,
  tiedProposalIds: [],
  tallies: [],
  votedCount: 0,
};

const RECAP: SessionRecap = {
  sessionId: 's1',
  title: 'Roadmap',
  createdAt: '2026-09-01T00:00:00.000Z',
  startedAt: '2026-09-01T01:00:00.000Z',
  endedAt: '2026-09-01T01:45:00.000Z',
  leaderId: 'leader-1',
  participants: [
    { userId: 'u2', displayName: 'Ada Lovelace', isLeader: false },
    { userId: 'u4', displayName: 'Bea Turing', isLeader: false },
    { userId: 'leader-1', displayName: 'Jordan Hale', isLeader: true },
  ],
  questions: [DECIDED, SKIPPED],
};

function only(question: SessionRecapQuestion): SessionRecap {
  return { ...RECAP, questions: [question] };
}

/** A question's own card, found by its heading. */
function card(text: string): HTMLElement {
  return screen.getByRole('heading', { name: new RegExp(text) }).closest('section')!;
}

describe('SessionSummaryView', () => {
  it('heads the page with the meeting: title, length, call and who led it', () => {
    render(<SessionSummaryView summary={RECAP} viewerId="u2" voiceEnabled />);

    expect(screen.getByRole('heading', { level: 1, name: 'Roadmap' })).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
    expect(screen.getByText('Live call')).toBeInTheDocument();
    expect(screen.getByText('Led by Jordan Hale')).toBeInTheDocument();
    // The outcome card: how many were decided, of how many, and a legend.
    const outcome = screen.getByRole('region', { name: '1 decided · 1 skipped, of 2 questions' });
    expect(outcome).toHaveTextContent('1 of 2 decided');
    expect(outcome).toHaveTextContent('2 questions');
    expect(within(outcome).getAllByRole('listitem', { hidden: true })).toHaveLength(2);
    // B13: the page's sections and each question are headings, in order.
    expect(screen.getByRole('heading', { level: 2, name: 'At a glance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Questions' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  // B15: the leader first, then you, then everyone else; the list opens from the faces.
  it('names the leader first and you second, and lists everyone on demand', async () => {
    render(<SessionSummaryView summary={RECAP} viewerId="u2" />);

    const people = screen.getByRole('button', { name: 'Who took part: Jordan, you and 1 other' });
    expect(people).toHaveTextContent('3 people');
    await userEvent.click(people);

    const list = screen.getByText('3 took part').parentElement!;
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'JHJordan HaleLeader',
      'ALAda LovelaceYou',
      'BTBea Turing',
    ]);
  });

  it('gives every question and its answer one line at a glance, and jumps to it', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<SessionSummaryView summary={RECAP} viewerId="u2" />);

    const glance = screen.getByRole('heading', { name: 'At a glance' }).closest('section')!;
    const rows = within(glance).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('What ships first?');
    expect(rows[0]).toHaveTextContent('Decided');
    expect(rows[0]).toHaveTextContent('The API');
    expect(rows[1]).toHaveTextContent('Skipped');

    await userEvent.click(rows[1]!);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(card('What can wait?')).toHaveFocus();
  });

  // W2: the decision heads the question, then the rest by votes.
  it('puts the winner in a banner with its share, then ranks the rest', () => {
    render(<SessionSummaryView summary={only(DECIDED)} viewerId="u2" cardActions />);

    const question = card('What ships first?');
    expect(within(question).getByText('Decided', { selector: 'p' })).toBeInTheDocument();
    expect(within(question).getByText('67')).toBeInTheDocument();
    expect(within(question).getByText('2 of 3 votes')).toBeInTheDocument();
    const banner = question.querySelector<HTMLElement>('.rt-recap-banner')!;
    expect(within(banner).getByText('Proposed by', { exact: false })).toHaveTextContent(
      'Proposed by You',
    );
    expect(within(question).getByText('The rest of the shortlist')).toBeInTheDocument();
    expect(within(question).getByRole('button', { name: 'Enlarge: The UI' })).toBeInTheDocument();
    expect(within(question).getByText('33%')).toBeInTheDocument();
  });

  // Tristan: a note opens in the board's own enlarged view, as a drawing does.
  it('opens a ranked note in the board’s enlarged view, and puts it away again', async () => {
    render(<SessionSummaryView summary={only(DECIDED)} viewerId="u2" cardActions />);

    const thumb = screen.getByRole('button', { name: 'Enlarge: The UI' });
    await userEvent.click(thumb);
    const view = screen.getByRole('dialog', { name: 'sticky note by Bea Turing' });
    expect(within(view).getByText('The UI')).toBeInTheDocument();
    // Words are read, not inspected: the note has no zoom.
    expect(within(view).queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(thumb).toHaveFocus();
  });

  it('keeps a picture of a summary a picture: nothing to enlarge', () => {
    render(<SessionSummaryView summary={only(DECIDED)} viewerId="u2" />);

    expect(screen.queryByRole('button', { name: /^Enlarge/ })).not.toBeInTheDocument();
  });

  it('folds away what was not shortlisted, and shows it on request', async () => {
    const others = [sticky('o1', 'A late idea'), sticky('o2', 'Another one', BEA)];
    render(
      <SessionSummaryView
        summary={only({ ...DECIDED, otherProposals: others })}
        viewerId="u2"
        cardActions
      />,
    );

    const fold = screen.getByRole('button', { name: /Not shortlisted/ });
    expect(fold).toHaveTextContent('Not shortlisted·2 ideas');
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('A late idea')).not.toBeInTheDocument();
    await userEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('A late idea')).toBeInTheDocument();
  });

  it('calls the ideas of a question with no shortlist the ideas on its board', () => {
    render(
      <SessionSummaryView
        summary={only({ ...SKIPPED, otherProposals: [sticky('o1', 'Parked idea')] })}
        viewerId="u2"
      />,
    );

    expect(screen.getByRole('button', { name: /Ideas on the board/ })).toBeInTheDocument();
  });

  it('says whose idea a card builds on, and opens that card on request', async () => {
    const original = sticky('o1', 'The first thought', BEA);
    const built = {
      ...sticky('p2', 'The UI'),
      extendsProposalId: 'o1',
      extendsFrom: { authorId: BEA.id, authorName: BEA.name },
    };
    render(
      <SessionSummaryView
        summary={only({
          ...DECIDED,
          proposals: [built, DECIDED.proposals[1]!],
          otherProposals: [original],
        })}
        viewerId="u2"
        cardActions
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Builds on Bea Turing’s idea' }));
    const view = screen.getByRole('dialog', { name: 'sticky note by Bea Turing' });
    expect(within(view).getByText('The first thought')).toBeInTheDocument();
  });

  it('never dresses a tie as a win', () => {
    render(
      <SessionSummaryView
        summary={only({
          ...DECIDED,
          winnerProposalId: null,
          tiedProposalIds: ['p1', 'p2'],
          tallies: [
            { proposalId: 'p1', votes: 1, percent: 50 },
            { proposalId: 'p2', votes: 1, percent: 50 },
          ],
          votedCount: 2,
        })}
        viewerId="u2"
      />,
    );

    expect(screen.getByText('Tied · no single winner')).toBeInTheDocument();
    expect(screen.getByText('2 ideas share the most votes, 1 vote each.')).toBeInTheDocument();
    expect(screen.queryByText('Decided')).not.toBeInTheDocument();
  });

  // B2: a reason on a line of its own, in its own words.
  it('says why a question was skipped on a line of its own', () => {
    const reason =
      'We ran out of time before this one, and the team agreed it needs the design review first.';
    render(<SessionSummaryView summary={only({ ...SKIPPED, skipReason: reason })} viewerId="u2" />);

    const question = card('What can wait?');
    expect(within(question).getByText('Why it was skipped:')).toBeInTheDocument();
    expect(within(question).getByText(reason, { exact: false })).toBeInTheDocument();
    expect(
      within(question).getByText('Skipped before anything was shortlisted.'),
    ).toBeInTheDocument();
  });

  // B3: a ballot nobody voted in is not an answer, and has no shares to show.
  it('says a closed vote with no ballots had no votes, with no shares', () => {
    render(
      <SessionSummaryView
        summary={only({
          ...DECIDED,
          winnerProposalId: null,
          tallies: [
            { proposalId: 'p1', votes: 0, percent: 0 },
            { proposalId: 'p2', votes: 0, percent: 0 },
          ],
          votedCount: 0,
        })}
        viewerId="u2"
      />,
    );

    expect(screen.getAllByText('No votes cast').length).toBeGreaterThan(0);
    expect(screen.getByText('The ballot closed without a vote.')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  // B4: the session ended with the ballot open, so there is no result yet.
  it('marks the votes of a ballot the session ended on as not a result', () => {
    render(
      <SessionSummaryView
        summary={only({ ...DECIDED, status: 'voting', winnerProposalId: null })}
        viewerId="u2"
      />,
    );

    expect(screen.getAllByText('Vote not closed').length).toBeGreaterThan(0);
    expect(screen.getByText(/votes so far, not a result/)).toBeInTheDocument();
    expect(screen.queryByText('The rest of the shortlist')).not.toBeInTheDocument();
  });

  // B5: a vote the session ended on mid-discussion shows its ideas.
  it('shows the ideas of a vote question the session ended on mid-discussion', () => {
    render(
      <SessionSummaryView
        summary={only({
          ...DECIDED,
          status: 'discussion',
          winnerProposalId: null,
          tallies: [],
          votedCount: 0,
        })}
        viewerId="u2"
      />,
    );

    expect(screen.getAllByText('Not voted on').length).toBeGreaterThan(0);
    expect(within(card('What ships first?')).getByText('The UI')).toBeInTheDocument();
  });

  // B6: the vote closed and decided, then the question was skipped.
  it('keeps the result of a vote skipped after it closed', () => {
    render(
      <SessionSummaryView
        summary={only({ ...DECIDED, status: 'skipped', skipReason: 'Settled' })}
        viewerId="u2"
      />,
    );

    const question = card('What ships first?');
    expect(within(question).getByText('Skipped after the vote closed:')).toBeInTheDocument();
    expect(within(question).getByText('67')).toBeInTheDocument();
  });

  // F41: no vote, so every idea is shown and none is crowned.
  it('shows every idea of a short brainstorm at full size, with no vote', () => {
    render(
      <SessionSummaryView
        summary={only({
          ...DECIDED,
          votingEnabled: false,
          proposals: [sticky('p1', 'The API'), sticky('p2', 'The UI'), sticky('p3', 'Docs')],
          winnerProposalId: null,
          tallies: [],
          votedCount: 0,
        })}
        viewerId="u2"
      />,
    );

    const question = card('What ships first?');
    expect(within(question).getByText('Discussed')).toBeInTheDocument();
    expect(within(question).getByText('3 ideas')).toBeInTheDocument();
    expect(within(question).getByText('Docs')).toBeInTheDocument();
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  // Tristan's B1 + B2: a crowd of ideas is smaller, and past a dozen behind "Show all".
  it('shows a crowd of ideas smaller, a dozen first, and the rest on request', async () => {
    const ideas = Array.from({ length: 15 }, (_, i) => sticky(`i${i}`, `Idea ${i + 1}`));
    render(
      <SessionSummaryView
        summary={only({ ...SKIPPED, status: 'answered', votingEnabled: false, proposals: ideas })}
        viewerId="u2"
      />,
    );

    const question = card('What can wait?');
    expect(within(question).getByText('Idea 12')).toBeInTheDocument();
    expect(within(question).queryByText('Idea 13')).not.toBeInTheDocument();
    await userEvent.click(within(question).getByRole('button', { name: 'Show all 15 ideas' }));
    expect(within(question).getByText('Idea 15')).toBeInTheDocument();
    expect(within(question).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
  });

  it('says a discussed brainstorm got no ideas, not that nothing was shortlisted', () => {
    render(
      <SessionSummaryView
        summary={only({ ...DECIDED, votingEnabled: false, proposals: [], votedCount: 0 })}
        viewerId="u2"
      />,
    );

    expect(screen.getByText('No ideas were added.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing was shortlisted/)).not.toBeInTheDocument();
  });

  it('offers each question’s board only where the page can open it', async () => {
    const { unmount } = render(<SessionSummaryView summary={RECAP} viewerId="u2" />);
    expect(screen.queryByRole('button', { name: /Open the board/ })).not.toBeInTheDocument();
    unmount();

    const onOpenBoard = vi.fn();
    render(<SessionSummaryView summary={RECAP} viewerId="u2" onOpenBoard={onOpenBoard} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open the board for question 2' }));
    expect(onOpenBoard).toHaveBeenCalledWith('q2');
  });

  it('says it is a wrap, with paper falling, when the meeting has just ended', () => {
    const { container } = render(<SessionSummaryView summary={RECAP} viewerId="u2" justEnded />);

    expect(screen.getByText('That’s a wrap. The meeting just ended.')).toBeInTheDocument();
    const confetti = container.querySelector('.rt-recap-confetti')!;
    expect(confetti).toHaveAttribute('aria-hidden', 'true');
    expect(confetti.querySelectorAll('i')).toHaveLength(42);
  });

  // B9: deleted accounts have no id, and there can be several.
  it('lists every deleted account, each once, none as the leader', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <SessionSummaryView
        summary={{
          ...RECAP,
          leaderId: null,
          participants: [
            { userId: null, displayName: 'Deleted user', isLeader: false },
            { userId: null, displayName: 'Deleted user', isLeader: false },
            { userId: 'u2', displayName: 'Ada Lovelace', isLeader: false },
          ],
        }}
        viewerId="u2"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Who took part/ }));
    expect(screen.getAllByText('Deleted user')).toHaveLength(2);
    expect(screen.queryByText('Leader')).not.toBeInTheDocument();
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    error.mockRestore();
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

/** The decided question, now with a canvas on its shortlist too. */
const WITH_CANVAS = only({
  ...DECIDED,
  proposals: [...DECIDED.proposals, CANVAS],
  tallies: [...DECIDED.tallies, { proposalId: 'p3', votes: 0, percent: 0 }],
});

/** The same, with the canvas as the winner, so it is a card on the page. */
const CANVAS_WINS = only({
  ...DECIDED,
  proposals: [CANVAS, ...DECIDED.proposals],
  winnerProposalId: 'p3',
  tallies: [
    { proposalId: 'p3', votes: 2, percent: 67 },
    { proposalId: 'p1', votes: 1, percent: 33 },
    { proposalId: 'p2', votes: 0, percent: 0 },
  ],
});

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
    render(<SessionSummaryView summary={CANVAS_WINS} viewerId="u2" cardActions />);

    // The winner is a card on the page; the ranked rows are pictures of theirs.
    const buttons = screen.getAllByRole('button', { name: 'Proposal actions' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    expect(menuLabels()).toEqual(['Enlarge', 'Export']);
  });

  // Tristan: from its row, a canvas opens exactly as it does on the board.
  it('opens a ranked canvas in the board’s enlarged view, with its zoom and export', async () => {
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" cardActions />);

    await userEvent.click(screen.getByRole('button', { name: /^Enlarge: A diagram/ }));
    const view = screen.getByRole('dialog', { name: 'diagram by Ada Lovelace' });
    expect(within(view).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(
      within(view).getByRole('button', { name: /^Export as PNG: diagram by Ada Lovelace/ }),
    ).toBeInTheDocument();
  });

  it('opens on a right-click too', () => {
    render(<SessionSummaryView summary={WITH_CANVAS} viewerId="u2" cardActions />);

    const winner = within(card('What ships first?')).getAllByText('The API').at(-1)!;
    const notCancelled = fireEvent.contextMenu(winner, { clientX: 10, clientY: 10 });
    expect(notCancelled).toBe(false);
    // A note opens large too, so it offers Enlarge as a drawing does.
    expect(menuLabels()).toEqual(['Enlarge', 'Copy text']);
  });

  it('saves a canvas as an SVG and says so', async () => {
    // The page's font is not reachable here; the file is saved without it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    render(<SessionSummaryView summary={CANVAS_WINS} viewerId="u2" cardActions />);

    await userEvent.click(screen.getByRole('button', { name: 'Proposal actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'As SVG' }));

    expect(
      await within(screen.getByRole('status')).findByText('Exported diagram as SVG'),
    ).toBeInTheDocument();
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = vi.mocked(saveBlob).mock.calls[0]!;
    expect(filename).toMatch(/^roundtable-diagram-ada-lovelace-\d{2}-\d{2}\.svg$/);
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
