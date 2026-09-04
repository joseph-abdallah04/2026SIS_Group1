import { useCallback, useState, type ReactNode } from 'react';
import type { BoardResponse } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { EndSessionControl } from '../sessions/EndSessionControl';
import { LeaveSessionControl } from '../sessions/LeaveSessionControl';
import { CreativeToolbar } from '../toolbar/CreativeToolbar';
import { ProposalCard } from './ProposalCard';
import { ZOOM_GRID, ZOOM_LEVELS, type ZoomLevel } from './pinboardTokens';

interface PinboardCanvasProps {
  board: BoardResponse;
  /** True once this client has joined the session room and is receiving events. */
  isLive: boolean;
  /** Proposals that arrived on a live broadcast moments ago (F15). */
  newItemIds: ReadonlySet<string>;
  /**
   * Leaders cannot leave (F07), they end the session (F32) — this header
   * offers whichever of the two applies.
   */
  isLeader: boolean;
  /**
   * F24's agenda rail, rendered beside the board. A node rather than the
   * question list itself: the agenda belongs to the sessions side of the app,
   * and passing it in keeps this component about the board while still owning
   * the header/board/footer split the rail has to sit inside.
   */
  agenda?: ReactNode;
}

function EmptyBoardPlate() {
  return (
    <div
      className="relative w-[400px] overflow-hidden border border-rt-tertiary bg-rt-surface shadow-sm"
      style={{ borderRadius: '16px' }}
    >
      <div className="border-b border-rt-tertiary bg-rt-surface-alt px-3.5 py-2 text-[9px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
        Empty board
      </div>

      <div className="p-5">
        <h2 className="text-[19px] leading-[1.3] font-semibold tracking-[-0.01em] text-rt-ink">
          Nothing proposed yet
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">
          Anything anyone proposes appears here for the whole room, in the same order for everyone.
        </p>

        <div className="mt-[18px] border-t border-rt-tertiary">
          <div className="flex items-center gap-3 border-b border-rt-tertiary py-2.5">
            <div
              className="h-[26px] w-[26px] rounded-md border border-[#F1C881]"
              style={{ background: '#FDF4E5' }}
            />
            <p className="text-[12.5px] font-medium text-rt-ink">
              Sticky note
              <span className="font-normal text-rt-ink-faint"> — a short line of text</span>
            </p>
          </div>
          <div className="flex items-center gap-3 border-b border-rt-tertiary py-2.5">
            <div
              className="h-[26px] w-[26px] rounded-md border border-rt-tertiary bg-white"
              style={{
                background:
                  'repeating-linear-gradient(-45deg, #EEF2F4 0 5px, #FFFFFF 5px 10px)',
              }}
            />
            <p className="text-[12.5px] font-medium text-rt-ink">
              Drawing
              <span className="font-normal text-rt-ink-faint"> — soft border, image thumbnail</span>
            </p>
          </div>
          <div className="flex items-center gap-3 py-2.5">
            <div className="h-[26px] w-[26px] rounded-md border border-rt-tertiary bg-rt-primary-tint" />
            <p className="text-[12.5px] font-medium text-rt-ink">
              Diagram
              <span className="font-normal text-rt-ink-faint"> — soft border, box preview</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-rt-tertiary px-5 py-3">
        <p className="flex-1 text-[11px] text-rt-ink-faint">Toolbar lives at the foot of the board (F22)</p>
        <button
          type="button"
          disabled
          className="rounded-full bg-rt-primary px-[18px] py-[9px] text-[12px] font-semibold text-white opacity-90"
          title="Coming in F22"
        >
          Propose the first idea
        </button>
      </div>
    </div>
  );
}

function ZoomControl({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  zoom: ZoomLevel;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-rt-tertiary bg-white">
      <button
        type="button"
        onClick={onZoomOut}
        className="border-r border-rt-tertiary px-3 py-[7px] text-[11px] font-medium text-rt-ink-muted hover:bg-rt-primary-tint focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
      >
        −
      </button>
      <span className="border-r border-rt-tertiary px-3.5 py-[7px] text-[11px] font-semibold text-rt-ink">
        {zoom}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        className="border-r border-rt-tertiary px-3 py-[7px] text-[11px] font-medium text-rt-ink-muted hover:bg-rt-primary-tint focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
      >
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        className="px-3.5 py-[7px] text-[11px] font-medium text-rt-ink-muted hover:bg-rt-primary-tint focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
      >
        Fit
      </button>
    </div>
  );
}

export function PinboardCanvas({
  board,
  isLive,
  newItemIds,
  isLeader,
  agenda,
}: PinboardCanvasProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const grid = ZOOM_GRID[zoom];
  const isEmpty = board.items.length === 0;

  const onZoomIn = useCallback(() => {
    setZoom((z) => {
      const idx = ZOOM_LEVELS.indexOf(z);
      return ZOOM_LEVELS[Math.max(0, idx - 1)] ?? z;
    });
  }, []);

  const onZoomOut = useCallback(() => {
    setZoom((z) => {
      const idx = ZOOM_LEVELS.indexOf(z);
      return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, idx + 1)] ?? z;
    });
  }, []);

  const onFit = useCallback(() => {
    if (board.items.length > 12) setZoom(40);
    else if (board.items.length > 8) setZoom(60);
    else if (board.items.length > 4) setZoom(80);
    else setZoom(100);
  }, [board.items.length]);

  const dotBackground = `radial-gradient(rgba(140,164,172,${grid.dotOpacity}) ${grid.dotRadius}, transparent ${grid.dotRadius})`;

  const phaseLabel =
    board.questionPosition != null && board.questionStatus
      ? `Q${board.questionPosition + 1} · ${board.questionStatus}`
      : 'Discussion';

  return (
    <div className="flex h-full min-h-0 flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-rt-primary-tint bg-rt-primary px-6 py-3 text-white">
        <RoundTableLogo />
        <div className="flex max-w-[70%] items-center gap-2 rounded-full border border-white/25 bg-white px-3.5 py-1.5 shadow-sm">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-rt-primary-deep uppercase">
            {phaseLabel}
          </span>
          {board.questionText ? (
            <p className="truncate text-[12.5px] text-rt-ink">
              &ldquo;{board.questionText}&rdquo;
            </p>
          ) : (
            <h1 className="truncate text-[12.5px] font-semibold text-rt-ink">{board.sessionTitle}</h1>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="rounded-full border border-rt-primary-tint bg-white px-3 py-1 text-[10.5px] font-semibold text-rt-primary-deep shadow-sm">
            {board.items.length} {board.items.length === 1 ? 'item' : 'items'}
          </span>
          <div
            className="flex items-center gap-[7px] rounded-full border border-rt-primary-tint bg-white px-2.5 py-1 shadow-sm"
            title={
              isLive
                ? 'Connected — new proposals appear here as they are made'
                : 'Not receiving live updates; reconnecting'
            }
          >
            <div
              className={`h-[7px] w-[7px] rounded-full ${isLive ? 'bg-rt-primary' : 'bg-rt-tertiary'}`}
            />
            <span className="text-[10.5px] font-medium text-rt-primary-deep">
              {isLive ? 'live' : 'offline'}
            </span>
          </div>
          {isLeader ? (
            <EndSessionControl sessionId={board.sessionId} className="text-white" />
          ) : (
            <LeaveSessionControl sessionId={board.sessionId} className="text-white" />
          )}
        </div>
      </header>

      {/* The agenda sits beside the board and above the footer, so the toolbar
          and zoom control keep the full width they had. */}
      <div className="flex min-h-0 flex-1">
        {agenda}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-rt-surface">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: dotBackground,
              backgroundSize: `${grid.dotSize} ${grid.dotSize}`,
            }}
          />
          <div className="relative" style={{ padding: grid.padding }}>
            {isEmpty ? (
              <div className="flex min-h-[480px] items-center justify-center">
                <EmptyBoardPlate />
              </div>
            ) : (
              // Flow layout, in the server's order — item.x/item.y are persisted
              // but deliberately not honoured yet. Free positioning arrives with
              // F16 (drag to move); until then every participant sees the same
              // reading order, which is what F14 promises.
              <div className="flex flex-wrap items-start" style={{ gap: grid.gap }}>
                {board.items.map((item) => (
                  <ProposalCard
                    key={item.id}
                    item={item}
                    zoom={zoom}
                    isNew={newItemIds.has(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-rt-tertiary px-6 py-[11px]">
        <CreativeToolbar />
        <div className="ml-auto">
          <ZoomControl zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFit={onFit} />
        </div>
      </footer>
    </div>
  );
}
