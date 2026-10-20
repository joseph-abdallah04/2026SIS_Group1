import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PasswordInput } from './PasswordInput';

describe('PasswordInput', () => {
  it('hides what is typed until the eye is pressed, and hides it again', async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="Password" defaultValue="hunter22" />);
    const field = screen.getByLabelText('Password', { selector: 'input' });

    expect(field).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  // The eye is outside the label, so it does not become part of the field's name.
  it('is named by its label alone', () => {
    render(<PasswordInput label="Password" />);
    expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAccessibleName(
      'Password',
    );
  });
});
