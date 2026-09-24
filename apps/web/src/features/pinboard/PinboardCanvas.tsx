import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BoardItem, BoardResponse, QuestionStatus } from '@roundtable/shared';
import type { ProposalArrangeInput, ProposalUpdateInput } from '@roundtable/shared/schemas';
import { ImagePlus, Scan } from 'lucide-react';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { copyText } from '../../lib/copyText';
import { EndSessionControl } from '../sessions/EndSessionControl';
import { LeaveSessionControl } from '../sessions/LeaveSessionControl';
import { useCreativeTools } from '../tools/CreativeToolsContext';
import { useImageImport } from '../tools/image/ImageImportProvider';
import { isImageFile } from '../tools/image/imageEncoding';
import { stickyPlainText } from '../tools/sticky/stickyMarks';
import { CreativeToolbar, FLOATING_BAR, TOOL_LABEL } from '../toolbar/CreativeToolbar';
import { BoardScrollbar } from './BoardScrollbar';
import { cardWidth } from './cardMetrics';
import { clearBoardCentre, setBoardCentre } from './boardView';
import { FirstProposalHint } from './FirstProposalHint';
import { PositionedProposal } from './PositionedProposal';
import { useCanvasPan, type Point } from './useCanvasPan';
import { useProposalDrag } from './useProposalDrag';
import {
  DESK_MARGIN,
  BOARD_SIZE,
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
   * Leaders cannot leave (F07), they end the session (F32) — this header
   * offers whichever of the two applies. It also decides who may moderate
   * anyone's card (F17), which `PositionedProposal` enforces per proposal.
   */
  isLeader: boolean;
  /**
   * F24's agenda rail, rendered beside the board. A node rather than the
   * question list itself: the agenda belongs to the sessions side of the app,
   * and passing it in keeps this component about the board while still owning
   * the header/board split the rail has to sit inside.
   */
  agenda?: ReactNode;
  /**
   * F38's way to put one of your earlier proposals on the board, rendered in
   * the floating toolbar beside the creative tools. A node for the same reason
   * `agenda` is: what goes in it is fetched and wired by the page, and this
   * component stays the thing that lays a board out.
   */
  myProposals?: ReactNode;
  /**
   * F12's mute toggle, for the header. A node for the same reason `agenda` is:
   * the board does not know what a LiveKit room is, and should not start
   * knowing in order to give voice somewhere prominent to sit.
   */
  micControl?: ReactNode;
  /**
   * F13's roster, centred in the header. A node for the same reason `agenda`
   * is: the board owns where things sit, but not what a LiveKit roster is.
   *
   * It was a rail on the right until F13.2, when the assistant's corner bubble
   * and chat panel turned out to cover that side permanently.
   */
  participants?: ReactNode;
  /**
   * The live join code, in the header under the item count and live dot. It
   * followed the roster out of the retired right rail, then came up from the
   * retired footer, and is shown in every phase because inviting someone is
   * worth doing in any of them.
   */
  joinCode?: ReactNode;
  /**
   * Who the server believes this client is, or null before the join snapshot.
   * Author-only affordances key off this; the server re-checks regardless (F16).
   */
  viewerId: string | null;
  editProposal: (input: ProposalUpdateInput) => Promise<void>;
  /** Bring to front / send to back. Leader only; the server re-checks. */
  arrangeProposal: (proposalId: string, to: ProposalArrangeInput['to']) => Promise<void>;
  deleteProposal: (proposalId: string) => Promise<void>;
  reactToProposal: (proposalId: string, emoji: string) => Promise<void>;
  /** Ids currently on the F27 shortlist — rings on those cards. */
  shortlist: string[];
  /** Leader, voting phase, round not yet locked — checkboxes on cards. */
  canToggleShortlist: boolean;
  onToggleShortlist: (id: string) => void;
  /** F27 header chrome (count / “leader is selecting”). */
  shortlistControl?: ReactNode;
  /** Leader shortlist prompt. Takes the floating toolbar's place while the board is closed. */
  boardOverlay?: ReactNode;
  /** F28 ballot — covers the board + rails until the leader ends the vote. */
  ballot?: ReactNode;
  /** Discussion clock. Hidden by the parent once the ballot overlay is up. */
  headerTimer?: ReactNode;
  /** Last card the viewer interacted with, so the assistant can resolve "this one". */
  onSelectProposal?: (id: string) => void;
}

const PHASE_LABELS: Record<QuestionStatus, string> = {
  // "Up next" rather than "Pending": the board is showing the question the
  // leader has not opened yet, and it stays closed to proposals until they do.
  pending: 'Up next',
  discussion: 'Discussing',
  voting: 'Voting',
  answered: 'Answered',
  skipped: 'Skipped',
};

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
  // Round buttons inside the pill rather than cells split by rules: it is the
  // same shape as the creative toolbar, so the two read as one set of controls
  // rather than a toolbar and a stray widget.
  const button =
    'flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-rt-ink-muted';

  return (
    <nav aria-label="Board navigation" className={FLOATING_BAR}>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        title={canZoomOut ? 'Zoom out' : 'The whole board is already in view'}
        className={button}
      >
        −
      </button>
      {/* `sr-only` rather than `hidden` on a narrow board: the number goes from
          the screen, not from the accessibility tree. */}
      <span className="min-w-13 text-center text-[11px] font-semibold text-rt-ink tabular-nums @max-[36rem]/board:sr-only">
        {zoom}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        title="Zoom in"
        className={button}
      >
        +
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-rt-tertiary" />
      <button
        type="button"
        onClick={onFit}
        aria-label="Fit"
        title="Fit the board to the proposals"
        className={button}
      >
        <span className={TOOL_LABEL}>Fit</span>
        <Scan
          aria-hidden="true"
          size={16}
          strokeWidth={1.8}
          className="hidden @max-[36rem]/board:block"
        />
      </button>
    </nav>
  );
}

export function PinboardCanvas({
  board,
  isLive,
  newItemIds,
  isLeader,
  agenda,
  myProposals,
  micControl,
  participants,
  joinCode,
  viewerId,
  editProposal,
  arrangeProposal,
  deleteProposal,
  reactToProposal,
  shortlist,
  canToggleShortlist,
  onToggleShortlist,
  shortlistControl,
  boardOverlay,
  ballot,
  headerTimer,
  onSelectProposal,
}: PinboardCanvasProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(100);
  // A message for the pill over the toolbar. The id makes the same words said
  // twice two notices, so a second copy restarts the timer rather than
  // vanishing on the first one's schedule.
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const showNotice = useCallback(
    (text: string) => setNotice((current) => ({ text, id: (current?.id ?? 0) + 1 })),
    [],
  );
  const scale = ZOOM_SCALE[zoom];

  /**
   * One more render once the page's fonts have arrived. A sticky's size is
   * measured by laying its note out, and a board that rendered while Inter was
   * still loading measured every note in the fallback face, which wraps
   * differently. Those measurements are not kept, so this render redoes them in
   * the real one.
   */
  const [fontsSettled, setFontsSettled] = useState(false);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFontsSettled(true);
    });
    return () => {
      live = false;
    };
  }, []);
  // `isLeader` arrives as a prop rather than being derived from
  // `viewerId === board.leaderId` here: the header needs it to choose between
  // "Leave session" and "End session" from the first render, and `viewerId` is
  // null until the join snapshot lands, which would briefly offer the leader
  // the wrong exit. Either way it only decides what the UI offers — every
  // write is re-checked server-side.

  const { activeTool, openEditorForEdit, openEditorForExtend, submissionStatus } =
    useCreativeTools();
  // Opening a tool waits while a proposal is on its way, so the menu offers
  // nothing that would open one — the same way the toolbar goes dim.
  const toolsFree = submissionStatus !== 'submitting';
  const boardOpen = board.questionStatus === 'discussion';

  /**
   * Whether a proposal can be reopened in the tool that made it.
   *
   * It depends on whether the artifact still holds what the editor works on. A
   * sticky and a diagram always do: a note's words and formatting, and a
   * diagram's nodes and edges, are the artifact. A drawing does
   * only if its strokes were stored — ones proposed before that kept just the
   * rendered SVG, and reopening those would mean starting from a blank canvas
   * and replacing the artwork instead of changing it.
   */
  const canReopen = useCallback(
    (item: BoardItem) =>
      item.artifactJson.type === 'sticky' ||
      item.artifactJson.type === 'diagram' ||
      (item.artifactJson.type === 'drawing' && (item.artifactJson.strokes?.length ?? 0) > 0),
    [],
  );

  // A rejected write is the one thing the board cannot show by itself: the card
  // simply stays where it was, which on its own looks like nothing happened.
  // Copying a note has the same problem, so its confirmation shares the pill.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const { positionOf, draggingId, dragHandlers } = useProposalDrag({
    items: board.items,
    scale,
    onCommit: (proposalId, at) => editProposal({ id: proposalId, x: at.x, y: at.y }),
    onError: showNotice,
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
  } = useCanvasPan({
    contentWidth,
    contentHeight,
    onZoom,
    // The ballot takes the board's place while people vote. With no board on
    // screen there is nothing for a zoom to zoom, so the gesture is the
    // browser's again.
    zoomEnabled: !ballot,
  });

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
   *
   * A press moves exactly one stop. The ladder is fine enough that this is the
   * smoothest zoom available without inventing scales between its rungs, which
   * is the point of having laid it out that closely.
   */
  const stepZoom = useCallback(
    (direction: 'in' | 'out', anchor: Point) => {
      const idx = ZOOM_LEVELS.indexOf(zoom);
      const floor = ZOOM_LEVELS.indexOf(minZoom);
      // Levels descend, so walking towards index 0 magnifies.
      const step = direction === 'in' ? idx - 1 : idx + 1;
      const clamped = Math.min(Math.max(step, 0), floor);
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

  // Both of these report the refusal *and* rethrow. The board shows why a
  // write failed, but only the card knows it is holding an editor open or a
  // confirmation waiting on that promise, and swallowing the rejection here
  // would leave either of them stuck mid-action with nothing to release them.
  const onDelete = useCallback(
    async (item: BoardItem) => {
      try {
        await deleteProposal(item.id);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Could not remove that proposal');
        throw err;
      }
    },
    [deleteProposal],
  );

  /**
   * Toggle a reaction (F18).
   *
   * Unlike the two above this one settles rather than rethrows: the chip
   * releases itself when the promise finishes either way, and a rejection
   * nobody is waiting on would surface as an unhandled one.
   */
  const onReact = useCallback(
    async (item: BoardItem, emoji: string) => {
      try {
        await reactToProposal(item.id, emoji);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Could not save that reaction');
      }
    },
    [reactToProposal],
  );

  /**
   * Restack a card. Settles rather than rethrows, like `onReact`: the menu has
   * already closed, so nothing is waiting on the promise to release itself.
   */
  const onArrange = useCallback(
    (item: BoardItem, to: ProposalArrangeInput['to']) => {
      void arrangeProposal(item.id, to).catch((err: unknown) => {
        showNotice(err instanceof Error ? err.message : 'Could not restack that proposal');
      });
    },
    [arrangeProposal],
  );

  /**
   * Copy a sticky's words. Said out loud either way: a clipboard write has no
   * visible result of its own, so without the note it looks like nothing
   * happened.
   */
  const onCopyText = useCallback(
    (item: BoardItem) => {
      if (item.artifactJson.type !== 'sticky') return;
      // As the note reads, lists and all, and through the shared helper, whose
      // fallback still copies where the async clipboard is missing: any page
      // served over plain http, such as the board opened by address on a LAN.
      void copyText(stickyPlainText(item.artifactJson)).then((copied) =>
        showNotice(copied ? 'Copied to clipboard' : 'Could not copy that text'),
      );
    },
    [showNotice],
  );

  /**
   * Where each card sits in the shared stack, 0 at the bottom.
   *
   * By `z`, then creation order for equal values, which is how every card
   * painted before stacking was stored. A rank rather than the raw value keeps
   * the numbers the page sees small and dense, whatever the server's have grown
   * to after a session of restacking.
   */
  const stackIndexById = useMemo(() => {
    const stacked = [...board.items].sort(
      (a, b) =>
        a.z - b.z ||
        (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return new Map(stacked.map((item, index) => [item.id, index]));
  }, [board.items]);

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
      maxX = Math.max(maxX, at.x + cardWidth(item));
      maxY = Math.max(maxY, at.y + CARD_FOOTPRINT_H);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
    // `fontsSettled` is not read here, but a sticky's width is measured in the
    // page's font: bounds worked out before Inter arrived used the fallback
    // face, and Fit would frame those widths until something else moved.
  }, [board.items, positionOf, fontsSettled]);

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

  // Human wording, not the raw enum: "Q2 · pending" reads as a bug, and the
  // difference between the phases is the difference between the board taking
  // proposals and not (F25).
  const phaseLabel =
    board.questionPosition != null && board.questionStatus
      ? `Q${board.questionPosition + 1} · ${PHASE_LABELS[board.questionStatus]}`
      : // No active question at all: every question has been answered or
        // skipped, so the agenda is done and the leader's move is to end it.
        'Agenda complete';

  const closedMessage =
    board.questionStatus === 'voting'
      ? 'Proposals are locked while this question is in voting'
      : 'This question is closed to new proposals';

  /**
   * A picture dragged in from the desktop, dropped where it should go.
   *
   * Every drag of files over the board is taken, whether or not it can land:
   * left to the browser, a missed drop opens the file in the tab and throws the
   * whole session away. So a drop that cannot land says why instead.
   *
   * `dragDepth` counts enters against leaves, because the drag passes over the
   * cards and each one it crosses is an enter of its own; the overlay goes
   * only when the count is back to nothing.
   */
  const imageImport = useImageImport();
  const canDropImage = boardOpen && (imageImport?.canImport ?? false);
  const [droppingFiles, setDroppingFiles] = useState(false);
  const dragDepth = useRef(0);
  const carriesFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes('Files');
  const dropHandlers = imageImport
    ? {
        onDragEnter: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDroppingFiles(true);
        },
        onDragOver: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = canDropImage ? 'copy' : 'none';
        },
        onDragLeave: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDroppingFiles(false);
        },
        onDrop: (event: React.DragEvent) => {
          if (!carriesFiles(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDroppingFiles(false);
          if (!canDropImage) {
            showNotice(boardOpen ? 'Wait a moment, then drop it again' : closedMessage);
            return;
          }
          const file = Array.from(event.dataTransfer.files).find(isImageFile);
          if (!file) {
            showNotice('Only images can be added to the board');
            return;
          }
          // The board point under the pointer: the scene transform, undone.
          const frame = viewportRef.current?.getBoundingClientRect();
          imageImport.importFile(
            file,
            frame
              ? {
                  x: (event.clientX - frame.left - DESK_MARGIN - restX + pan.x) / scale,
                  y: (event.clientY - frame.top - DESK_MARGIN - restY + pan.y) / scale,
                }
              : undefined,
          );
        },
      }
    : {};

  return (
    <div className="flex h-full min-h-0 flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-rt-secondary/40 bg-rt-secondary-wash px-6 py-3 text-rt-ink">
        <RoundTableLogo />
        {/* `min-w-0` so the truncating child below can actually give way. The
            cap dropped from 70% when the roster took the centre: at 70% this
            pill could run all the way to where the action group starts,
            leaving the middle nothing. The agenda rail carries the same
            question text untruncated, so shortening it here costs a duplicate. */}
        <div className="flex max-w-[46%] min-w-0 items-center gap-2 rounded-full border border-rt-secondary/25 bg-white px-3.5 py-1.5 shadow-sm">
          <span className="text-[10px] font-semibold tracking-[0.08em] text-rt-secondary-deep uppercase">
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
        {headerTimer}

        {/* Two spacers, not `ml-auto` on the group: they centre the roster
            against the header while there is slack and collapse evenly when
            there is not, so it never drifts with the question's length. */}
        <div className="min-w-0 flex-1" />
        {participants}
        <div className="min-w-0 flex-1" />

        {/* `shrink-0`: none of these pills truncate, so left shrinkable they
            compress to min-content and wrap their labels onto a second line,
            which makes the whole header taller. Pinned, they hold their size
            and the question pill above is the only thing that gives — which is
            what its `min-w-0` and `max-w` are for. There is no `flex-wrap`
            here, so past the point where even a truncated pill will not fit
            the row overflows rather than reflowing. */}
        <div className="flex shrink-0 items-center gap-2.5">
          {shortlistControl}
          {micControl}
          {/* Two short rows in the height one pill used to take: the count
              and the live dot above, the join code below. The join code came
              up from the retired footer, and stacking it here rather than
              adding it to the row keeps the header neither taller nor wider.
              `items-end` lines both rows up against the exit button. */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <span className="flex h-4.5 items-center rounded-full border border-rt-secondary/25 bg-white px-2.5 text-[10px] font-semibold text-rt-secondary-deep shadow-sm">
                {board.items.length} {board.items.length === 1 ? 'item' : 'items'}
              </span>
              <div
                className="flex h-4.5 items-center gap-1.5 rounded-full border border-rt-secondary/25 bg-white px-2 shadow-sm"
                title={
                  isLive
                    ? 'Connected: new proposals appear here as they are made'
                    : 'Not receiving live updates; reconnecting'
                }
              >
                <div
                  className={`size-1.5 rounded-full ${isLive ? 'bg-rt-cool' : 'bg-rt-tertiary'}`}
                />
                <span className="text-[10px] font-medium text-rt-secondary-deep">
                  {isLive ? 'live' : 'offline'}
                </span>
              </div>
            </div>
            {joinCode}
          </div>
          {isLeader ? (
            <EndSessionControl sessionId={board.sessionId} />
          ) : (
            <LeaveSessionControl sessionId={board.sessionId} />
          )}
        </div>
      </header>

      {/* Everything under the header. There is no footer: the agenda runs to
          the bottom of the screen, and the toolbars float over the board
          instead of taking a strip of it. F13's roster used to dock opposite
          the agenda; it lives in the header now, and the board has that 256px
          back. */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {agenda}

        {/* The board and what floats over it. A box of its own so the main
            toolbar centres on the board rather than the page, moving with the
            agenda as it collapses, and so the floating bars are the viewport's
            siblings: inside it, a press or a wheel on a toolbar would reach the
            pan handlers too. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {/*
        A window onto the board, not a scroller: it clips, and the board is
        moved underneath it by a transform. That is what removes the browser's
        scrollbars rather than trying to style them, and it lets the dots be
        tiled across the whole window and simply offset by the pan, so they run
        on in every direction instead of stopping where the cards do.
      */}
          <div
            ref={viewportRef}
            // Marked so a minimised studio can sit at the bottom of the board
            // itself, beside the agenda rather than across it.
            data-board-frame
            className="relative h-full min-h-0 min-w-0 overflow-hidden bg-rt-surface-alt"
            style={{
              // Only promise a grab when one is actually on offer. Showing `grab`
              // everywhere implied the whole board could be dragged, including over
              // cards, where a left drag moves the card instead.
              cursor: isPanning ? 'grabbing' : isSpaceHeld ? 'grab' : 'default',
              touchAction: 'none',
            }}
            {...panHandlers}
            {...dropHandlers}
          >
            {/* Drawn empty or not: an empty board is still the board, and Fit
                has already put its middle in the window. */}
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
                className="relative rounded-2xl bg-rt-surface"
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
                    isAuthorLeader={item.authorId != null && item.authorId === board.leaderId}
                    boardOpen={boardOpen}
                    onOpenEditor={
                      boardOpen && toolsFree && canReopen(item) ? openEditorForEdit : undefined
                    }
                    // Anyone may build on any card, their own included, as
                    // long as its editor has something to open — the same
                    // rule as Edit.
                    onExtend={
                      boardOpen && toolsFree && canReopen(item) ? openEditorForExtend : undefined
                    }
                    canMove={
                      boardOpen && ((viewerId !== null && item.authorId === viewerId) || isLeader)
                    }
                    canDelete={
                      boardOpen && ((viewerId !== null && item.authorId === viewerId) || isLeader)
                    }
                    canArrange={boardOpen && isLeader}
                    stackIndex={stackIndexById.get(item.id) ?? 0}
                    stackSize={board.items.length}
                    isDragging={draggingId === item.id}
                    dragHandlers={dragHandlers}
                    onDelete={onDelete}
                    onArrange={onArrange}
                    onCopyText={onCopyText}
                    viewerId={viewerId}
                    onReact={boardOpen ? onReact : undefined}
                    isShortlisted={shortlist.includes(item.id)}
                    canToggleShortlist={canToggleShortlist}
                    onToggleShortlist={onToggleShortlist}
                    onSelectProposal={onSelectProposal}
                  />
                ))}
              </div>
            </div>

            {/* A file held over the board: where it will land, or why it will
                not. Transparent to the pointer, so the drag goes on reaching
                the board underneath and the drop lands on it. */}
            {droppingFiles ? (
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed ${
                  canDropImage
                    ? 'border-rt-secondary bg-rt-secondary/10'
                    : 'border-rt-tertiary bg-rt-ink/5'
                }`}
              >
                <span
                  className={`${FLOATING_BAR} gap-2 px-4 text-[13px] font-semibold ${
                    canDropImage ? 'text-rt-ink' : 'text-rt-ink-muted'
                  }`}
                >
                  <ImagePlus aria-hidden="true" size={17} strokeWidth={1.8} />
                  {canDropImage ? 'Drop to add the image here' : closedMessage}
                </span>
              </div>
            ) : null}

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

          {/* Everything that floats over the board. `z-20` keeps the ballot's
            scrim (z-30) on top, and the layer lets presses through to the
            board; only what is drawn in it takes them.

            It is also the `board` container the bars size themselves against,
            so their stages follow the board's width rather than the window's
            (the agenda rail alone moves it by 212px). The container is this
            layer and not the box above because `container-type` makes its
            element the containing block for anything `fixed` inside, and
            nothing on the board should be caught by that. */}
          <div className="@container/board pointer-events-none absolute inset-0 z-20">
            {/* A refused write, stacked above the toolbar. It stays centred
                  when the bar shifts, because at this height it is already
                  clear of the zoom control and the assistant orb. `bottom-19`
                  is the bar's `bottom-6` plus its `h-11` plus an 8px gap. */}
            <div className="absolute inset-x-0 bottom-19 flex flex-col items-center gap-2 px-4">
              {notice ? (
                <p
                  role="status"
                  className="pointer-events-auto rounded-full border border-rt-secondary/40 bg-white px-3.5 py-1.5 text-[11.5px] font-medium text-rt-secondary-deep shadow-sm"
                >
                  {notice.text}
                </p>
              ) : null}
            </div>

            {/* The main toolbar. Centred on the board until it would run
                  into the zoom control on the left, then anchored right: the
                  centred bar (~375px) meets the zoom control (~181px, 24px in
                  from the edge, 16px gap) on a board narrower than ~816px, so
                  52rem leaves a margin. Extra right padding clears the
                  assistant orb in that corner. `bottom-6` clears the
                  horizontal scrollbar. On a board too narrow even for icons
                  (~320px) the two can still touch.

                  The leader's shortlist bar, which takes this slot while the
                  board is closed, is wider (~490px) and meets the zoom
                  control on a board narrower than ~930px, so it anchors
                  right from 60rem.

                  Marked so the sticky popup can centre itself over the board
                  this row spans, rather than over a window the side panels
                  make lopsided, and rest just above the toolbar. */}
            <div
              data-board-toolbar
              className={`absolute inset-x-0 bottom-6 flex justify-center px-6 ${
                !boardOpen && boardOverlay
                  ? '@max-[60rem]/board:justify-end @max-[60rem]/board:pr-[5.75rem]'
                  : '@max-[52rem]/board:justify-end @max-[52rem]/board:pr-[5.75rem]'
              }`}
            >
              {/* `relative` so the first-proposal hint can rise off whichever
                  bar is here, and follow it when it anchors left. */}
              <div className="pointer-events-auto relative min-w-0">
                <FirstProposalHint
                  sessionId={board.sessionId}
                  viewerId={viewerId}
                  boardOpen={boardOpen}
                  isLive={isLive}
                  // Framing a picture counts: it is making a proposal, and
                  // the hint that says how to make one has done its job.
                  toolOpen={activeTool !== null || (imageImport?.importing ?? false)}
                />
                {boardOpen ? (
                  // Reuse sits in the same pill as the tools that start from
                  // blank, because reusing an earlier proposal produces the
                  // same thing they do. It belongs inside this branch for
                  // the same reason they do: with the board closed there is
                  // nothing to reuse onto.
                  <CreativeToolbar>{myProposals}</CreativeToolbar>
                ) : boardOverlay ? (
                  // One bar for the leader: the shortlist controls stand in for
                  // the locked message rather than stacking on top of it.
                  boardOverlay
                ) : (
                  // A sentence cannot shrink to an icon, so it truncates
                  // instead, capped at what the zoom control leaves free.
                  <p
                    className={`${FLOATING_BAR} max-w-[calc(100cqw-18rem)] px-4 text-[12px] font-medium text-rt-ink-muted`}
                  >
                    <span className="truncate">{closedMessage}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Zoom, opposite the assistant: clear of the vertical
                  scrollbar by `left-6`, and on the same baseline as the
                  main bar. */}
            <div className="pointer-events-auto absolute bottom-6 left-6">
              <ZoomControl
                zoom={zoom}
                canZoomIn={zoom !== ZOOM_LEVELS[0]}
                canZoomOut={zoom !== minZoom}
                onZoomIn={onZoomIn}
                onZoomOut={onZoomOut}
                onFit={onFit}
              />
            </div>
          </div>
        </div>

        {ballot}
      </div>
    </div>
  );
}
