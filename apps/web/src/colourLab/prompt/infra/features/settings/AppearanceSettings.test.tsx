import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { THEME_KEY } from '../../lib/theme';
import { AppearanceSettings } from './AppearanceSettings';

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('AppearanceSettings', () => {
  it('offers light, dark, and following the device, and starts on following it', () => {
    render(<AppearanceSettings />);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /match my device/i })).toBeChecked();
  });

  it('reflects what was chosen before', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    render(<AppearanceSettings />);
    expect(screen.getByRole('radio', { name: /^dark/i })).toBeChecked();
  });

  it('changes the theme at once, and remembers it on this device', async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);

    await user.click(screen.getByRole('radio', { name: /^dark/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(screen.getByRole('radio', { name: /^dark/i })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /^light/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('forgets the choice when it goes back to following the device', async () => {
    const user = userEvent.setup();
    localStorage.setItem(THEME_KEY, 'dark');
    render(<AppearanceSettings />);

    await user.click(screen.getByRole('radio', { name: /match my device/i }));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(screen.getByRole('radio', { name: /match my device/i })).toBeChecked();
  });
});
