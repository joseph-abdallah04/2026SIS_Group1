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
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Proceed to voting' }));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });
});
