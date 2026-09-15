import { SHORTLIST_MIN } from '@roundtable/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShortlistPrompt } from './ShortlistPrompt';

describe('ShortlistPrompt', () => {
  it(`disables proceed until ${SHORTLIST_MIN} proposals are selected`, async () => {
    const onProceed = vi.fn();
    render(
      <ShortlistPrompt
        count={1}
        busy={false}
        limitHits={0}
        error={null}
        onProceed={onProceed}
        onClear={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Proceed to voting' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Proceed to voting' }));
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('starts the vote when the shortlist is large enough', async () => {
    const onProceed = vi.fn();
    render(
      <ShortlistPrompt
        count={2}
        busy={false}
        limitHits={0}
        error={null}
        onProceed={onProceed}
        onClear={() => undefined}
        onBack={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Proceed to voting' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('keeps Proceed labelled while it is still disabled', () => {
    render(
      <ShortlistPrompt
        count={1}
        busy={false}
        limitHits={0}
        error={null}
        onProceed={() => undefined}
        onClear={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Proceed to voting' })).toBeDisabled();
    expect(screen.getByText('Selected 1/6')).toBeInTheDocument();
  });

  it('shows a failed write in place of the count, so the bar stays one line', () => {
    render(
      <ShortlistPrompt
        count={3}
        busy={false}
        limitHits={0}
        error="No response from the server — check your connection"
        onProceed={() => undefined}
        onClear={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No response from the server');
    expect(screen.queryByText('Selected 3/6')).not.toBeInTheDocument();
  });

  it('flashes the counter, and says why, when a pick past the limit is refused', () => {
    const props = {
      count: 6,
      busy: false,
      error: null,
      onProceed: () => undefined,
      onClear: () => undefined,
      onBack: () => undefined,
    };
    const { rerender } = render(<ShortlistPrompt {...props} limitHits={0} />);
    const counter = () => screen.getByText('Selected 6/6').parentElement;
    expect(counter()).not.toHaveClass('rt-shortlist-flash');

    rerender(<ShortlistPrompt {...props} limitHits={1} />);
    expect(counter()).toHaveClass('rt-shortlist-flash');
    expect(screen.getByRole('status')).toHaveTextContent('At most 6 proposals');
    // The counter is unchanged: the pick simply did not happen.
    expect(screen.getByText('Selected 6/6')).toBeInTheDocument();
  });

  it('does not flash for refusals from before the bar appeared', () => {
    render(
      <ShortlistPrompt
        count={6}
        busy={false}
        limitHits={3}
        error={null}
        onProceed={() => undefined}
        onClear={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText('Selected 6/6').parentElement).not.toHaveClass('rt-shortlist-flash');
  });

  it('returns to discussion without needing a shortlist', async () => {
    const onBack = vi.fn();
    render(
      <ShortlistPrompt
        count={0}
        busy={false}
        limitHits={0}
        error={null}
        onProceed={() => undefined}
        onClear={() => undefined}
        onBack={onBack}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Back to discussion' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
