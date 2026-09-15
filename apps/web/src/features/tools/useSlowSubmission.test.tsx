import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StudioProposeButton } from './StudioOverlay';
import { useSlowSubmission } from './useProposalSubmission';

describe('a proposal on its way', () => {
  // Most sends are over in a moment; showing them greyed the studio out and back
  // just before it closed.
  it('is not shown for a send that goes through quickly', () => {
    const { result, rerender } = renderHook(({ submitting }) => useSlowSubmission(submitting), {
      initialProps: { submitting: true },
    });
    expect(result.current).toBe(false);

    rerender({ submitting: false });

    expect(result.current).toBe(false);
  });

  it('is shown once a send has been waiting a while, and not after it ends', async () => {
    const { result, rerender } = renderHook(({ submitting }) => useSlowSubmission(submitting), {
      initialProps: { submitting: true },
    });

    await waitFor(() => expect(result.current).toBe(true), { timeout: 1000 });

    rerender({ submitting: false });
    expect(result.current).toBe(false);

    // A later send starts from the beginning again rather than showing at once.
    rerender({ submitting: true });
    expect(result.current).toBe(false);
  });
});

describe('the Propose button', () => {
  it('says Propose, with no icon beside it', () => {
    render(<StudioProposeButton form="studio" disabled={false} sending={false} title="Propose" />);

    const button = screen.getByRole('button', { name: 'Propose' });
    expect(button.querySelector('svg')).toBeNull();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  // Covered by a spinner rather than relabelled, so the button keeps its width
  // and nothing else in the header moves.
  it('covers its label with a spinner while a slow send waits', () => {
    render(<StudioProposeButton form="studio" disabled={false} sending title="Propose" />);

    const button = screen.getByRole('button', { name: 'Proposing' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Propose');
    expect(button.querySelector('svg')).not.toBeNull();
  });
});
