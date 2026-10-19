import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TableScene, type TableSeatView } from './TableScene';

const SWATCH = { background: '#4d6a74', color: '#ffffff' };

function seat(id: string, name: string, slot: number, extra: Partial<TableSeatView> = {}) {
  return { id, name, initials: name.slice(0, 2).toUpperCase(), swatch: SWATCH, slot, ...extra };
}

/** A seat's place card, found by the seat's full name. */
const card = (name: string) =>
  document.querySelector(`li[title="${name}"] .rt-table-card`)?.textContent;

describe('TableScene', () => {
  it('draws every chair, tucking in the empty ones', () => {
    const { container } = render(
      <TableScene
        chairs={8}
        seats={[seat('a', 'Ann Lee', 0), seat('b', 'Bo Hart', 1)]}
        label="At the table"
      />,
    );

    expect(container.querySelectorAll('.rt-table-chair')).toHaveLength(8);
    expect(container.querySelectorAll('.rt-table-chair[data-empty]')).toHaveLength(6);
    expect(container.querySelectorAll('.rt-table-ghost')).toHaveLength(6);
  });

  it('cards people by first name, and adds an initial where two share one', () => {
    render(
      <TableScene
        chairs={8}
        seats={[seat('a', 'Alex Chen', 1), seat('b', 'Alex Ruiz', 2), seat('c', 'Mira', 3)]}
        label="At the table"
      />,
    );

    expect(card('Alex Chen')).toBe('Alex C.');
    expect(card('Alex Ruiz')).toBe('Alex R.');
    expect(card('Mira')).toBe('Mira');
  });

  it('shrinks the seats as the table fills', () => {
    const { container, rerender } = render(
      <TableScene chairs={8} seats={[]} label="At the table" />,
    );
    const size = () =>
      parseFloat(
        container.querySelector<HTMLElement>('.rt-table-scene')!.style.getPropertyValue('--seat'),
      );
    const roomy = size();

    rerender(<TableScene chairs={30} seats={[]} label="At the table" />);
    expect(size()).toBeLessThan(roomy);
  });

  it('hides a picture of a table from assistive tech', () => {
    const { container } = render(
      <TableScene chairs={8} seats={[seat('a', 'Ann Lee', 0, { isLeader: true })]} decorative />,
    );

    expect(container.querySelector('.rt-table-scene')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('pools light in front of the speaker only while they speak, not as they leave', () => {
    const { container, rerender } = render(
      <TableScene chairs={8} seats={[seat('a', 'Ann Lee', 2, { isSpeaking: true })]} label="t" />,
    );
    expect(container.querySelector('.rt-table-pool')).not.toBeNull();

    rerender(
      <TableScene
        chairs={8}
        seats={[seat('a', 'Ann Lee', 2, { isSpeaking: true, motion: 'leaving' })]}
        label="t"
      />,
    );
    expect(container.querySelector('.rt-table-pool')).toBeNull();
  });

  it('holds a batch of arrivals back one after another', () => {
    const { container } = render(
      <TableScene
        chairs={8}
        seats={[seat('a', 'Ann Lee', 1, { motion: 'joining', delayMs: 240 })]}
        label="t"
      />,
    );
    const arriving = container.querySelector<HTMLElement>('.rt-table-seat[data-anim="joining"]')!;
    expect(arriving.style.getPropertyValue('--delay')).toBe('240ms');
    expect(
      container
        .querySelector<HTMLElement>('.rt-table-chair[data-slot="1"]')!
        .style.getPropertyValue('--delay'),
    ).toBe('240ms');
  });
});
