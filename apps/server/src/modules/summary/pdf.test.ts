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
    extendsProposalId: null,
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
    expect(body).toContain('Nothing was decided for this question.');
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
});
