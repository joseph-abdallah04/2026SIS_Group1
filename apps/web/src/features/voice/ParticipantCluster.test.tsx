import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ParticipantCluster } from './ParticipantCluster';
import type { VoiceParticipant, VoiceStatus } from './useVoiceRoom';

function person(overrides: Partial<VoiceParticipant> & { identity: string }): VoiceParticipant {
  return {
    name: overrides.identity,
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    ...overrides,
  };
}

/** A five-person room — the size F13's acceptance criteria call out. */
function room(): VoiceParticipant[] {
  return [
    person({ identity: 'u1', name: 'Ada Lovelace', isLocal: true }),
    person({ identity: 'u2', name: 'Joseph Abdallah', isSpeaking: true }),
    person({ identity: 'u3', name: 'Mia Khan', isMuted: true }),
    person({ identity: 'u4', name: 'Sam Ng' }),
    person({ identity: 'u5', name: 'Kim Lee' }),
  ];
}

function renderCluster(
  participants: VoiceParticipant[] = room(),
  status: VoiceStatus = 'connected',
) {
  return render(<ParticipantCluster participants={participants} status={status} />);
}

/**
 * The roster bubbles, which are the `listitem`s in the chip itself. When the
 * overflow panel is open its rows are `listitem`s too, so the chip's own list
 * is addressed directly.
 */
function bubbleItems(container: HTMLElement): HTMLElement[] {
  const list = container.querySelector('ul');
  if (!list) throw new Error('no bubble list');
  return within(list as HTMLElement).getAllByRole('listitem');
}

/**
 * What a screen reader would read from each bubble: its text minus the
 * decorative bubble itself, which is `aria-hidden` and never announced. Plain
 * `textContent` would fold the initials in and claim "Ada Lovelace (you)AL".
 */
function labels(container: HTMLElement): string[] {
  return bubbleItems(container).map((item) =>
    [...item.childNodes]
      .filter(
        (node) => !(node instanceof HTMLElement) || node.getAttribute('aria-hidden') !== 'true',
      )
      .map((node) => node.textContent ?? '')
      .join('')
      .trim(),
  );
}

/** The rings are `::after` on this element, so state is read off the attribute. */
function seatOf(container: HTMLElement, name: string): HTMLElement {
  const item = bubbleItems(container).find((row) => (row.textContent ?? '').includes(name));
  if (!item) throw new Error(`no bubble for ${name}`);
  const seat = item.querySelector('.rt-voice-seat');
  if (!(seat instanceof HTMLElement)) throw new Error(`no seat for ${name}`);
  return seat;
}

function overflowButton(): HTMLElement {
  return screen.getByRole('button', { name: /Show everyone in the room/ });
}

describe('ParticipantCluster', () => {
  afterEach(() => {
    // The narrow-header tests install a matchMedia; later tests must not see it.
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('shows the whole room when it fits, you first', () => {
    const { container } = renderCluster();

    // Five is the visible limit, so a five-person room hides nobody.
    expect(labels(container)).toEqual([
      'Ada Lovelace (you)',
      'Joseph Abdallah, speaking',
      'Kim Lee',
      'Mia Khan, muted',
      'Sam Ng',
    ]);
    expect(overflowButton()).toHaveTextContent('⋯');
  });

  it('rings whoever is speaking, and only them', () => {
    const { container } = renderCluster();

    expect(seatOf(container, 'Joseph Abdallah')).toHaveAttribute('data-speaking', 'true');
    expect(seatOf(container, 'Sam Ng')).not.toHaveAttribute('data-speaking');
  });

  it('marks muted people, and never rings them', () => {
    const { container } = renderCluster([
      // Muted and reported speaking at once — the mute has to win.
      person({ identity: 'u3', name: 'Mia Khan', isMuted: true, isSpeaking: true }),
    ]);

    const seat = seatOf(container, 'Mia Khan');
    expect(seat.querySelector('.rt-voice-bubble-muted')).not.toBeNull();
    expect(seat).not.toHaveAttribute('data-speaking');
  });

  it('uses the header bubble size, so the header does not grow', () => {
    const { container } = renderCluster([person({ identity: 'u1', name: 'Alice Smith' })]);

    const seat = seatOf(container, 'Alice Smith');
    expect(seat).toHaveAttribute('data-size', 'header');
    expect(seat.querySelector('.rt-voice-bubble')).toHaveTextContent('AS');
  });

  it('counts the overflow once the room outgrows the chip', () => {
    const crowd = Array.from({ length: 8 }, (_, i) =>
      person({ identity: `u${i}`, name: `Person ${i}` }),
    );
    const { container } = renderCluster(crowd);

    expect(bubbleItems(container)).toHaveLength(5);
    expect(overflowButton()).toHaveTextContent('+3');
    expect(overflowButton()).toHaveAccessibleName(/8 people/);
  });

  it('promotes a hidden speaker into the chip', () => {
    // The regression this guards: truncating a roster eventually hides exactly
    // the person the speaking indicator exists to report.
    const crowd = Array.from({ length: 8 }, (_, i) =>
      person({ identity: `u${i}`, name: `Person ${i}` }),
    );
    crowd[7] = person({ identity: 'u7', name: 'Zoe Last', isSpeaking: true });
    const { container } = renderCluster(crowd);

    expect(labels(container).join(' ')).toContain('Zoe Last');
    expect(seatOf(container, 'Zoe Last')).toHaveAttribute('data-speaking', 'true');
  });

  it('rings the overflow when a speaker could not be promoted', () => {
    // Everyone visible is already speaking, so there is no slot to give up —
    // the control itself has to carry the signal.
    const crowd = Array.from({ length: 7 }, (_, i) =>
      person({ identity: `u${i}`, name: `Person ${i}`, isSpeaking: true }),
    );
    renderCluster(crowd);

    expect(overflowButton()).toHaveAttribute('data-speaking', 'true');
  });

  it('leaves the overflow unrung when nobody hidden is talking', () => {
    const crowd = Array.from({ length: 8 }, (_, i) =>
      person({ identity: `u${i}`, name: `Person ${i}` }),
    );
    renderCluster(crowd);

    expect(overflowButton()).not.toHaveAttribute('data-speaking');
  });

  it('does not ring the overflow for a hidden person who is merely muted', () => {
    const crowd = Array.from({ length: 8 }, (_, i) =>
      person({ identity: `u${i}`, name: `Person ${i}` }),
    );
    crowd[7] = person({ identity: 'u7', name: 'Zoe Last', isMuted: true, isSpeaking: true });
    renderCluster(crowd);

    expect(overflowButton()).not.toHaveAttribute('data-speaking');
  });

  describe('overflow panel', () => {
    it('lists the whole room, not just the hidden part', async () => {
      const user = userEvent.setup();
      const crowd = Array.from({ length: 8 }, (_, i) =>
        person({ identity: `u${i}`, name: `Person ${i}` }),
      );
      renderCluster(crowd);

      await user.click(overflowButton());

      const panel = screen.getByRole('dialog', { name: 'In the room' });
      // Someone opening this to find a name should not have to work out which
      // half of the room they are in.
      expect(within(panel).getAllByRole('listitem')).toHaveLength(8);
    });

    it('closes when the trigger is pressed again', async () => {
      // The dismissal handler runs on `pointerdown` in the capture phase, so
      // without exempting the trigger it closed the panel and the `click` that
      // followed re-opened it — leaving a control that could open but never
      // close. Escape and outside presses still worked, which is exactly why
      // this survived casual testing.
      const user = userEvent.setup();
      renderCluster();

      await user.click(overflowButton());
      expect(screen.getByRole('dialog', { name: 'In the room' })).toBeInTheDocument();

      await user.click(overflowButton());
      expect(screen.queryByRole('dialog', { name: 'In the room' })).toBeNull();
      expect(overflowButton()).toHaveAttribute('aria-expanded', 'false');
    });

    it('draws its mute badges against the panel, not the old rail', async () => {
      // `.rt-voice-bubble-muted` rings itself in `--rt-seat-surface`, which
      // defaults to the rail's tinted background. The panel is white.
      const user = userEvent.setup();
      renderCluster();

      await user.click(overflowButton());
      const panel = screen.getByRole('dialog', { name: 'In the room' });
      expect(panel.querySelector('.rt-voice-roster')).not.toBeNull();
    });

    it('closes on Escape', async () => {
      const user = userEvent.setup();
      renderCluster();

      await user.click(overflowButton());
      expect(screen.getByRole('dialog', { name: 'In the room' })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'In the room' })).toBeNull();
    });

    it('closes on a press outside it', async () => {
      const user = userEvent.setup();
      renderCluster();

      await user.click(overflowButton());
      await user.click(document.body);

      expect(screen.queryByRole('dialog', { name: 'In the room' })).toBeNull();
    });

    it('reports itself as a dialog on the trigger', async () => {
      const user = userEvent.setup();
      renderCluster();

      expect(overflowButton()).toHaveAttribute('aria-haspopup', 'dialog');
      expect(overflowButton()).toHaveAttribute('aria-expanded', 'false');

      await user.click(overflowButton());
      expect(overflowButton()).toHaveAttribute('aria-expanded', 'true');
    });

    it('warns that a reconnecting roster may be stale', async () => {
      const user = userEvent.setup();
      renderCluster(room(), 'reconnecting');

      await user.click(overflowButton());
      expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
    });
  });

  describe('on a narrow header', () => {
    /** jsdom has no matchMedia; the hook defaults to the wide case without it. */
    function matchNarrow(matches: boolean) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: () => ({
          matches,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      });
    }

    it('drops to three bubbles', () => {
      matchNarrow(true);
      const crowd = Array.from({ length: 8 }, (_, i) =>
        person({ identity: `u${i}`, name: `Person ${i}` }),
      );
      const { container } = renderCluster(crowd);

      expect(bubbleItems(container)).toHaveLength(3);
      expect(overflowButton()).toHaveTextContent('+5');
    });

    it('still promotes a speaker into the smaller chip', () => {
      matchNarrow(true);
      const crowd = Array.from({ length: 8 }, (_, i) =>
        person({ identity: `u${i}`, name: `Person ${i}` }),
      );
      crowd[7] = person({ identity: 'u7', name: 'Zoe Last', isSpeaking: true });
      const { container } = renderCluster(crowd);

      expect(labels(container).join(' ')).toContain('Zoe Last');
    });

    it('renders each person once, never twice', () => {
      // Rendering a wide set and a narrow set side by side and hiding one with
      // CSS would put everyone in the DOM twice and read the room out twice.
      matchNarrow(false);
      const { container } = renderCluster();

      expect(bubbleItems(container)).toHaveLength(5);
      expect(labels(container).filter((l) => l.includes('Ada Lovelace'))).toHaveLength(1);
    });
  });

  describe('with nobody listed', () => {
    it('blames the connection rather than the room', () => {
      renderCluster([], 'connecting');
      expect(screen.getByText('Joining the room…')).toBeInTheDocument();
    });

    it('says voice is offline when the connection gave up', () => {
      renderCluster([], 'failed');
      // Never "nobody is here": you are always in your own room.
      expect(screen.getByText(/Voice is offline/)).toBeInTheDocument();
    });

    it('offers no overflow control at all', () => {
      renderCluster([], 'failed');
      expect(screen.queryByRole('button', { name: /Show everyone/ })).toBeNull();
    });
  });
});
