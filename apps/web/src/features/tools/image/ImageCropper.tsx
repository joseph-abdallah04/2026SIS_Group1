import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

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

/** Where each handle sits on the frame, as a fraction across and down it. */
const AT: Record<CropHandle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

/** How far one press of an arrow key moves the frame, in screen pixels. */
const KEY_STEP = 8;

/**
 * The picture with a frame over it that can be moved and resized.
 *
 * What falls outside the frame is dimmed rather than hidden, so it stays clear
 * what is being left out. Drag inside the frame to move it; drag a corner or
 * an edge to resize it. With the frame focused the arrow keys
 * move it, so the whole thing works without a pointer.
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

  const handles = [...CORNERS, ...EDGES];
  const frame = {
    left: crop.x * scale,
    top: crop.y * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  };

  return (
    // Two layers over the picture. The lower one is clipped to the picture, so
    // the dimming can be one shadow reaching out from the frame; the upper one
    // is not, because a handle on the picture's edge sits half outside it, and
    // clipped it would be half a target — which is every handle, on the whole
    // picture the crop starts as.
    <div
      className="relative mx-auto touch-none select-none"
      style={{ width: shownWidth, height: shownHeight }}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
        style={{ background: '#1A1D24' }}
      >
        <img src={imageUrl} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
        {/* Everything outside the frame, dimmed: one shadow as wide as the
            picture, clipped by it, rather than four boxes to keep in step. */}
        <div
          className="absolute"
          style={{ ...frame, boxShadow: '0 0 0 9999px rgba(8,12,21,0.55)' }}
        />
      </div>
      <div
        role="group"
        tabIndex={0}
        aria-label="Crop area. Use the arrow keys to move it."
        onPointerDown={begin('move')}
        onKeyDown={onKeyDown}
        className="absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-rt-primary focus-visible:ring-offset-0"
        style={{ ...frame, border: '1.5px solid rgba(255,255,255,0.95)' }}
      >
        {/* Thirds, the way a camera shows them, so a subject can be placed. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
        </div>
        {handles.map((handle) => {
          const [u, v] = AT[handle];
          const corner = handle.length === 2;
          const across = handle === 'n' || handle === 's';
          return (
            // A target larger than the dot that shows it: a 14px dot is easy
            // to see and hard to hit, especially with a finger.
            <span
              key={handle}
              aria-hidden="true"
              data-crop-handle={handle}
              onPointerDown={begin(handle)}
              className="absolute flex h-7 w-7 items-center justify-center"
              style={{
                left: `${u * 100}%`,
                top: `${v * 100}%`,
                transform: 'translate(-50%, -50%)',
                cursor: CURSOR[handle],
              }}
            >
              <span
                className="rounded-full border border-rt-ink/30 bg-white shadow"
                style={{
                  width: corner ? 14 : across ? 22 : 8,
                  height: corner ? 14 : across ? 8 : 22,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
