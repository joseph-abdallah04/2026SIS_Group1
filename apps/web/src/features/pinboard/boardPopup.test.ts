import { afterEach, describe, expect, it } from 'vitest';

import { EDGE_PX, FOOTER_GAP_PX, placeAboveBoardToolbar } from './boardPopup';

/** A toolbar row spanning the board, with the toolbar inside it. */
function mountToolbar(row: DOMRect | null) {
  const rowElement = document.createElement('div');
  rowElement.setAttribute('data-board-toolbar', '');
  const toolbar = document.createElement('nav');
  toolbar.setAttribute('data-creative-toolbar', '');
  rowElement.append(toolbar);
  document.body.append(rowElement);
  // jsdom lays nothing out: a laid-out toolbar is given a box, a hidden one
  // (`display: none`) reports none, as a browser does.
  toolbar.getClientRects = () => (row ? [row] : []) as unknown as DOMRectList;
  if (row) rowElement.getBoundingClientRect = () => row;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('placeAboveBoardToolbar', () => {
  it('leaves the popup to centre on the window where there is no toolbar', () => {
    expect(placeAboveBoardToolbar(400)).toBeNull();
  });

  // On a board too narrow for its controls the row is `display: none`. Its
  // rect is all zeros, which would put the popup above the top of the window.
  it('treats a toolbar that is not laid out as no toolbar', () => {
    mountToolbar(null);
    expect(placeAboveBoardToolbar(400)).toBeNull();
  });

  it('rests the popup just above a laid-out toolbar, centred on the board', () => {
    mountToolbar(new DOMRect(300, 700, 600, 44));
    expect(placeAboveBoardToolbar(400)).toEqual({
      top: 'auto',
      right: 'auto',
      bottom: window.innerHeight - 700 + FOOTER_GAP_PX,
      left: Math.max(EDGE_PX, Math.min(300 + 300 - 200, window.innerWidth - 400 - EDGE_PX)),
    });
  });
});
