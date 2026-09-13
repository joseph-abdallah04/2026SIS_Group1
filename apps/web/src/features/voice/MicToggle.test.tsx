import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MicToggle } from './MicToggle';

/** Connected, publishing, unmuted — the state the toggle exists to change. */
function liveProps() {
  return {
    name: 'Ada',
    micEnabled: true,
    micStatus: 'live' as const,
    status: 'connected' as const,
    busy: false,
    toggle: vi.fn(),
  };
}

describe('MicToggle', () => {
  it('names you with the mic on, and offers muting', () => {
    render(<MicToggle {...liveProps()} />);

    const button = screen.getByRole('button', { name: /Ada — microphone on/ });
    expect(button).toHaveAccessibleName(/Mute your microphone/);
    // Not pressed: "pressed" is reserved for the muted state.
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads as muted, and offers unmuting, once the mic is off', () => {
    render(<MicToggle {...liveProps()} micEnabled={false} />);

    const button = screen.getByRole('button', { name: /Ada — microphone muted/ });
    expect(button).toHaveAccessibleName(/Unmute your microphone/);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to "You" before the room has told us our name', () => {
    render(<MicToggle {...liveProps()} name={null} />);

    // In the accessible name, which is the only name an icon-only button has.
    expect(screen.getByRole('button')).toHaveAccessibleName(/^You — microphone/);
  });

  it('is the symbol alone — no name, no state in words', () => {
    // The point of the control: your name is in the roster chip now, and
    // repeating it here said the same thing twice a few pixels apart.
    const { rerender } = render(<MicToggle {...liveProps()} />);
    expect(screen.getByRole('button')).toHaveTextContent('');

    rerender(<MicToggle {...liveProps()} micEnabled={false} />);
    expect(screen.getByRole('button')).toHaveTextContent('');
  });

  it('fills red while muted, so the state is not carried by a glyph alone', () => {
    // Muted is what costs you the meeting if you miss it. A lone red icon
    // among five white chips is easy to overlook, so the fill stays.
    render(<MicToggle {...liveProps()} micEnabled={false} />);
    expect(screen.getByRole('button')).toHaveClass('bg-red-50');
  });

  it('stays quiet and grey while the mic is live', () => {
    render(<MicToggle {...liveProps()} />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-white');
    expect(button).not.toHaveClass('bg-red-50');
  });

  it('toggles on click', async () => {
    const props = liveProps();
    const user = userEvent.setup();
    render(<MicToggle {...props} />);

    await user.click(screen.getByRole('button'));

    expect(props.toggle).toHaveBeenCalledTimes(1);
  });

  it('toggles on M, without the button being focused', async () => {
    const props = liveProps();
    const user = userEvent.setup();
    render(<MicToggle {...props} />);

    await user.keyboard('m');
    await user.keyboard('M');

    expect(props.toggle).toHaveBeenCalledTimes(2);
  });

  it('leaves M alone while you are typing — a sticky note is full of them', async () => {
    const props = liveProps();
    const user = userEvent.setup();
    render(
      <>
        <MicToggle {...props} />
        <textarea aria-label="Note" />
      </>,
    );

    await user.click(screen.getByLabelText('Note'));
    await user.keyboard('memo');

    expect(props.toggle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Note')).toHaveValue('memo');
  });

  it('leaves M alone while a modal owns the screen', async () => {
    const props = liveProps();
    const user = userEvent.setup();
    render(
      <>
        <MicToggle {...props} />
        <dialog open>Creative studio</dialog>
      </>,
    );

    await user.keyboard('m');

    expect(props.toggle).not.toHaveBeenCalled();
  });

  it('is unavailable, by button and by shortcut, until voice is connected', async () => {
    const props = liveProps();
    const user = userEvent.setup();
    render(<MicToggle {...props} status="connecting" />);

    expect(screen.getByRole('button')).toBeDisabled();
    await user.keyboard('m');
    expect(props.toggle).not.toHaveBeenCalled();
  });

  it('refuses a second toggle while the first is still settling', async () => {
    const props = liveProps();
    const user = userEvent.setup();
    render(<MicToggle {...props} busy />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    await user.keyboard('m');
    expect(props.toggle).not.toHaveBeenCalled();
  });

  it('stays usable when the mic is blocked, since permission can be granted mid-session', () => {
    render(<MicToggle {...liveProps()} micEnabled={false} micStatus="blocked" />);

    const button = screen.getByRole('button');
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('title', expect.stringContaining('site settings'));
  });
});
