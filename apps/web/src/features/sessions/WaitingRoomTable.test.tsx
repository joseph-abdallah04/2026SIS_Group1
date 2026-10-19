import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JOIN_MS, LEAVE_MS } from './useTableSeating';
import { WaitingRoomTable } from './WaitingRoomTable';
import { swatchForId } from './waitingRoomSeats';

type Props = Parameters<typeof WaitingRoomTable>[0];

function renderTable(overrides: Partial<Props> = {}) {
  const props: Props = {
    participants: [
      { id: 'u2', displayName: 'Alice Smith' },
      { id: 'leader-1', displayName: 'Joey' },
    ],
    leaderId: 'leader-1',
    viewerId: 'u2',
    ...overrides,
  };
  const view = render(<WaitingRoomTable {...props} />);
  return {
    ...view,
    rerenderWith: (next: Partial<Props>) =>
      view.rerender(<WaitingRoomTable {...props} {...next} />),
  };
}

/** A seat, found by the words a screen reader takes for it. */
const seat = (label: string) => screen.getByText(label).closest('li')!;
const chair = (slot: number) =>
  document.querySelector<HTMLElement>(`.rt-table-chair[data-slot="${slot}"]`)!;

afterEach(() => {
  vi.useRealTimers();
});

describe('WaitingRoomTable', () => {
  it('seats everyone as a list, read in full, with place cards to read by eye', () => {
    renderTable();

    const list = screen.getByRole('list', { name: 'At the table' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(seat('Joey, leader')).toBeInTheDocument();
    expect(seat('Alice Smith, you')).toBeInTheDocument();
    // The cards: a first name, and "(you)" on your own.
    expect(within(seat('Alice Smith, you')).getByText('Alice')).toBeInTheDocument();
    expect(within(seat('Alice Smith, you')).getByText('(you)')).toBeInTheDocument();
    // The board's crown, on the leader only.
    expect(seat('Joey, leader').querySelector('.rt-table-crown')).not.toBeNull();
    expect(seat('Alice Smith, you').querySelector('.rt-table-crown')).toBeNull();
  });

  it('sits the leader at the head even when they are not first in the list', () => {
    renderTable();
    expect(seat('Joey, leader')).toHaveAttribute('data-slot', '0');
    expect(seat('Alice Smith, you')).toHaveAttribute('data-slot', '1');
  });

  it('sets the chairs before anyone is known to be here, and seats nobody yet', () => {
    renderTable({ participants: null });

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(document.querySelectorAll('.rt-table-chair')).toHaveLength(8);
    // Who is here is not known yet, so the head chair claims nothing.
    expect(chair(0)).not.toHaveAttribute('data-host');
  });

  it('keeps the host’s chair, crowned, while the leader is away', () => {
    renderTable({ participants: [{ id: 'u2', displayName: 'Alice Smith' }] });

    expect(chair(0)).toHaveAttribute('data-host', 'true');
    expect(within(chair(0)).getByText('Host')).toBeInTheDocument();
    expect(seat('Alice Smith, you')).toHaveAttribute('data-slot', '1');
  });

  it('draws only people who arrive after the first snapshot as arriving, and for a while', () => {
    vi.useFakeTimers();
    const { rerenderWith } = renderTable({
      participants: [{ id: 'leader-1', displayName: 'Joey' }],
    });
    expect(seat('Joey, leader')).not.toHaveAttribute('data-anim');

    rerenderWith({
      participants: [
        { id: 'leader-1', displayName: 'Joey' },
        { id: 'u3', displayName: 'Bob Ray' },
      ],
    });
    expect(seat('Bob Ray')).toHaveAttribute('data-anim', 'joining');
    expect(chair(1)).toHaveAttribute('data-anim', 'joining');
    expect(seat('Joey, leader')).not.toHaveAttribute('data-anim');

    act(() => vi.advanceTimersByTime(JOIN_MS));
    expect(seat('Bob Ray')).not.toHaveAttribute('data-anim');
  });

  it('lets each arrival run its own course', () => {
    vi.useFakeTimers();
    const leader = { id: 'leader-1', displayName: 'Joey' };
    const bob = { id: 'u3', displayName: 'Bob Ray' };
    const cat = { id: 'u4', displayName: 'Cat Lee' };
    const { rerenderWith } = renderTable({ participants: [leader] });

    rerenderWith({ participants: [leader, bob] });
    act(() => vi.advanceTimersByTime(JOIN_MS - 300));
    rerenderWith({ participants: [leader, bob, cat] });
    // A second arrival does not cut the first one's short, or restart it.
    expect(seat('Bob Ray')).toHaveAttribute('data-anim', 'joining');
    act(() => vi.advanceTimersByTime(300));
    expect(seat('Bob Ray')).not.toHaveAttribute('data-anim');
    expect(seat('Cat Lee')).toHaveAttribute('data-anim', 'joining');
  });

  it('fades a departure out of its chair, then frees the chair', () => {
    vi.useFakeTimers();
    const leader = { id: 'leader-1', displayName: 'Joey' };
    const bob = { id: 'u3', displayName: 'Bob Ray' };
    const { rerenderWith } = renderTable({ participants: [leader, bob] });

    rerenderWith({ participants: [leader] });
    const leaving = document.querySelector('.rt-table-seat[data-anim="leaving"]');
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    expect(chair(1)).not.toHaveAttribute('data-empty');

    act(() => vi.advanceTimersByTime(LEAVE_MS));
    expect(document.querySelector('.rt-table-seat[data-anim="leaving"]')).toBeNull();
    expect(chair(1)).toHaveAttribute('data-empty', 'true');
  });

  it('rings whoever is speaking, and pools light in front of them', () => {
    const { container } = renderTable({
      voiceParticipants: [
        { identity: 'u2', name: 'Alice Smith', isLocal: true, isSpeaking: true, isMuted: false },
        { identity: 'leader-1', name: 'Joey', isLocal: false, isSpeaking: false, isMuted: false },
      ],
    });

    const ringed = container.querySelectorAll('.rt-table-seat[data-speaking="true"]');
    expect(ringed).toHaveLength(1);
    expect(ringed[0]).toBe(seat('Alice Smith, you'));
    expect(container.querySelectorAll('.rt-table-pool')).toHaveLength(1);
  });

  it('says who is muted', () => {
    renderTable({
      voiceParticipants: [
        { identity: 'leader-1', name: 'Joey', isLocal: false, isSpeaking: false, isMuted: true },
      ],
    });
    expect(seat('Joey, leader, muted')).toBeInTheDocument();
  });

  it('ignores a voice participant who has no seat', () => {
    renderTable({
      participants: [{ id: 'leader-1', displayName: 'Joey' }],
      voiceParticipants: [
        // Socket presence is the roster; someone heard but not seated is not
        // drawn a chair of their own.
        { identity: 'ghost', name: 'Ghost', isLocal: false, isSpeaking: true, isMuted: false },
      ],
    });

    expect(screen.queryByText(/Ghost/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(document.querySelector('.rt-table-pool')).toBeNull();
  });

  it('does not replay the arrival when only voice changes', () => {
    const participants = [
      { id: 'u2', displayName: 'Alice Smith' },
      { id: 'leader-1', displayName: 'Joey' },
    ];
    const { container, rerenderWith } = renderTable({ participants, voiceParticipants: [] });

    // Speech edges re-render this table constantly. If that churn reached the
    // seating, every seat would replay its arrival each time somebody drew breath.
    rerenderWith({
      participants,
      voiceParticipants: [
        { identity: 'u2', name: 'Alice Smith', isLocal: true, isSpeaking: true, isMuted: false },
      ],
    });

    expect(container.querySelectorAll('[data-anim]')).toHaveLength(0);
  });

  // The board's rule: a seat matches that person's row in People, and keeps
  // its colour when the session starts.
  it('colours each seat by its person alone', () => {
    renderTable();

    for (const [id, label] of [
      ['leader-1', 'Joey, leader'],
      ['u2', 'Alice Smith, you'],
    ] as const) {
      expect(seat(label).querySelector('.rt-table-bubble')).toHaveStyle({
        background: swatchForId(id).background,
      });
    }
  });

  it('thins the place cards out round a crowded table', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({
      id: `u${i}`,
      displayName: `Person ${i}`,
    }));
    const { container, rerenderWith } = renderTable({ participants: many.slice(0, 6) });
    expect(container.querySelector('.rt-table-scene')).not.toHaveAttribute('data-compact');

    rerenderWith({ participants: many });
    expect(container.querySelector('.rt-table-scene')).toHaveAttribute('data-compact', 'true');
  });

  it('thins them out sooner on a small screen', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, displayName: `Person ${i}` }));
    const { container } = renderTable({ participants: ten, small: true });
    expect(container.querySelector('.rt-table-scene')).toHaveAttribute('data-compact', 'true');
  });
});
