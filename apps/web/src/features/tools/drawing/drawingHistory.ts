import type { DrawingStroke } from './drawingModel';

export interface DrawingHistory {
  past: DrawingStroke[][];
  present: DrawingStroke[];
  future: DrawingStroke[][];
}

export type DrawingHistoryAction =
  | { type: 'commit'; strokes: DrawingStroke[] }
  | { type: 'preview'; strokes: DrawingStroke[] }
  | { type: 'record-preview'; previous: DrawingStroke[] }
  | { type: 'undo' }
  | { type: 'redo' };

export function createDrawingHistory(strokes: DrawingStroke[] = []): DrawingHistory {
  return { past: [], present: strokes, future: [] };
}

function hasSameStrokes(
  first: readonly DrawingStroke[],
  second: readonly DrawingStroke[],
): boolean {
  return first.length === second.length && first.every((stroke, index) => stroke === second[index]);
}

export function drawingHistoryReducer(
  state: DrawingHistory,
  action: DrawingHistoryAction,
): DrawingHistory {
  switch (action.type) {
    case 'commit':
      if (hasSameStrokes(state.present, action.strokes)) return state;
      return {
        past: [...state.past, state.present],
        present: action.strokes,
        future: [],
      };
    case 'preview':
      return { ...state, present: action.strokes };
    case 'record-preview':
      if (hasSameStrokes(action.previous, state.present)) return state;
      return {
        past: [...state.past, action.previous],
        present: state.present,
        future: [],
      };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
  }
}
