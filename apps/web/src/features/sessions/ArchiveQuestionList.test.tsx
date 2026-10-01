import type { Question, QuestionStatus } from '@roundtable/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ArchiveQuestionList } from './ArchiveQuestionList';

function question(position: number, status: QuestionStatus, votingEnabled = true): Question {
  return {
    id: `q${position + 1}`,
    sessionId: 's1',
    text: `Question ${position + 1}`,
    position,
    status,
    votingEnabled,
    createdAt: new Date(0),
  };
}

describe('ArchiveQuestionList', () => {
  it('says what became of each question, with nothing left in play', () => {
    render(
      <ArchiveQuestionList
        questions={[
          question(0, 'answered'),
          question(1, 'skipped'),
          question(2, 'discussion'),
          question(3, 'pending'),
        ]}
        activeQuestionId="q1"
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText('Answered')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Not voted on')).toBeInTheDocument();
    expect(screen.getByText('Not reached')).toBeInTheDocument();
    expect(screen.queryByText('Viewing')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Agenda progress' })).toHaveAttribute(
      'aria-valuetext',
      '2 of 4 questions done, including 1 skipped',
    );
  });

  // F41: never put to a vote, so neither "Answered" nor "Not voted on" fits.
  it('says a brainstorm-only question was discussed, finished or not', () => {
    render(
      <ArchiveQuestionList
        questions={[question(0, 'answered', false), question(1, 'discussion', false)]}
        activeQuestionId="q1"
        onSelect={() => undefined}
      />,
    );

    expect(screen.getAllByText('Discussed')).toHaveLength(2);
    expect(screen.queryByText('Answered')).not.toBeInTheDocument();
    expect(screen.queryByText('Not voted on')).not.toBeInTheDocument();
  });

  it('opens any question but the one already showing', async () => {
    const onSelect = vi.fn();
    render(
      <ArchiveQuestionList
        questions={[question(0, 'answered'), question(1, 'pending')]}
        activeQuestionId="q1"
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Question 1' }));
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Question 2' }));
    expect(onSelect).toHaveBeenCalledWith('q2');
  });
});
