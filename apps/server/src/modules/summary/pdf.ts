import PDFDocument from 'pdfkit';
import {
  recapQuestionStatusLabel,
  type BoardItem,
  type SessionRecap,
  type SessionRecapQuestion,
  type VotingTally,
} from '@roundtable/shared';

import { rasterizeProposalPreview, type FeaturedKind } from './artifactPreview.js';

const INK = '#080c15';
const MUTED = '#5a5f68';
const GOLD = '#e0a33c';
const MARGIN = 56;

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const day = when.toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = when.toLocaleString('en-GB', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${day}, ${time} UTC`;
}

function tallyFor(tallies: VotingTally[], proposalId: string): VotingTally | null {
  return tallies.find((row) => row.proposalId === proposalId) ?? null;
}

/** Winner if there is one; every tied proposal if there is a tie. Nobody else. */
export function featuredProposals(question: SessionRecapQuestion): BoardItem[] {
  if (question.winnerProposalId) {
    return question.proposals.filter((item) => item.id === question.winnerProposalId);
  }
  if (question.tiedProposalIds.length === 0) return [];
  const tied = new Set(question.tiedProposalIds);
  return question.proposals.filter((item) => tied.has(item.id));
}

function featuredKind(question: SessionRecapQuestion, proposalId: string): FeaturedKind {
  return question.winnerProposalId === proposalId ? 'winner' : 'tied';
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed <= doc.page.height - MARGIN) return;
  doc.addPage();
}

function writePreview(
  doc: PDFKit.PDFDocument,
  png: Buffer,
  pngWidth: number,
  pngHeight: number,
  width: number,
) {
  const ratio = pngHeight / pngWidth;
  let displayW = width;
  let displayH = displayW * ratio;
  const pageInner = doc.page.height - MARGIN * 2;
  if (displayH > pageInner) {
    displayH = pageInner;
    displayW = displayH / ratio;
  }
  if (doc.y + displayH > doc.page.height - MARGIN) {
    doc.addPage();
  }
  doc.image(png, MARGIN, doc.y, { width: displayW, height: displayH });
  doc.y += displayH + 16;
  doc.x = MARGIN;
}

/** ASCII filename for Content-Disposition. Empty titles become `session-recap.pdf`. */
export function recapPdfFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug.length > 0 ? slug : 'session'}-recap.pdf`;
}

function writeQuestion(
  doc: PDFKit.PDFDocument,
  question: SessionRecapQuestion,
  index: number,
  width: number,
) {
  ensureSpace(doc, 72);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(`${index + 1}. ${question.text}`, { width });
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(9)
    .text(recapQuestionStatusLabel(question), { width });

  if (question.votedCount > 0) {
    const votes =
      question.votedCount === 1 ? '1 vote cast' : `${question.votedCount} votes cast`;
    doc.text(votes, { width });
  }

  doc.moveDown(0.45);

  const featured = featuredProposals(question);
  if (featured.length === 0) {
    doc.text('Nothing was decided for this question.', { width });
    doc.moveDown(0.8);
    return;
  }

  for (const item of featured) {
    const kind = featuredKind(question, item.id);
    const tally = tallyFor(question.tallies, item.id);
    const votes =
      tally === null
        ? null
        : `${tally.percent}% · ${tally.votes === 1 ? '1 vote' : `${tally.votes} votes`}`;
    const line = [kind === 'winner' ? 'Winner' : 'Tied', item.authorName, votes]
      .filter((part): part is string => Boolean(part))
      .join('  ·  ');
    ensureSpace(doc, 48);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(line, { width });
    doc.moveDown(0.25);
    try {
      const preview = rasterizeProposalPreview(item, kind);
      writePreview(doc, preview.png, preview.width, preview.height, width);
    } catch {
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`By ${item.authorName}`, { width });
      doc.moveDown(0.6);
    }
  }
  doc.moveDown(0.4);
}

function writeRecap(doc: PDFKit.PDFDocument, summary: SessionRecap) {
  const width = doc.page.width - MARGIN * 2;

  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('ROUNDTABLE', { width, characterSpacing: 1.6 });
  doc.moveDown(0.35);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(summary.title, { width });
  doc.moveDown(0.3);
  const ruleY = doc.y;
  doc.strokeColor(GOLD).lineWidth(1.5).moveTo(MARGIN, ruleY).lineTo(MARGIN + 64, ruleY).stroke();
  doc.x = MARGIN;
  doc.y = ruleY + 14;

  const createdAt = formatWhen(summary.createdAt);
  const startedAt = formatWhen(summary.startedAt);
  const endedAt = formatWhen(summary.endedAt);
  const dates = [
    createdAt && `Created ${createdAt}`,
    startedAt && `Started ${startedAt}`,
    endedAt && `Ended ${endedAt}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (dates) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(dates, { width });
  }

  doc.moveDown(1.1);
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(`TOOK PART (${summary.participants.length})`, { width, characterSpacing: 0.9 });
  doc.moveDown(0.35);
  for (const member of summary.participants) {
    const label = member.isLeader ? `${member.displayName}  ·  Leader` : member.displayName;
    doc.fillColor(INK).font('Helvetica').fontSize(11).text(label, { width });
  }

  doc.moveDown(1.1);
  doc
    .fillColor(MUTED)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('QUESTIONS', { width, characterSpacing: 0.9 });
  doc.moveDown(0.5);

  summary.questions.forEach((question, index) => {
    writeQuestion(doc, question, index, width);
  });
}

/** S04: the F31 recap as a downloadable PDF. Same facts, no extra ranking. */
export function renderSessionRecapPdf(summary: SessionRecap): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      compress: false,
      info: {
        Title: `${summary.title} — RoundTable recap`,
        Author: 'RoundTable',
        Creator: 'RoundTable',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    writeRecap(doc, summary);
    doc.end();
  });
}
