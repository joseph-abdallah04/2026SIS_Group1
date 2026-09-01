/** F14 pinboard tokens — RoundTable soft style, project palette only. */

import type { StickyColor } from '@roundtable/shared';

export const ZOOM_LEVELS = [100, 80, 60, 40] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const CARD_RADIUS = '12px';
export const STICKY_RADIUS = '14px';

/** Soft light border + shadow (drawing / diagram / sticky edges). */
export const CARD_SHADOW = '0 2px 8px rgba(8,12,21,0.08), 0 1px 2px rgba(8,12,21,0.04)';

/** Sticky fills from the RoundTable palette — soft tinted edges. */
export const STICKY_THEMES: Record<StickyColor, { bg: string; border: string; ink: string }> = {
  yellow: { bg: '#FDF4E5', border: '#F1C881', ink: '#080C15' },
  pink: { bg: '#F9EEF2', border: '#E0A33C', ink: '#080C15' },
  blue: { bg: '#EEF2F4', border: '#8CA4AC', ink: '#080C15' },
  green: { bg: '#EEF4F0', border: '#4D6A74', ink: '#080C15' },
};

/**
 * Ring marking a card the viewer authored (F16). An outline rather than a fill
 * swap: a sticky's colour is the author's choice and carries meaning, so
 * ownership is drawn around the card instead of painted over it.
 */
export const OWNED_OUTLINE = '2px solid #E0A33C';
export const OWNED_OUTLINE_OFFSET = '2px';

/** Intrinsic widths — types differ on purpose. */
export const CARD_WIDTH: Record<'sticky' | 'drawing' | 'diagram', number> = {
  sticky: 210,
  drawing: 250,
  diagram: 300,
};

export const ZOOM_GRID: Record<
  ZoomLevel,
  {
    scale: number;
    gap: string;
    padding: string;
    dotSize: string;
    dotRadius: string;
    dotOpacity: string;
  }
> = {
  100: { scale: 1, gap: '22px', padding: '28px', dotSize: '22px', dotRadius: '1.5px', dotOpacity: '0.35' },
  80: { scale: 0.85, gap: '18px', padding: '22px', dotSize: '18px', dotRadius: '1.3px', dotOpacity: '0.32' },
  60: { scale: 0.7, gap: '14px', padding: '18px', dotSize: '16px', dotRadius: '1.2px', dotOpacity: '0.30' },
  40: { scale: 0.55, gap: '12px', padding: '14px', dotSize: '14px', dotRadius: '1.1px', dotOpacity: '0.28' },
};

export function cardWidthPx(type: 'sticky' | 'drawing' | 'diagram', zoom: ZoomLevel): number {
  return Math.round(CARD_WIDTH[type] * ZOOM_GRID[zoom].scale);
}
