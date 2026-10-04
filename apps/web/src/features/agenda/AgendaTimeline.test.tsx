import { afterEach, describe, expect, it } from 'vitest';

import { revealInList } from './AgendaTimeline';

/** A list showing 100–300 and a step at `top`, `height` tall, as jsdom lays out nothing. */
function laidOut(top: number, height: number, scrollTop = 50) {
  const list = document.createElement('ol');
  const step = document.createElement('li');
  list.append(step);
  document.body.append(list);
  list.scrollTop = scrollTop;
  list.getBoundingClientRect = () => new DOMRect(0, 100, 200, 200);
  step.getBoundingClientRect = () => new DOMRect(0, top, 200, height);
  return { list, step };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('revealInList', () => {
  it('leaves a step that is already in view where it is', () => {
    const { list, step } = laidOut(150, 60);
    revealInList(step);
    expect(list.scrollTop).toBe(50);
  });

  it('scrolls up just far enough to show a step above the view', () => {
    const { list, step } = laidOut(80, 60);
    revealInList(step);
    expect(list.scrollTop).toBe(30);
  });

  it('scrolls down just far enough to show a step below the view', () => {
    const { list, step } = laidOut(280, 60);
    revealInList(step);
    expect(list.scrollTop).toBe(90);
  });

  it('keeps the head of a step taller than the list in view', () => {
    const { list, step } = laidOut(260, 400);
    revealInList(step);
    // Its head goes to the top of the list, not its foot to the bottom.
    expect(list.scrollTop).toBe(210);
  });
});
