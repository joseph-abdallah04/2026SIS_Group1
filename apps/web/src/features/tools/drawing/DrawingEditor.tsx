import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  Check,
  CheckCircle2,
  Eraser,
  LoaderCircle,
  Pencil,
  Redo2,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';

import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { DRAWING_SVG_LIMIT } from '../artifactLimits';
import { useCreativeTools } from '../CreativeToolsContext';
import {
  DRAWING_INKS,
  DRAWING_VIEWBOX_HEIGHT,
  DRAWING_VIEWBOX_WIDTH,
  PEN_WIDTHS,
  clientPointToDrawingPoint,
  eraseStrokesAtPoint,
  eraserRadiusForSurface,
  prepareDrawing,
  serializeDrawingSvg,
  strokePathData,
  type DrawingInk,
  type DrawingStroke,
  type PenWidth,
} from './drawingModel';
import { useDrawingHistory } from './useDrawingHistory';

type DrawingMode = 'pen' | 'eraser';

const DRAWING_VERTICAL_CHROME_REM = 15;

function createStrokeId(): string {
  return globalThis.crypto.randomUUID();
}

function formatArtifactSize(length: number): string {
  return length < 1000 ? `${length} B` : `${(length / 1000).toFixed(1)} KB`;
}

export function DrawingEditor() {
  const { closeTool, isLive, resetSubmission, submissionError, submissionStatus, submitArtifact } =
    useCreativeTools();
  const { strokes, strokesRef, canUndo, canRedo, commit, preview, recordPreview, undo, redo } =
    useDrawingHistory();
  const [mode, setMode] = useState<DrawingMode>('pen');
  const [ink, setInk] = useState<DrawingInk>('ink');
  const [penWidth, setPenWidth] = useState<PenWidth>(8);
  const [activeStroke, setActiveStroke] = useState<DrawingStroke | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const activePointerId = useRef<number | null>(null);
  const eraserStartRef = useRef<DrawingStroke[] | null>(null);
  const svg = useMemo(() => serializeDrawingSvg(strokes), [strokes]);

  function clearError() {
    setValidationError(null);
    if (submissionError) resetSubmission();
  }

  function inputFromEvent(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const surfaceBounds = {
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    return {
      point: clientPointToDrawingPoint({ x: event.clientX, y: event.clientY }, surfaceBounds),
      eraserRadius: eraserRadiusForSurface(surfaceBounds),
    };
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (
      event.button !== 0 ||
      activePointerId.current !== null ||
      submissionStatus === 'submitting'
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    const { point, eraserRadius } = inputFromEvent(event);
    clearError();

    if (mode === 'eraser') {
      eraserStartRef.current = strokesRef.current;
      preview(eraseStrokesAtPoint(strokesRef.current, point, eraserRadius));
      return;
    }

    const stroke: DrawingStroke = {
      id: createStrokeId(),
      ink,
      width: penWidth,
      points: [point],
    };
    activeStrokeRef.current = stroke;
    setActiveStroke(stroke);
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerId !== activePointerId.current) return;
    event.preventDefault();
    const { point, eraserRadius } = inputFromEvent(event);

    if (mode === 'eraser') {
      preview(eraseStrokesAtPoint(strokesRef.current, point, eraserRadius));
      return;
    }

    const currentStroke = activeStrokeRef.current;
    if (!currentStroke) return;
    const nextStroke = { ...currentStroke, points: [...currentStroke.points, point] };
    activeStrokeRef.current = nextStroke;
    setActiveStroke(nextStroke);
  }

  function finishPointer(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerId !== activePointerId.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (mode === 'eraser') {
      const { point, eraserRadius } = inputFromEvent(event);
      preview(eraseStrokesAtPoint(strokesRef.current, point, eraserRadius));
      const previous = eraserStartRef.current;
      if (previous) recordPreview(previous);
      eraserStartRef.current = null;
    } else {
      const completedStroke = activeStrokeRef.current;
      if (completedStroke) {
        const releasePoint = inputFromEvent(event).point;
        const lastPoint = completedStroke.points.at(-1);
        const points =
          lastPoint && lastPoint.x === releasePoint.x && lastPoint.y === releasePoint.y
            ? completedStroke.points
            : [...completedStroke.points, releasePoint];
        commit([...strokesRef.current, { ...completedStroke, points }]);
      }
      activeStrokeRef.current = null;
      setActiveStroke(null);
    }

    activePointerId.current = null;
  }

  function clearDrawing() {
    if (strokesRef.current.length === 0) return;
    clearError();
    commit([]);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prepared = prepareDrawing(strokes);
    if (!prepared.ok) {
      setValidationError(prepared.error);
      return;
    }

    setValidationError(null);
    await submitArtifact({ type: 'drawing', svg: prepared.svg });
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;

    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  if (submissionStatus === 'success') {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-rt-surface-sunken px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rt-primary-tint text-rt-primary-deep">
          <CheckCircle2 aria-hidden="true" size={28} strokeWidth={1.7} />
        </span>
        <div>
          <h2 className="text-[20px] font-semibold text-rt-ink">Drawing proposed</h2>
          <p role="status" className="mt-1 text-[13px] text-rt-ink-muted">
            It is now on the shared pinboard.
          </p>
        </div>
        <Button onClick={closeTool}>Back to pinboard</Button>
      </div>
    );
  }

  const error = validationError ?? submissionError;
  const isSubmitting = submissionStatus === 'submitting';

  return (
    <form
      className="flex min-h-0 flex-1 flex-col bg-rt-surface-sunken"
      onKeyDown={onEditorKeyDown}
      onSubmit={(event) => void onSubmit(event)}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-rt-tertiary bg-rt-surface px-3 py-2.5 sm:px-5">
        <div
          className="flex items-center rounded-lg border border-rt-tertiary bg-rt-surface-alt p-0.5"
          aria-label="Drawing tool"
        >
          <button
            type="button"
            aria-label="Pen"
            aria-pressed={mode === 'pen'}
            onClick={() => setMode('pen')}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold text-rt-ink-muted focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none aria-pressed:bg-rt-surface aria-pressed:text-rt-ink aria-pressed:shadow-sm"
          >
            <Pencil aria-hidden="true" size={15} />
            <span className="hidden sm:inline">Pen</span>
          </button>
          <button
            type="button"
            aria-label="Eraser"
            aria-pressed={mode === 'eraser'}
            onClick={() => setMode('eraser')}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold text-rt-ink-muted focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none aria-pressed:bg-rt-surface aria-pressed:text-rt-ink aria-pressed:shadow-sm"
          >
            <Eraser aria-hidden="true" size={15} />
            <span className="hidden sm:inline">Eraser</span>
          </button>
        </div>

        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">Ink colour</legend>
          {Object.entries(DRAWING_INKS).map(([option, color]) => {
            const selected = ink === option;
            return (
              <button
                key={option}
                type="button"
                aria-label={`${option} ink`}
                aria-pressed={selected}
                onClick={() => {
                  setInk(option as DrawingInk);
                  setMode('pen');
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-sm ring-1 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
                style={
                  {
                    background: color,
                    '--tw-ring-color': selected ? '#4D6A74' : '#CFCFCF',
                  } as React.CSSProperties
                }
              >
                {selected ? <Check aria-hidden="true" className="text-white" size={13} /> : null}
              </button>
            );
          })}
        </fieldset>

        <fieldset className="flex h-8 items-center overflow-hidden rounded-lg border border-rt-tertiary bg-rt-surface">
          <legend className="sr-only">Pen width</legend>
          {PEN_WIDTHS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`${option} pixel pen`}
              aria-pressed={penWidth === option}
              onClick={() => {
                setPenWidth(option);
                setMode('pen');
              }}
              className="flex h-full w-9 items-center justify-center border-r border-rt-tertiary last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rt-secondary focus-visible:outline-none aria-pressed:bg-rt-primary-tint"
            >
              <span
                aria-hidden="true"
                className="rounded-full bg-rt-ink"
                style={{ width: Math.max(10, option + 4), height: Math.max(2, option / 2) }}
              />
            </button>
          ))}
        </fieldset>

        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Undo" disabled={!canUndo || isSubmitting} onClick={undo}>
            <Undo2 aria-hidden="true" size={17} />
          </IconButton>
          <IconButton label="Redo" disabled={!canRedo || isSubmitting} onClick={redo}>
            <Redo2 aria-hidden="true" size={17} />
          </IconButton>
          <IconButton
            label="Clear drawing"
            disabled={strokes.length === 0 || isSubmitting}
            onClick={clearDrawing}
          >
            <Trash2 aria-hidden="true" size={17} />
          </IconButton>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">
        <div
          className="relative w-full shrink-0 overflow-hidden rounded-lg border border-rt-tertiary shadow-[0_8px_30px_rgba(8,12,21,0.10)]"
          style={{
            maxWidth: `min(1080px, calc((100dvh - ${DRAWING_VERTICAL_CHROME_REM}rem) * ${DRAWING_VIEWBOX_WIDTH / DRAWING_VIEWBOX_HEIGHT}))`,
            aspectRatio: `${DRAWING_VIEWBOX_WIDTH} / ${DRAWING_VIEWBOX_HEIGHT}`,
            backgroundColor: '#FFFFFF',
            backgroundImage:
              'linear-gradient(45deg, #EEF2F4 25%, transparent 25%), linear-gradient(-45deg, #EEF2F4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #EEF2F4 75%), linear-gradient(-45deg, transparent 75%, #EEF2F4 75%)',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
            backgroundSize: '16px 16px',
          }}
        >
          <svg
            role="img"
            aria-label="Drawing canvas"
            tabIndex={0}
            viewBox={`0 0 ${DRAWING_VIEWBOX_WIDTH} ${DRAWING_VIEWBOX_HEIGHT}`}
            className={`absolute inset-0 h-full w-full touch-none select-none ${mode === 'pen' ? 'cursor-crosshair' : 'cursor-cell'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
          >
            {strokes.map((stroke) => (
              <path
                key={stroke.id}
                d={strokePathData(stroke.points)}
                fill="none"
                stroke={DRAWING_INKS[stroke.ink]}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {activeStroke ? (
              <path
                d={strokePathData(activeStroke.points)}
                fill="none"
                stroke={DRAWING_INKS[activeStroke.ink]}
                strokeWidth={activeStroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-rt-tertiary bg-rt-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {error ? (
            <p role="alert" className="text-[12px] text-rt-secondary-deep">
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-rt-ink-faint" aria-live="polite">
              {strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'} ·{' '}
              {formatArtifactSize(svg.length)} of {formatArtifactSize(DRAWING_SVG_LIMIT)}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={closeTool}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isLive || isSubmitting}
          title={isLive ? 'Propose drawing (Ctrl+Enter)' : 'Reconnect before proposing'}
        >
          {isSubmitting ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
          ) : (
            <Send aria-hidden="true" size={16} />
          )}
          {isSubmitting ? 'Proposing' : 'Propose'}
        </Button>
      </footer>
    </form>
  );
}
