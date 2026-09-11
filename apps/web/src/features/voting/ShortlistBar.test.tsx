import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShortlistBar } from './ShortlistBar';

describe('ShortlistBar', () => {
  it('tells participants the leader is still picking', () => {
    render(<ShortlistBar isLeader={false} count={2} />);
    expect(screen.getByText('Leader is selecting…')).toBeInTheDocument();
  });

  it('shows the leader how many cards are ticked', () => {
    render(<ShortlistBar isLeader count={3} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });
});
