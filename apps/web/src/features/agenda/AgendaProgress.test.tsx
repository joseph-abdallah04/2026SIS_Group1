import type { Question, QuestionStatus } from '@roundtable/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgendaProgress } from './AgendaProgress';
import { SEGMENTED_MAX, summarizeAgenda } from './agendaSummary';

function summaryOf(...statuses: QuestionStatus[]) {
  return summarizeAgenda(
    statuses.map((status, position): Question => ({
      id: `q${position + 1}`,
      sessionId: 's1',
      text: `Question ${position + 1}`,
      position,
      status,
      createdAt: new Date(0),
    })),
  );
}

const track = () =>
  screen.getByRole('progressbar', { name: 'Agenda progress' }).querySelector('div') as HTMLElement;

describe('AgendaProgress', () => {
  it('draws one segment per question, coloured by what happened to it', () => {
    render(<AgendaProgress summary={summaryOf('answered', 'skipped', 'discussion', 'pending')} />);

    const segments = Array.from(track().children);
    expect(segments).toHaveLength(4);
    expect(segments[0]).toHaveClass('bg-rt-secondary');
    expect((segments[1] as HTMLElement).style.backgroundImage).toContain(
      'repeating-linear-gradient',
    );
    expect(segments[2]).toHaveClass('bg-rt-cool');
    expect(segments[3]).toHaveClass('bg-rt-tertiary/50');
    expect(track()).not.toHaveClass('overflow-hidden');
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
  });

  it('runs the segments together once there are too many to tell apart', () => {
    const many = Array.from({ length: SEGMENTED_MAX + 1 }, () => 'pending' as const);
    render(<AgendaProgress summary={summaryOf(...many)} />);

    expect(track().children).toHaveLength(SEGMENTED_MAX + 1);
    expect(track()).toHaveClass('overflow-hidden', 'rounded-full');
    expect(track().children[0]).not.toHaveClass('rounded-full');
  });

  it('draws nothing for an empty agenda', () => {
    const { container } = render(<AgendaProgress summary={summaryOf()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fits a collapsed strip as a column with the count under it', () => {
    render(<AgendaProgress summary={summaryOf('answered', 'pending')} vertical />);

    expect(track()).toHaveClass('flex-col');
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});
