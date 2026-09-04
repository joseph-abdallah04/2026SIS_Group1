import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardItem, BoardResponse } from '@roundtable/shared';
import type { ProposalUpdateInput } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { CreativeToolbar } from '../toolbar/CreativeToolbar';
import { BoardScrollbar } from './BoardScrollbar';
import { clearBoardCentre, setBoardCentre } from './boardView';
import { PositionedProposal } from './PositionedProposal';
import { useCanvasPan, type Point } from './useCanvasPan';
import { useProposalDrag } from './useProposalDrag';
import {
  DESK_MARGIN,
  BOARD_SIZE,
  CARD_WIDTH,
  DOT_COLOR,
  DOT_RADIUS,
  DOT_SPACING,
  ZOOM_LEVELS,
  ZOOM_SCALE,
  type ZoomLevel,
} from './pinboardTokens';

/**
 * A card's height in board units, near enough. Heights vary with content and
 * are only known after layout; this is used to frame the board with Fit, where
 * erring large just leaves a little slack at the bottom.
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
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  zoom: ZoomLevel;
  canZoomIn: boolean;
  /** False at the point where the board would stop covering the window. */
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-rt-tertiary bg-white">
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        title={canZoomOut ? 'Zoom out' : 'The whole board is already in view'}
        className="border-r border-rt-tertiary px-3 py-[7px] text-[11px] font-medium text-rt-ink-muted hover:bg-rt-primary-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
      >
        −
      </button>
      <span className="border-r border-rt-tertiary px-3.5 py-[7px] text-[11px] font-semibold text-rt-ink">
        {zoom}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        title="Zoom in"
        className="border-r border-rt-tertiary px-3 py-[7px] text-[11px] font-medium text-rt-ink-muted hover:bg-rt-primary-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent"
      >
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        className="px-3.5 py-[7px] text-[11px] font-medium text-rt-ink-muted hover:bg-rt-primary-tint focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-primary"
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
  const scale = ZOOM_SCALE[zoom];
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

  // The sheet on screen. Fixed in board units, so zooming only ever changes how
  // big it looks — it never grows a board that was already there.
  const contentWidth = BOARD_SIZE.width * scale + DESK_MARGIN * 2;
  const contentHeight = BOARD_SIZE.height * scale + DESK_MARGIN * 2;

  // The hook needs a zoom handler, and the handler needs the hook's pan state.
  // A ref breaks the cycle without handing the hook a dependency that changes
  // on every pan.
  const zoomRef = useRef<(direction: 'in' | 'out', anchor: Point) => void>(() => {});
  const onZoom = useCallback(
    (direction: 'in' | 'out', anchor: Point) => zoomRef.current(direction, anchor),
    [],
  );

  const {
    viewportRef,
    viewport,
    pan,
    panTo,
    isPanning,
    isSpaceHeld,
    maxPanX,
    maxPanY,
    overflowX,
    overflowY,
    panHandlers,
  } = useCanvasPan({ contentWidth, contentHeight, onZoom });

  /**
   * The furthest out the board may be zoomed: the point where it still covers
   * the window.
   *
   * The sheet and the window rarely share an aspect ratio, so "show the whole
   * board" leaves a band of empty desk down whichever pair of sides has the
   * slack — wide bands left and right on a broad monitor. Stopping at cover
   * keeps the desk to the small, equal margin around the edge, and the board
   * always fills the view.
   */
  const minZoom = useMemo(() => {
    if (viewport.width === 0) return 25;
    // The scale at which the board, plus its two margins, still fills the
    // window on both axes.
    const cover = Math.max(
      (viewport.width - DESK_MARGIN * 2) / BOARD_SIZE.width,
      (viewport.height - DESK_MARGIN * 2) / BOARD_SIZE.height,
    );
    // Levels run largest first; the last one that still covers is the smallest.
    return [...ZOOM_LEVELS].reverse().find((level) => ZOOM_SCALE[level] >= cover) ?? 400;
  }, [viewport.height, viewport.width]);

  // A window that grows can leave the current zoom too far out to cover it.
  useEffect(() => {
    setZoom((z) => (ZOOM_SCALE[z] < ZOOM_SCALE[minZoom] ? minZoom : z));
  }, [minZoom]);

  // Centre the sheet whenever it is smaller than the window, so zooming out
  // settles the board in the middle instead of pinning it to a corner.
  const restX = Math.max(0, (viewport.width - contentWidth) / 2);
  const restY = Math.max(0, (viewport.height - contentHeight) / 2);

  /**
   * Change zoom while holding one point of the board still under the cursor.
   *
   * Without this the board appears to slide away as you zoom, because scaling
   * happens about the top-left corner: the further from that corner you were
   * looking, the further your subject travels. Anchoring is what makes zoom
   * feel like moving a magnifier over the board rather than resizing a page.
   */
  const stepZoom = useCallback(
    (direction: 'in' | 'out', anchor: Point) => {
      const idx = ZOOM_LEVELS.indexOf(zoom);
      const floor = ZOOM_LEVELS.indexOf(minZoom);
      const clamped = Math.min(Math.max(direction === 'in' ? idx - 1 : idx + 1, 0), floor);
      const next = ZOOM_LEVELS[clamped];
      if (!next || next === zoom) return;

      // The board point under the anchor is (pan + anchor) / scale. Keeping it
      // under the anchor at the new scale gives the pan below.
      const nextScale = ZOOM_SCALE[next];
      const ratio = nextScale / scale;
      setZoom(next);
      panTo(
        {
          x: (pan.x + anchor.x) * ratio - anchor.x,
          y: (pan.y + anchor.y) * ratio - anchor.y,
        },
        // Against the new scale: the limits from props still describe the old
        // one, and clipping to those would drag the anchor off its point.
        {
          maxX: BOARD_SIZE.width * nextScale + DESK_MARGIN * 2 - viewport.width,
          maxY: BOARD_SIZE.height * nextScale + DESK_MARGIN * 2 - viewport.height,
        },
      );
    },
    [minZoom, pan.x, pan.y, panTo, scale, viewport.height, viewport.width, zoom],
  );

  useEffect(() => {
    zoomRef.current = stepZoom;
  }, [stepZoom]);

  /** The buttons have no cursor to anchor to, so they zoom about the middle. */
  const zoomFromCentre = useCallback(
    (direction: 'in' | 'out') =>
      stepZoom(direction, { x: viewport.width / 2, y: viewport.height / 2 }),
    [stepZoom, viewport.height, viewport.width],
  );

  // Publish the middle of the view so a newly proposed card lands where the
  // viewer is looking rather than at the board's origin. Screen centre back
  // through the pan and the scale gives the board point under it.
  useEffect(() => {
    if (viewport.width === 0) return;
    // Inverse of the scene transform: screen = rest - pan + (padding + board) * scale.
    setBoardCentre({
      x: (viewport.width / 2 - DESK_MARGIN - restX + pan.x) / scale,
      y: (viewport.height / 2 - DESK_MARGIN - restY + pan.y) / scale,
    });
  }, [pan.x, pan.y, restX, restY, scale, viewport.height, viewport.width]);

  useEffect(() => clearBoardCentre, []);

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

  const onZoomIn = useCallback(() => zoomFromCentre('in'), [zoomFromCentre]);
  const onZoomOut = useCallback(() => zoomFromCentre('out'), [zoomFromCentre]);

  // Fit means "show everything that is out there", which since F16 depends on
  // where cards have been dragged, not how many there are.
  /** The cards' bounding box in board units, or null when the board is empty. */
  const contentBounds = useMemo(() => {
    if (board.items.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of board.items) {
      const at = positionOf(item);
      minX = Math.min(minX, at.x);
      minY = Math.min(minY, at.y);
      maxX = Math.max(maxX, at.x + CARD_WIDTH[item.type]);
      maxY = Math.max(maxY, at.y + CARD_FOOTPRINT_H);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [board.items, positionOf]);

  /**
   * Frame the proposals, not the sheet.
   *
   * Fitting the whole board meant zooming out until the cards were specks in a
   * mostly empty page, which is nobody's idea of "fit". This frames what has
   * actually been proposed and centres it, and never magnifies past 100% — a
   * board with two cards on it should not fill the window with them.
   */
  const onFit = useCallback(() => {
    if (viewport.width === 0) return;

    // Nothing proposed yet: sit in the middle of the board rather than in its
    // top-left corner, so the first card lands somewhere with room around it.
    if (!contentBounds) {
      const restingScale = Math.max(ZOOM_SCALE[100], ZOOM_SCALE[minZoom]);
      const level = ZOOM_LEVELS.find((z) => ZOOM_SCALE[z] === restingScale) ?? minZoom;
      setZoom(level);
      const restingWidth = BOARD_SIZE.width * restingScale + DESK_MARGIN * 2;
      const restingHeight = BOARD_SIZE.height * restingScale + DESK_MARGIN * 2;
      panTo(
        {
          x: (restingWidth - viewport.width) / 2,
          y: (restingHeight - viewport.height) / 2,
        },
        {
          maxX: restingWidth - viewport.width,
          maxY: restingHeight - viewport.height,
        },
      );
      return;
    }

    const room = Math.min(
      (viewport.width - DESK_MARGIN * 2) / contentBounds.width,
      (viewport.height - DESK_MARGIN * 2) / contentBounds.height,
    );
    const level =
      ZOOM_LEVELS.find(
        (z) => ZOOM_SCALE[z] <= Math.min(room, 1) && ZOOM_SCALE[z] >= ZOOM_SCALE[minZoom],
      ) ?? minZoom;
    const nextScale = ZOOM_SCALE[level];
    setZoom(level);

    // Put the middle of the content under the middle of the window. `restX`
    // recomputes from the new scale, so it is derived here rather than reused.
    const sheetWidth = BOARD_SIZE.width * nextScale + DESK_MARGIN * 2;
    const sheetHeight = BOARD_SIZE.height * nextScale + DESK_MARGIN * 2;
    const nextRestX = Math.max(0, (viewport.width - sheetWidth) / 2);
    const nextRestY = Math.max(0, (viewport.height - sheetHeight) / 2);
    panTo(
      {
        x:
          nextRestX +
          DESK_MARGIN +
          (contentBounds.minX + contentBounds.width / 2) * nextScale -
          viewport.width / 2,
        y:
          nextRestY +
          DESK_MARGIN +
          (contentBounds.minY + contentBounds.height / 2) * nextScale -
          viewport.height / 2,
      },
      // Clamped against the scale we are moving to, not the one we are leaving.
      { maxX: sheetWidth - viewport.width, maxY: sheetHeight - viewport.height },
    );
  }, [contentBounds, minZoom, panTo, viewport.height, viewport.width]);

  /**
   * Open on the proposals.
   *
   * A board is 4000 units wide and the cards may be anywhere on it, so opening
   * at the origin can show an empty corner of a board that is far from empty.
   * Framing the content once, as soon as the viewport has been measured, means
   * a refresh puts you back where the work is.
   */
  const hasFramedOnOpen = useRef(false);
  useEffect(() => {
    if (hasFramedOnOpen.current || viewport.width === 0) return;
    hasFramedOnOpen.current = true;
    onFit();
  }, [onFit, viewport.width]);

  // Drawn on the sheet, in board units: the scene transform magnifies the grid
  // exactly like everything else, and the dots end where the board ends rather
  // than tiling out over the surrounding desk.
  const dotBackground = `radial-gradient(${DOT_COLOR} ${DOT_RADIUS}px, transparent ${DOT_RADIUS}px)`;

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

      {/*
        A window onto the board, not a scroller: it clips, and the board is
        moved underneath it by a transform. That is what removes the browser's
        scrollbars rather than trying to style them, and it lets the dots be
        tiled across the whole window and simply offset by the pan, so they run
        on in every direction instead of stopping where the cards do.
      */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-rt-surface-alt"
        style={{
          // Only promise a grab when one is actually on offer. Showing `grab`
          // everywhere implied the whole board could be dragged, including over
          // cards, where a left drag moves the card instead.
          cursor: isPanning ? 'grabbing' : isSpaceHeld ? 'grab' : 'default',
          touchAction: 'none',
        }}
        {...panHandlers}
      >
        {isEmpty ? (
          // Nothing to pan over, so the plate sits in the window rather than on
          // the board.
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyBoardPlate />
          </div>
        ) : (
          <div
            className="absolute top-0 left-0"
            style={{
              // The single place zoom is applied. Everything inside is laid out
              // at its natural size and magnified as one scene, so a card never
              // reflows or changes shape as you zoom — it just gets bigger.
              // Pan is in screen pixels, so it is applied before the scale, and
              // rounded because a fractional offset renders text softly.
              // The margin is added outside the scale, so the desk stays the
              // same width on screen however far the board is magnified.
              transform: `translate(${Math.round(DESK_MARGIN + restX - pan.x)}px, ${Math.round(DESK_MARGIN + restY - pan.y)}px) scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            {/*
              The sheet. One fixed size in board units, so it is the same board
              at every zoom — cards are clamped inside it and nothing can be
              dragged off its edge. x/y are where a card actually sits, in a
              coordinate space every participant shares.
            */}
            <div
              className="relative rounded-lg bg-rt-surface"
              style={{
                width: BOARD_SIZE.width,
                height: BOARD_SIZE.height,
                backgroundImage: dotBackground,
                backgroundSize: `${DOT_SPACING}px ${DOT_SPACING}px`,
                boxShadow: '0 0 0 1px rgba(140,164,172,0.35)',
              }}
            >
              {board.items.map((item) => (
                <PositionedProposal
                  key={item.id}
                  item={item}
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
          </div>
        )}

        {/*
          Only past 100%: below that the whole board is on screen or a pan away,
          and bars are furniture. Magnified, the board really does continue past
          the window and needs saying so. Both axes are shown together, since a
          board that runs off one edge almost always runs off the other.
        */}
        <BoardScrollbar
          orientation="horizontal"
          enabled={zoom > 100}
          viewportLength={viewport.width}
          contentLength={contentWidth}
          pan={pan.x}
          maxPan={maxPanX}
          overflow={overflowX}
          isPanning={isPanning}
          onPan={(x) => panTo({ x, y: pan.y })}
        />
        <BoardScrollbar
          orientation="vertical"
          enabled={zoom > 100}
          viewportLength={viewport.height}
          contentLength={contentHeight}
          pan={pan.y}
          maxPan={maxPanY}
          overflow={overflowY}
          isPanning={isPanning}
          onPan={(y) => panTo({ x: pan.x, y })}
        />
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-rt-tertiary px-6 py-[11px]">
        <CreativeToolbar />
        {writeError ? (
          <p role="status" className="text-[11px] font-medium text-rt-secondary-deep">
            {writeError}
          </p>
        ) : null}
        <div className="ml-auto">
          <ZoomControl
            zoom={zoom}
            canZoomIn={zoom !== ZOOM_LEVELS[0]}
            canZoomOut={zoom !== minZoom}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onFit={onFit}
          />
        </div>
      </footer>
    </div>
  );
}
