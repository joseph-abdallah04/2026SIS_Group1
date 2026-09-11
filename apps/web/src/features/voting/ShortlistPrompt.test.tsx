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
        error={null}
        onProceed={() => undefined}
        onClear={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Proceed to voting' })).toBeDisabled();
    expect(screen.getByText('1 selected · pick 2–6')).toBeInTheDocument();
  });

  it('returns to discussion without needing a shortlist', async () => {
    const onBack = vi.fn();
    render(
      <ShortlistPrompt
        count={0}
        busy={false}
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
