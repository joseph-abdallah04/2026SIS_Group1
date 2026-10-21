import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface FitCardProps {
  /** The card's width on the board, in pixels. */
  width: number;
  /** Never drawn larger than this share of the board size (a compact wall). */
  maxScale?: number;
  /** A picture of the card rather than the card: nothing in it can be reached or pressed. */
  still?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A board card at the size it has room for: its own size where it fits,
 * scaled down where it does not, so a card is never cut off and never pushes
 * the page sideways (B1). Scaled as a whole, so what is on it stays where its
 * author put it, at every width.
 *
 * The box is the card's own width, never wider than what holds it
 * (`max-width: 100%`); the card inside is laid out at full size and scaled to
 * that box, and the box's height follows the scaled card. Both are measured,
 * since a sticky grows with its note and the room changes as the window does.
 * A fixed width rather than `100%` so the box has a size of its own inside
 * whatever shrinks to fit it (a wall's items, a banner's column).
 */
export function FitCard({
  width,
  maxScale = 1,
  still = false,
  className = '',
  children,
}: FitCardProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const card = cardRef.current;
    if (!box || !card || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const room = box.clientWidth;
      if (room <= 0) return;
      const scale = Math.min(maxScale, room / width);
      const height = card.offsetHeight * scale;
      setFit((current) =>
        current &&
        Math.abs(current.scale - scale) < 0.001 &&
        Math.abs(current.height - height) < 0.5
          ? current
          : { scale, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(card);
    return () => observer.disconnect();
  }, [width, maxScale]);

  const scale = fit?.scale ?? 1;
  return (
    <div
      ref={boxRef}
      className={`relative shrink-0 ${className}`}
      style={{
        width: Math.round(width * maxScale),
        maxWidth: '100%',
        height: fit ? fit.height : undefined,
      }}
    >
      <div
        ref={cardRef}
        // Laid out at the board's size and scaled from its top-left corner, so
        // the box above can be exactly the scaled size.
        className={`origin-top-left ${fit ? 'absolute top-0 left-0' : ''}`}
        style={{ width, transform: scale === 1 ? undefined : `scale(${scale})` }}
        {...(still ? { inert: '', 'aria-hidden': true } : {})}
      >
        {children}
      </div>
    </div>
  );
}
