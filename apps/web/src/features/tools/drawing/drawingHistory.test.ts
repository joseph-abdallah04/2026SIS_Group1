import { describe, expect, it } from 'vitest';

import { createDrawingHistory, drawingHistoryReducer } from './drawingHistory';
import type { DrawingStroke } from './drawingModel';

const firstStroke: DrawingStroke = {
  id: 'stroke-1',
  ink: 'ink',
  width: 4,
  points: [
    { x: 10, y: 10 },
    { x: 20, y: 20 },
  ],
};

const secondStroke: DrawingStroke = {
  ...firstStroke,
  id: 'stroke-2',
  ink: 'ocean',
};

describe('drawingHistoryReducer', () => {
  it('undoes and redoes a committed stroke', () => {
    const initial = createDrawingHistory();
    const drawn = drawingHistoryReducer(initial, { type: 'commit', strokes: [firstStroke] });
    const undone = drawingHistoryReducer(drawn, { type: 'undo' });
    const redone = drawingHistoryReducer(undone, { type: 'redo' });

    expect(undone.present).toEqual([]);
    expect(redone.present).toEqual([firstStroke]);
  });

  it('clears the redo branch after a new edit', () => {
    const withTwo = drawingHistoryReducer(
      drawingHistoryReducer(createDrawingHistory(), {
        type: 'commit',
        strokes: [firstStroke],
      }),
      { type: 'commit', strokes: [firstStroke, secondStroke] },
    );
    const undone = drawingHistoryReducer(withTwo, { type: 'undo' });
    const branched = drawingHistoryReducer(undone, { type: 'commit', strokes: [] });

    expect(branched.future).toEqual([]);
  });

  it('records an entire eraser preview as one undo step', () => {
    const initial = createDrawingHistory([firstStroke, secondStroke]);
    const preview = drawingHistoryReducer(initial, {
      type: 'preview',
      strokes: [],
    });
    const recorded = drawingHistoryReducer(preview, {
      type: 'record-preview',
      previous: initial.present,
    });
    const undone = drawingHistoryReducer(recorded, { type: 'undo' });

    expect(recorded.past).toHaveLength(1);
    expect(undone.present).toEqual([firstStroke, secondStroke]);
  });

  it('does not create history for an eraser gesture that hits nothing', () => {
    const initial = createDrawingHistory([firstStroke]);
    const preview = drawingHistoryReducer(initial, {
      type: 'preview',
      strokes: [...initial.present],
    });
    const recorded = drawingHistoryReducer(preview, {
      type: 'record-preview',
      previous: initial.present,
    });

    expect(recorded.past).toEqual([]);
  });
});
