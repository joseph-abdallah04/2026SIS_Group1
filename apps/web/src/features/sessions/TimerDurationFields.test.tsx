import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DISCUSSION_TIMER_MAX_SECONDS } from '@roundtable/shared/schemas';

import { TimerDurationFields } from './TimerDurationFields';
import type { TimerDurationParts } from '@roundtable/shared/schemas';

const ZERO: TimerDurationParts = { hours: 0, minutes: 0, seconds: 0 };

function Harness({ initial = ZERO }: { initial?: TimerDurationParts }) {
  const [value, setValue] = useState(initial);
  return (
    <TimerDurationFields
      id="discussion-timer"
      label="Discussion timer"
      hint="Hint"
      maxSeconds={DISCUSSION_TIMER_MAX_SECONDS}
      value={value}
      onChange={setValue}
    />
  );
}

describe('TimerDurationFields', () => {
  it('steps minutes with the arrows', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Increase Discussion timer minutes' }));
    expect(screen.getByRole('spinbutton', { name: 'Discussion timer minutes' })).toHaveValue('01');

    await user.click(screen.getByRole('button', { name: 'Decrease Discussion timer minutes' }));
    expect(screen.getByRole('spinbutton', { name: 'Discussion timer minutes' })).toHaveValue('00');
  });

  it('steps seconds in 15s increments', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const up = screen.getByRole('button', { name: 'Increase Discussion timer seconds' });
    await user.click(up);
    expect(screen.getByRole('spinbutton', { name: 'Discussion timer seconds' })).toHaveValue('15');
    await user.click(up);
    expect(screen.getByRole('spinbutton', { name: 'Discussion timer seconds' })).toHaveValue('30');
  });

  it('jumps to a typed number', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const minutes = screen.getByRole('spinbutton', { name: 'Discussion timer minutes' });
    await user.clear(minutes);
    await user.type(minutes, '10');
    await user.tab();
    expect(minutes).toHaveValue('10');
  });

  it('snaps typed seconds to the nearest 15', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const seconds = screen.getByRole('spinbutton', { name: 'Discussion timer seconds' });
    await user.clear(seconds);
    await user.type(seconds, '20');
    await user.tab();
    expect(seconds).toHaveValue('15');
  });
});
