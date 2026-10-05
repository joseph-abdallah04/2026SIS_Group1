import { BOARD_SIZE } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { cardsInRect, clampGroupDelta, rectBetween } from './boardSelection';

const card = (id: string, x: number, y: number, width = 200, height = 200) => ({
  id,
  x,
  y,
  width,
  height,
});

describe('rectBetween', () => {
  it('is the same box whichever way the pointer was dragged', () => {
    const box = { x: 100, y: 50, width: 200, height: 150 };
    expect(rectBetween({ x: 100, y: 50 }, { x: 300, y: 200 })).toEqual(box);
    expect(rectBetween({ x: 300, y: 200 }, { x: 100, y: 50 })).toEqual(box);
    expect(rectBetween({ x: 300, y: 50 }, { x: 100, y: 200 })).toEqual(box);
  });
});

describe('cardsInRect', () => {
  const cards = [card('a', 0, 0), card('b', 300, 0), card('c', 0, 300)];

  // A box swept across a cluster picks up what it crosses, not only what it
  // happened to swallow whole.
  it('takes every card the box touches', () => {
    expect(cardsInRect(cards, { x: 150, y: 50, width: 200, height: 50 })).toEqual(['a', 'b']);
  });

  it('takes nothing from empty board', () => {
    expect(cardsInRect(cards, { x: 220, y: 220, width: 50, height: 50 })).toEqual([]);
  });

  it('does not count a card it only meets at an edge', () => {
    expect(cardsInRect(cards, { x: 200, y: 0, width: 50, height: 50 })).toEqual([]);
  });
});

describe('clampGroupDelta', () => {
  const group = [card('a', 100, 100), card('b', 400, 300)];

  it('lets a move through that keeps every card on the sheet', () => {
    expect(clampGroupDelta(group, 50, -40)).toEqual({ dx: 50, dy: -40 });
  });

  // The group stops at the edge as one, so it keeps its arrangement instead
  // of piling up against the border card by card.
  it('stops the whole group at the edge the first card reaches', () => {
    expect(clampGroupDelta(group, -500, -500)).toEqual({ dx: -100, dy: -100 });
    const right = BOARD_SIZE.width - (400 + 200);
    const bottom = BOARD_SIZE.height - (300 + 200);
    expect(clampGroupDelta(group, 99_999, 99_999)).toEqual({ dx: right, dy: bottom });
  });

  it('moves nothing when there is nothing to move', () => {
    expect(clampGroupDelta([], 40, 40)).toEqual({ dx: 0, dy: 0 });
  });
});
