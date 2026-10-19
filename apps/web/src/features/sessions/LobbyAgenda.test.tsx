import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Question } from '@roundtable/shared';

import { LobbyAgenda, agendaMinutes } from './LobbyAgenda';

function question(id: string, text: string, votingEnabled = true): Question {
  return {
    id,
    sessionId: 's1',
    text,
    position: Number(id.slice(1)),
    status: 'pending',
    votingEnabled,
    createdAt: new Date('2026-10-19T00:00:00.000Z'),
  };
}

const QUESTIONS = [
  question('q0', 'What should a new starter’s first week include?'),
  question('q1', 'Ideas for the next team social', false),
  question('q2', 'What one process should we drop?'),
];

describe('LobbyAgenda', () => {
  it('lists the questions as numbered steps, the first up first', () => {
    render(
      <LobbyAgenda questions={QUESTIONS} discussionTimerSeconds={null} votingTimerSeconds={null} />,
    );

    expect(screen.getByRole('heading', { name: 'Questions ahead 3' })).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(within(steps[0]!).getByText('Up first')).toBeInTheDocument();
    expect(within(steps[1]!).queryByText('Up first')).not.toBeInTheDocument();
  });

  // The board's agenda marks a question with no vote the same way.
  it('marks a brainstorm question, and only that one', () => {
    render(
      <LobbyAgenda questions={QUESTIONS} discussionTimerSeconds={null} votingTimerSeconds={null} />,
    );
    const steps = screen.getAllByRole('listitem');
    expect(within(steps[1]!).getByText('Brainstorm')).toBeInTheDocument();
    expect(screen.getAllByText('Brainstorm')).toHaveLength(1);
  });

  it('adds up roughly how long it runs at the set timers', () => {
    render(
      <LobbyAgenda questions={QUESTIONS} discussionTimerSeconds={300} votingTimerSeconds={120} />,
    );
    // Three discussions and two votes.
    expect(screen.getByText('About 19 min at the set timers')).toBeInTheDocument();
  });

  it('says nothing about time without a discussion clock', () => {
    expect(agendaMinutes(QUESTIONS, null, 120)).toBeNull();
    expect(agendaMinutes([], 300, 120)).toBeNull();
    expect(agendaMinutes(QUESTIONS, 300, null)).toBe(15);
  });

  it('says so when there are no questions yet', () => {
    render(<LobbyAgenda questions={[]} discussionTimerSeconds={300} votingTimerSeconds={null} />);
    expect(screen.getByText('No questions yet.')).toBeInTheDocument();
  });
});
