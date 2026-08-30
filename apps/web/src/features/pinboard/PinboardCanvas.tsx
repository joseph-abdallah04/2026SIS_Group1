import { useCallback, useRef, useState } from 'react';
import type { BoardResponse } from '@roundtable/shared';

import { ProposalCard } from './ProposalCard';

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1600;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

interface PinboardCanvasProps {
  board: BoardResponse;
}

export function PinboardCanvas({ board }: PinboardCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((z) => {
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 10) / 10));
    });
  }, []);

  const isEmpty = board.items.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pinboard</h1>
          {board.questionText ? (
            <p className="text-sm text-slate-600">{board.questionText}</p>
          ) : (
            <p className="text-sm text-slate-500">No active question</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>{board.items.length} items</span>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))}
          >
            −
          </button>
          <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))}
          >
            +
          </button>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,_#cbd5e1_1px,_transparent_1px)] [background-size:24px_24px]"
        onWheel={onWheel}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: `scale(${zoom})`,
          }}
        >
          {isEmpty ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 px-8 py-6 text-center shadow-sm">
                <p className="text-lg font-medium text-slate-800">No proposals yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Ideas from sticky notes, drawings, and diagrams will appear here.
                </p>
              </div>
            </div>
          ) : (
            board.items.map((item) => (
              <div
                key={item.id}
                className="absolute"
                style={{ left: item.x, top: item.y }}
              >
                <ProposalCard item={item} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
