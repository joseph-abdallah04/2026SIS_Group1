import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardItem, BoardResponse } from '@roundtable/shared';
import type { ProposalUpdateInput } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { CreativeToolbar } from '../toolbar/CreativeToolbar';
import { PositionedProposal } from './PositionedProposal';
import { useProposalDrag } from './useProposalDrag';
import { CARD_WIDTH, ZOOM_GRID, ZOOM_LEVELS, type ZoomLevel } from './pinboardTokens';

/**
 * Board units reserved below a card when measuring how far the board extends.
 * Card heights vary with their content and are only known after layout; this
 * decides scroll extents and the Fit zoom, where erring large simply means a
 * little slack at the bottom.
 */
const CARD_FOOTPRINT_H = 260;

interface PinboardCanvasProps {
  board: BoardResponse;
  /** True once this client has joined the session room and is receiving events. */
  isLive: boolean;
  /** Proposals that arrived on a live broadcast moments ago (F15). */
  newItemIds: ReadonlySet<string>;
  /**
   * Who the server believes this client is, or null before the join snapshot.
   * Author-only affordances key off this; the server re-checks regardless (F16).
   */
  viewerId: string | null;
  editProposal: (input: ProposalUpdateInput) => Promise<void>;
  deleteProposal: (proposalId: string) => Promise<void>;
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
                background: 'repeating-linear-gradient(-45deg, #EEF2F4 0 5px, #FFFFFF 5px 10px)',
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
        <p className="flex-1 text-[11px] text-rt-ink-faint">
          Toolbar lives at the foot of the board (F22)
        </p>
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
  viewerId,
  editProposal,
  deleteProposal,
}: PinboardCanvasProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  const [writeError, setWriteError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const grid = ZOOM_GRID[zoom];
  const scale = grid.scale;
  const isEmpty = board.items.length === 0;
  // Leadership is per-session and decided by the server; this only decides
  // what the UI offers, and every write is re-checked server-side regardless.
  const isLeader = viewerId !== null && viewerId === board.leaderId;

  // A rejected write is the one thing the board cannot show by itself: the card
  // simply stays where it was, which on its own looks like nothing happened.
  useEffect(() => {
    if (!writeError) return;
    const timer = setTimeout(() => setWriteError(null), 5000);
    return () => clearTimeout(timer);
  }, [writeError]);

  const { positionOf, draggingId, dragHandlers } = useProposalDrag({
    items: board.items,
    scale,
    onCommit: (proposalId, at) => editProposal({ id: proposalId, x: at.x, y: at.y }),
    onError: setWriteError,
  });

  // How far the board reaches, in board units — drives both the scroll area and
  // Fit. Recomputed mid-drag so the surface grows as a card is pulled outward.
  const extent = useMemo(() => {
    let width = 0;
    let height = 0;
    for (const item of board.items) {
      const at = positionOf(item);
      width = Math.max(width, at.x + CARD_WIDTH[item.type]);
      height = Math.max(height, at.y + CARD_FOOTPRINT_H);
    }
    return { width, height };
  }, [board.items, positionOf]);

  const onEditText = useCallback(
    async (item: BoardItem, text: string) => {
      if (item.artifactJson.type !== 'sticky') return;
      try {
        await editProposal({ id: item.id, artifactJson: { ...item.artifactJson, text } });
      } catch (err) {
        setWriteError(err instanceof Error ? err.message : 'Could not save that edit');
      }
    },
    [editProposal],
  );

  const onDelete = useCallback(
    async (item: BoardItem) => {
      try {
        await deleteProposal(item.id);
      } catch (err) {
        setWriteError(err instanceof Error ? err.message : 'Could not remove that proposal');
      }
    },
    [deleteProposal],
  );

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

  // Fit means "show everything that is out there", which since F16 depends on
  // where cards have been dragged, not how many there are.
  const onFit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || extent.width === 0 || extent.height === 0) {
      setZoom(100);
      return;
    }
    const padding = parseInt(grid.padding, 10) * 2;
    const room = Math.min(
      (viewport.clientWidth - padding) / extent.width,
      (viewport.clientHeight - padding) / extent.height,
    );
    // Levels run largest first, so the first that fits is the closest zoom in.
    setZoom(ZOOM_LEVELS.find((level) => ZOOM_GRID[level].scale <= room) ?? 40);
  }, [extent, grid.padding]);

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
            <p className="truncate text-[12.5px] text-rt-ink">&ldquo;{board.questionText}&rdquo;</p>
          ) : (
            <h1 className="truncate text-[12.5px] font-semibold text-rt-ink">
              {board.sessionTitle}
            </h1>
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
                ? 'Connected: new proposals appear here as they are made'
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
        </div>
      </header>

      <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto bg-rt-surface">
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
            // x/y are where a card actually sits, and the board is one shared
            // coordinate space: a card dragged here is in that spot for
            // everyone. The surface is sized to its contents so dragging
            // outward extends the scroll area rather than clipping the card.
            <div
              className="relative"
              style={{
                width: extent.width * scale,
                height: extent.height * scale,
                minWidth: '100%',
                minHeight: 420,
              }}
            >
              {board.items.map((item) => (
                <PositionedProposal
                  key={item.id}
                  item={item}
                  zoom={zoom}
                  scale={scale}
                  position={positionOf(item)}
                  isNew={newItemIds.has(item.id)}
                  isOwn={viewerId !== null && item.authorId === viewerId}
                  canMove={(viewerId !== null && item.authorId === viewerId) || isLeader}
                  canDelete={(viewerId !== null && item.authorId === viewerId) || isLeader}
                  isDragging={draggingId === item.id}
                  dragHandlers={dragHandlers}
                  onEditText={onEditText}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-rt-tertiary px-6 py-[11px]">
        <CreativeToolbar />
        {writeError ? (
          <p role="status" className="text-[11px] font-medium text-rt-secondary-deep">
            {writeError}
          </p>
        ) : null}
        <div className="ml-auto">
          <ZoomControl zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFit={onFit} />
        </div>
      </footer>
    </div>
  );
}
