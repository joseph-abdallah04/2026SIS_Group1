import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ParticipantPanel } from './ParticipantPanel';
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

function renderPanel(participants: VoiceParticipant[] = room(), status: VoiceStatus = 'connected') {
  return render(<ParticipantPanel participants={participants} status={status} />);
}

/**
 * Rows are found by their text, not by accessible name: `listitem` takes its
 * name from the author, so content never computes into one — while a screen
 * reader traversing the list still reads exactly this text. Querying by role
 * name here would only assert that an `aria-label` exists, which is the thing
 * the panel deliberately does not rely on.
 */
function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByRole('listitem')
    .find((item) => (item.textContent ?? '').includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

/**
 * What a screen reader would actually read from a row: its text minus the
 * decorative bubble, which is `aria-hidden` and so never announced (plain
 * `textContent` would fold the initials in and claim "JAJoseph Abdallah").
 */
function announced(row: HTMLElement): string {
  return [...row.childNodes]
    .filter((node) => !(node instanceof HTMLElement) || node.getAttribute('aria-hidden') !== 'true')
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();
}

/** The rings are `::after` on this element, so state is read off the attribute. */
function seatOf(name: string): HTMLElement {
  const seat = rowFor(name).querySelector('.rt-voice-seat');
  if (!(seat instanceof HTMLElement)) throw new Error(`no bubble for ${name}`);
  return seat;
}

describe('ParticipantPanel', () => {
  it('lists everyone in the room, you first', () => {
    renderPanel();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    // Named by their own content, not by an aria-label on a bare <li>.
    // The rest are alphabetical, so every screen agrees.
    expect(rows.map(announced)).toEqual([
      'Ada Lovelace (you)',
      'Joseph Abdallah, speaking',
      'Kim Lee',
      'Mia Khan, muted',
      'Sam Ng',
    ]);
  });

  it('counts the room in the header', () => {
    const { container } = renderPanel();

    expect(screen.getByText(/In the room/)).toHaveTextContent('5');
    expect(container.querySelector('aside')).toHaveClass('w-64');
  });

  it('rings whoever is speaking, and only them', () => {
    renderPanel();

    expect(seatOf('Joseph Abdallah')).toHaveAttribute('data-speaking', 'true');
    expect(seatOf('Sam Ng')).not.toHaveAttribute('data-speaking');
    expect(seatOf('Ada Lovelace')).not.toHaveAttribute('data-speaking');
  });

  it('marks muted people, and never rings them', () => {
    renderPanel([
      // Muted and reported speaking at once — the mute has to win.
      person({ identity: 'u3', name: 'Mia Khan', isMuted: true, isSpeaking: true }),
    ]);

    const seat = seatOf('Mia Khan');
    expect(seat.querySelector('.rt-voice-bubble-muted')).not.toBeNull();
    expect(seat).not.toHaveAttribute('data-speaking');
  });

  it('shows initials on the bubble, matching the waiting room', () => {
    renderPanel([person({ identity: 'u1', name: 'Alice Smith' })]);

    expect(seatOf('Alice Smith').querySelector('.rt-voice-bubble')).toHaveTextContent('AS');
  });

  it('drops someone who leaves', () => {
    const { rerender } = renderPanel();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    rerender(
      <ParticipantPanel
        participants={room().filter((p) => p.identity !== 'u4')}
        status="connected"
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(() => rowFor('Sam Ng')).toThrow();
  });

  it('adds a late joiner without disturbing the rest', () => {
    const { rerender } = renderPanel();

    rerender(
      <ParticipantPanel
        participants={[...room(), person({ identity: 'u6', name: 'Bea Cole' })]}
        status="connected"
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(rowFor('Bea Cole')).toBeInTheDocument();
  });

  describe('collapsed', () => {
    it('keeps the bubbles, their rings and their mute badges', async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole('button', { name: /Collapse participants/ }));

      const strip = screen.getByRole('list');
      expect(within(strip).getAllByRole('listitem')).toHaveLength(5);
      // The whole point of the strip: presence survives the assistant panel
      // opening over this side of the board.
      expect(seatOf('Joseph Abdallah')).toHaveAttribute('data-speaking', 'true');
      expect(seatOf('Mia Khan').querySelector('.rt-voice-bubble-muted')).not.toBeNull();
    });

    it('offers its way back, carrying the count', async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole('button', { name: /Collapse participants/ }));
      const expand = screen.getByRole('button', { name: /Expand participants/ });
      expect(expand).toHaveAccessibleName(/5 people/);
      expect(screen.getByText(/In the room/)).toHaveTextContent('5');

      await user.click(expand);
      expect(screen.getByRole('button', { name: /Collapse participants/ })).toBeInTheDocument();
    });

    it('keeps a big room whole rather than hiding people behind a counter', async () => {
      const user = userEvent.setup();
      const crowd = Array.from({ length: 11 }, (_, i) =>
        person({ identity: `u${i}`, name: `Person ${i}` }),
      );
      // The eleventh person sorts last and is the one talking — truncating the
      // strip would drop exactly the person it exists to show.
      crowd[10] = person({ identity: 'u10', name: 'Zoe Last', isSpeaking: true });
      renderPanel(crowd);

      await user.click(screen.getByRole('button', { name: /Collapse participants/ }));

      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(11);
      expect(seatOf('Zoe Last')).toHaveAttribute('data-speaking', 'true');
    });
  });

  describe('with nobody listed', () => {
    it('blames the connection rather than the room', () => {
      renderPanel([], 'connecting');
      expect(screen.getByText('Joining the room…')).toBeInTheDocument();
    });

    it('says voice is offline when the connection gave up', () => {
      renderPanel([], 'failed');
      // Never "nobody is here": you are always in your own room, so an empty
      // roster is a statement about the connection.
      expect(screen.getByText(/Voice is offline/)).toBeInTheDocument();
    });

    it('drops the count from the header', () => {
      renderPanel([], 'failed');
      expect(screen.getByText(/In the room/)).not.toHaveTextContent('0');
    });
  });

  it('warns that a reconnecting list may be stale', () => {
    renderPanel(room(), 'reconnecting');
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
  });
});
