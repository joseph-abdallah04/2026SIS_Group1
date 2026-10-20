import { afterEach, describe, expect, it } from 'vitest';

import { EDGE_PX, FOOTER_GAP_PX, placeAboveBoardToolbar } from './boardPopup';

/**
 * A toolbar row spanning the board, with the toolbar inside it. The toolbar is
 * centred in the row unless it is given a box of its own.
 */
function mountToolbar(row: DOMRect | null, bar?: DOMRect) {
  const rowElement = document.createElement('div');
  rowElement.setAttribute('data-board-toolbar', '');
  // As the board's row is, with `px-6`: the toolbar's gap from the board's edges.
  rowElement.style.padding = '0 24px';
  const toolbar = document.createElement('nav');
  toolbar.setAttribute('data-creative-toolbar', '');
  rowElement.append(toolbar);
  document.body.append(rowElement);
  // jsdom lays nothing out: a laid-out toolbar is given a box, a hidden one
  // (`display: none`) reports none, as a browser does.
  const box = bar ?? (row && new DOMRect(row.x + row.width / 2 - 150, row.y, 300, row.height));
  toolbar.getClientRects = () => (box ? [box] : []) as unknown as DOMRectList;
  if (box) toolbar.getBoundingClientRect = () => box;
  if (row) rowElement.getBoundingClientRect = () => row;
}

/** Where the popup's left edge lands, kept inside the window. */
const inWindow = (left: number, width: number) =>
  Math.max(EDGE_PX, Math.min(left, window.innerWidth - width - EDGE_PX));

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

  it('rests the popup just above a laid-out toolbar, centred on it', () => {
    mountToolbar(new DOMRect(100, 700, 800, 44));
    expect(placeAboveBoardToolbar(400)).toEqual({
      top: 'auto',
      right: 'auto',
      bottom: window.innerHeight - 700 + FOOTER_GAP_PX,
      left: inWindow(100 + 400 - 200, 400),
    });
  });

  // On a narrow board the toolbar anchors to the board's left; the popup
  // follows it, lining up with its left edge rather than meeting the agenda.
  it('follows a toolbar on the left of the board, lined up with its left edge', () => {
    mountToolbar(new DOMRect(300, 700, 600, 44), new DOMRect(324, 700, 200, 44));
    expect(placeAboveBoardToolbar(400)?.left).toBe(inWindow(324, 400));

    document.body.innerHTML = '';
    mountToolbar(new DOMRect(300, 700, 600, 44), new DOMRect(500, 700, 200, 44));
    expect(placeAboveBoardToolbar(400)?.left).toBe(inWindow(500 + 100 - 200, 400));
  });

  it('centres on the board when the popup is wider than it', () => {
    mountToolbar(new DOMRect(300, 700, 300, 44), new DOMRect(324, 700, 200, 44));
    expect(placeAboveBoardToolbar(400)?.left).toBe(inWindow(300 + 150 - 200, 400));
  });
});
