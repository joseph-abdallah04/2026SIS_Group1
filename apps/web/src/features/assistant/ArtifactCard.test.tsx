import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArtifactCard, proposeUnavailableHint } from './ArtifactCard';

describe('proposeUnavailableHint', () => {
  it('names voting as a locked board, not a dropped connection', () => {
    expect(proposeUnavailableHint('voting')).toBe(
      'Proposals are locked while this question is in voting',
    );
  });

  it('says a settled question is closed to new proposals', () => {
    expect(proposeUnavailableHint('answered')).toBe('This question is closed to new proposals');
    expect(proposeUnavailableHint('skipped')).toBe('This question is closed to new proposals');
  });

  it('keeps the reconnect line for a live discussion whose socket is down', () => {
    expect(proposeUnavailableHint('discussion')).toBe('Available once the board is connected');
    expect(proposeUnavailableHint(undefined)).toBe('Available once the board is connected');
  });
});

describe('ArtifactCard', () => {
  it('shows the voting lock rather than a reconnect hint', () => {
    render(
      <ArtifactCard
        artifact={{ type: 'sticky', text: 'Ship it', color: 'yellow' }}
        propose="idle"
        canPropose={false}
        questionStatus="voting"
        onPropose={() => undefined}
      />,
    );

    expect(screen.getByText('Proposals are locked while this question is in voting')).toBeTruthy();
    expect(screen.queryByText('Available once the board is connected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Propose' })).toBeDisabled();
  });
});
