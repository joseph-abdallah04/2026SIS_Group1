import type { BoardItem, SessionRecap } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { recapPdfFilename, renderSessionRecapPdf } from './pdf.js';

function sticky(id: string, text: string, authorName = 'Ada'): BoardItem {
  return {
    id,
    questionId: 'q1',
    authorId: authorName === 'Ada' ? 'u2' : 'u3',
    authorName,
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
      votingEnabled: true,
      proposals: [sticky('p1', 'The API'), sticky('p2', 'The UI', 'Bea')],
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
      votingEnabled: true,
      proposals: [],
      winnerProposalId: null,
      tiedProposalIds: [],
      tallies: [],
      votedCount: 0,
    },
  ],
};

function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const chunks: string[] = [];
  for (const match of raw.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = match[1]!;
    if (hex.length % 2 !== 0) continue;
    chunks.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return chunks.join('');
}

function imageXObjectCount(pdf: Buffer): number {
  return pdf.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0;
}

describe('recapPdfFilename', () => {
  it('turns the session title into an attachment name', () => {
    expect(recapPdfFilename('Roadmap')).toBe('Roadmap-recap.pdf');
    expect(recapPdfFilename('  Q3 / Planning??  ')).toBe('Q3-Planning-recap.pdf');
    expect(recapPdfFilename('   ')).toBe('session-recap.pdf');
  });
});

describe('renderSessionRecapPdf', () => {
  it('shows only the winner, as a picture, not the rest of the shortlist', async () => {
    const pdf = await renderSessionRecapPdf(RECAP);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const body = pdfText(pdf);
    expect(body).toContain('Roadmap');
    expect(body).toContain('Jordan');
    expect(body).toContain('Leader');
    expect(body).toContain('Ada');
    expect(body).toContain('What ships first?');
    expect(body).toContain('Winner');
    expect(body).toContain('Skipped');
    expect(body).not.toContain('Nothing was decided');
    expect(body).not.toContain('Bea');
    expect(body).not.toContain('The UI');
    expect(imageXObjectCount(pdf)).toBeGreaterThan(0);
  });

  it('pictures every tied proposal instead of crowning one', async () => {
    const pdf = await renderSessionRecapPdf({
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
    });
    const body = pdfText(pdf);
    expect(body).toContain('Tied');
    expect(body).toContain('Bea');
    expect(body).not.toContain('Winner');
    expect(imageXObjectCount(pdf)).toBeGreaterThan(1);
  });

  // F41: no vote, so nothing is crowned — every idea is pictured instead.
  it('pictures every idea on a brainstorm question without a winner or tally', async () => {
    const ideas = [sticky('p1', 'The API'), sticky('p2', 'The UI', 'Bea'), sticky('p3', 'Docs')];
    const pdf = await renderSessionRecapPdf({
      ...RECAP,
      questions: [
        {
          ...RECAP.questions[0]!,
          votingEnabled: false,
          proposals: ideas,
          winnerProposalId: null,
          tallies: [],
          votedCount: 0,
        },
      ],
    });
    const body = pdfText(pdf);
    expect(body).toContain('Discussed');
    expect(body).toContain('3 ideas');
    expect(body).not.toContain('Winner');
    expect(body).not.toContain('votes cast');
    expect(body).not.toContain('Nothing was decided');
    expect(imageXObjectCount(pdf)).toBeGreaterThanOrEqual(ideas.length);
  });

  it('writes times in UTC unless given a real zone, then in that zone', async () => {
    const utc = pdfText(await renderSessionRecapPdf(RECAP));
    expect(utc).toContain('01:00 UTC');

    // 01:00 UTC on 1 September is 11:00 in Sydney (UTC+10 until October).
    const sydney = pdfText(await renderSessionRecapPdf(RECAP, { timeZone: 'Australia/Sydney' }));
    expect(sydney).toContain('11:00');
    expect(sydney).not.toContain('UTC');

    const nonsense = pdfText(await renderSessionRecapPdf(RECAP, { timeZone: 'Not/AZone' }));
    expect(nonsense).toContain('01:00 UTC');
  });

  it('says a closed vote with no ballots had no votes, not that it was answered', async () => {
    const body = pdfText(
      await renderSessionRecapPdf({
        ...RECAP,
        questions: [
          {
            ...RECAP.questions[0]!,
            winnerProposalId: null,
            tallies: [
              { proposalId: 'p1', votes: 0, percent: 0 },
              { proposalId: 'p2', votes: 0, percent: 0 },
            ],
            votedCount: 0,
          },
        ],
      }),
    );
    expect(body).toContain('No votes cast');
    expect(body).toContain('The ballot closed without a vote.');
    expect(body).not.toContain('Answered');
  });

  it('says a vote the session ended on mid-ballot has no result yet', async () => {
    const body = pdfText(
      await renderSessionRecapPdf({
        ...RECAP,
        questions: [{ ...RECAP.questions[0]!, status: 'voting', winnerProposalId: null }],
      }),
    );
    expect(body).toContain('Vote not closed');
    expect(body).toContain('The session ended while the ballot was open');
    expect(body).not.toContain('Winner');
  });

  it('pictures the ideas of a vote question the session ended on mid-discussion', async () => {
    const pdf = await renderSessionRecapPdf({
      ...RECAP,
      questions: [
        {
          ...RECAP.questions[0]!,
          status: 'discussion',
          winnerProposalId: null,
          tallies: [],
          votedCount: 0,
        },
      ],
    });
    const body = pdfText(pdf);
    expect(body).toContain('Not voted on');
    expect(body).toContain('2 ideas');
    expect(imageXObjectCount(pdf)).toBeGreaterThanOrEqual(2);
  });

  it('keeps the result of a vote skipped after it closed', async () => {
    const body = pdfText(
      await renderSessionRecapPdf({
        ...RECAP,
        questions: [{ ...RECAP.questions[0]!, status: 'skipped', skipReason: 'Settled already' }],
      }),
    );
    expect(body).toContain('Decided, then skipped: Settled already');
    expect(body).toContain('Winner');
  });

  it('says so when a discussed brainstorm question got no ideas', async () => {
    const pdf = await renderSessionRecapPdf({
      ...RECAP,
      questions: [{ ...RECAP.questions[0]!, votingEnabled: false, proposals: [], votedCount: 0 }],
    });
    const body = pdfText(pdf);
    expect(body).toContain('No ideas were added.');
    expect(body).not.toContain('Nothing was decided');
  });
});
