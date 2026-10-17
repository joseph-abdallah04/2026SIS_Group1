import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PeopleSnapshot } from './PeopleSnapshot';
import type { VoiceParticipant } from './useVoiceRoom';

function person(overrides: Partial<VoiceParticipant> & { identity: string }): VoiceParticipant {
  return {
    name: overrides.identity,
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    ...overrides,
  };
}

function crowd(size: number): VoiceParticipant[] {
  return Array.from({ length: size }, (_, i) => person({ identity: `u${i}`, name: `Person ${i}` }));
}

function renderSnapshot(
  participants: VoiceParticipant[],
  { leaderId = null, onOpen = vi.fn() }: { leaderId?: string | null; onOpen?: () => void } = {},
) {
  return render(<PeopleSnapshot participants={participants} leaderId={leaderId} onOpen={onOpen} />);
}

const snapshot = () => document.querySelector<HTMLElement>('[data-people-snapshot]')!;
const seats = () => [...snapshot().querySelectorAll<HTMLElement>('.rt-voice-seat')];
const initials = () => seats().map((seat) => seat.querySelector('.rt-voice-bubble')?.textContent);
const total = () => snapshot().querySelector<HTMLElement>('.rt-voice-more');
const seatFor = (letters: string) =>
  seats().find((seat) => seat.querySelector('.rt-voice-bubble')?.textContent === letters)!;

afterEach(() => {
  // The narrow-header tests install a matchMedia; later tests must not see it.
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('PeopleSnapshot', () => {
  it('sets up to four people side by side, you first, with no total', () => {
    renderSnapshot([
      person({ identity: 'u2', name: 'Sam Ng' }),
      person({ identity: 'u1', name: 'Ada Lovelace', isLocal: true }),
      person({ identity: 'u3', name: 'Kim Lee' }),
      person({ identity: 'u4', name: 'Mia Khan' }),
    ]);

    expect(initials()).toEqual(['AL', 'KL', 'MK', 'SN']);
    expect(snapshot().querySelector('[data-overlap]')).toBeNull();
    expect(total()).toBeNull();
  });

  it('overlaps four past four, followed by everyone counted', () => {
    renderSnapshot(crowd(9));

    expect(seats()).toHaveLength(4);
    expect(snapshot().querySelector('[data-overlap="true"]')).not.toBeNull();
    expect(total()).toHaveTextContent('9');
    expect(screen.getByRole('button')).toHaveAccessibleName(/^9 people\. Open the people list$/);
  });

  it('rings whoever is speaking, never someone muted', () => {
    renderSnapshot([
      person({ identity: 'u1', name: 'Joseph Abdallah', isSpeaking: true }),
      // Muted and reported speaking at once: the mute has to win.
      person({ identity: 'u2', name: 'Mia Khan', isMuted: true, isSpeaking: true }),
    ]);

    expect(seatFor('JA')).toHaveAttribute('data-speaking', 'true');
    expect(seatFor('MK')).not.toHaveAttribute('data-speaking');
    expect(seatFor('MK').querySelector('.rt-voice-bubble-muted')).not.toBeNull();
    expect(screen.getByRole('button')).toHaveAccessibleName(
      '2 people, Joseph Abdallah speaking. Open the people list',
    );
  });

  it('moves someone who is not shown into view when they start talking', () => {
    // The regression this guards: truncating a roster eventually hides exactly
    // the person the speaking indicator exists to report.
    const room = crowd(8);
    room[7] = person({ identity: 'u7', name: 'Zoe Last', isSpeaking: true });
    renderSnapshot(room);

    expect(initials()).toContain('ZL');
    expect(seatFor('ZL')).toHaveAttribute('data-speaking', 'true');
    expect(total()).not.toHaveAttribute('data-speaking');
  });

  it('rings the total when every face shown is already talking', () => {
    renderSnapshot(
      Array.from({ length: 6 }, (_, i) =>
        person({ identity: `u${i}`, name: `Person ${i}`, isSpeaking: true }),
      ),
    );

    expect(total()).toHaveAttribute('data-speaking', 'true');
  });

  it('crowns the leader', () => {
    renderSnapshot(crowd(3), { leaderId: 'u1' });

    expect(seatFor('P1').querySelector('[data-leader-mark]')).not.toBeNull();
    expect(seatFor('P0').querySelector('[data-leader-mark]')).toBeNull();
  });

  it('opens the people list, and says so on hover', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderSnapshot(crowd(6), { onOpen });

    await user.hover(screen.getByRole('button'));
    expect(await screen.findByText('6 people • open list')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows nothing before anyone is known to be here', () => {
    const { container } = renderSnapshot([]);
    expect(container).toBeEmptyDOMElement();
  });

  describe('on a narrow header', () => {
    /** jsdom has no matchMedia; the hook defaults to the wide case without it. */
    function matchNarrow() {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
      });
    }

    it('shows three faces, overlapping from four people', () => {
      matchNarrow();
      renderSnapshot(crowd(4));

      expect(seats()).toHaveLength(3);
      expect(total()).toHaveTextContent('4');
    });

    it('still moves a speaker into view', () => {
      matchNarrow();
      const room = crowd(8);
      room[7] = person({ identity: 'u7', name: 'Zoe Last', isSpeaking: true });
      renderSnapshot(room);

      expect(initials()).toContain('ZL');
    });
  });
});
