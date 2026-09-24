import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { moveCrop, resizeCrop, type CropHandle, type CropRect, type Size } from './cropGeometry';

interface ImageCropperProps {
  /** Where the picture can be shown from — an object URL for the chosen file. */
  imageUrl: string;
  /** The picture's own size, which the crop is measured in. */
  size: Size;
  crop: CropRect;
  onCropChange: (crop: CropRect) => void;
  /** The most room the picture may take on screen. */
  maxWidth: number;
  maxHeight: number;
}

const CORNERS: readonly CropHandle[] = ['nw', 'ne', 'sw', 'se'];
const EDGES: readonly CropHandle[] = ['n', 's', 'e', 'w'];

/** The resize cursor for each handle. */
const CURSOR: Record<CropHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

/** A corner bracket's arms, and how thick they are, in screen pixels. */
const ARM = 22;
const THICK = 3;
/** The square round a corner that answers to a press, much larger than the bracket. */
const CORNER_TARGET = 40;
/** How far either side of an edge a press still grabs it. */
const EDGE_REACH = 10;

/** How far one press of an arrow key moves the frame, in screen pixels. */
const KEY_STEP = 8;

/**
 * The picture with a frame over it that can be moved and resized.
 *
 * Drawn the way Photos draws a crop: a thin white frame with heavy L-shaped
 * brackets at its corners, the picture outside it darkened, and a grid of
 * thirds that shows only while the frame is being moved, there to line
 * something up against rather than to sit over the picture the rest of the time.
 *
 * Drag inside the frame to move it; drag a corner, or anywhere along an edge,
 * to resize it. The edges have no handles of their own, as in Photos: the
 * whole edge is the handle. With the frame focused the arrow keys move it, so
 * the whole thing works without a pointer.
 *
 * Every drag is worked out from where it started, not from the last move, so
 * a pointer that runs off the picture and back lands the frame under it.
 */
export function ImageCropper({
  imageUrl,
  size,
  crop,
  onCropChange,
  maxWidth,
  maxHeight,
}: ImageCropperProps) {
  // Screen pixels per picture pixel. A tiny picture is drawn larger, up to a
  // point, so its frame still has handles a finger can find.
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 4);
  const shownWidth = Math.round(size.width * scale);
  const shownHeight = Math.round(size.height * scale);

  // Whether the frame is being moved right now, which is when the grid shows.
  const [adjusting, setAdjusting] = useState(false);
  const drag = useRef<{
    handle: CropHandle | 'move';
    x: number;
    y: number;
    start: CropRect;
  } | null>(null);

  const begin = (handle: CropHandle | 'move') => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    // Held by this element for the rest of the drag, so it carries on when the
    // pointer leaves the picture — which is how a frame is pushed to an edge.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Nothing to capture; the moves still arrive while over the picture.
    }
    drag.current = { handle, x: event.clientX, y: event.clientY, start: crop };
    setAdjusting(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const held = drag.current;
    if (!held) return;
    const dx = (event.clientX - held.x) / scale;
    const dy = (event.clientY - held.y) / scale;
    onCropChange(
      held.handle === 'move'
        ? moveCrop(held.start, dx, dy, size)
        : resizeCrop(held.start, held.handle, dx, dy, size),
    );
  };

  const end = () => {
    drag.current = null;
    setAdjusting(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP / scale;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    if (!move) return;
    event.preventDefault();
    onCropChange(moveCrop(crop, move[0], move[1], size));
  };

  const frame = {
    left: crop.x * scale,
    top: crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  };

  return (
    // Two layers over the picture. The lower one is clipped to the picture, so
    // the darkening can be one shadow reaching out from the frame; the upper one
    // is not, because a bracket on the picture's edge sits just outside it, and
    // clipped it would be half a target, which is every corner on the whole
    // picture the crop starts as.
    <div
      className="relative mx-auto touch-none select-none"
      style={{ width: shownWidth, height: shownHeight }}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Turned by the photo's own note, as the decoded copy that gets cropped
            is. It is what browsers do by default; said here so the frame can
            never be laid over a picture shown on its side. */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full"
          style={{ imageOrientation: 'from-image' }}
        />
        {/* Everything outside the frame, darkened: one shadow as wide as the
            picture, clipped by it, rather than four boxes to keep in step. */}
        <div className="absolute" style={{ ...frame, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }} />
      </div>
      <div
        role="group"
        tabIndex={0}
        aria-label="Crop area. Use the arrow keys to move it."
        onPointerDown={begin('move')}
        onKeyDown={onKeyDown}
        className="absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-rt-surface-alt"
        style={{ ...frame, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.9)' }}
      >
        {/* Thirds, the way a camera shows them, so a subject can be placed:
            only while the frame is moving, and faded rather than switched. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none"
          style={{ opacity: adjusting ? 1 : 0 }}
        >
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
        </div>

        {/* The edges: no mark of their own, but a band along each that grabs.
            They stop short of the corners, which are the brackets' to answer. */}
        {EDGES.map((handle) => {
          const across = handle === 'n' || handle === 's';
          return (
            <span
              key={handle}
              aria-hidden="true"
              data-crop-handle={handle}
              onPointerDown={begin(handle)}
              className="absolute"
              style={{
                cursor: CURSOR[handle],
                ...(across
                  ? {
                      left: ARM,
                      right: ARM,
                      height: EDGE_REACH * 2,
                      [handle === 'n' ? 'top' : 'bottom']: -EDGE_REACH,
                    }
                  : {
                      top: ARM,
                      bottom: ARM,
                      width: EDGE_REACH * 2,
                      [handle === 'w' ? 'left' : 'right']: -EDGE_REACH,
                    }),
              }}
            />
          );
        })}

        {/* The corners: a heavy L that sits just outside the frame line, and a
            square round it much larger than the L, since a corner is the thing
            most often grabbed and a 3px line is a hard thing to hit. A soft
            shadow under the L, since on the picture's edge it sits on the pale
            stage rather than the picture, where white alone would vanish. */}
        {CORNERS.map((handle) => {
          const east = handle.includes('e');
          const south = handle.includes('s');
          const middle = CORNER_TARGET / 2;
          return (
            <span
              key={handle}
              aria-hidden="true"
              data-crop-handle={handle}
              onPointerDown={begin(handle)}
              className="absolute"
              style={{
                width: CORNER_TARGET,
                height: CORNER_TARGET,
                left: east ? '100%' : 0,
                top: south ? '100%' : 0,
                transform: 'translate(-50%, -50%)',
                cursor: CURSOR[handle],
                filter:
                  'drop-shadow(0 0 1px rgba(8,12,21,0.55)) drop-shadow(0 1px 2px rgba(8,12,21,0.3))',
              }}
            >
              <span
                className="absolute bg-white"
                style={{
                  left: east ? middle + THICK - ARM : middle - THICK,
                  top: south ? middle : middle - THICK,
                  width: ARM,
                  height: THICK,
                }}
              />
              <span
                className="absolute bg-white"
                style={{
                  left: east ? middle : middle - THICK,
                  top: south ? middle + THICK - ARM : middle - THICK,
                  width: THICK,
                  height: ARM,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
