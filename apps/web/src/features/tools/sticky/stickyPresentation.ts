export interface StickyTypography {
  fontSize: number;
  lineHeight: number;
}

export function stickyTypography(text: string): StickyTypography {
  const length = text.trim().length;

  if (length <= 90) return { fontSize: 14, lineHeight: 1.45 };
  if (length <= 180) return { fontSize: 12, lineHeight: 1.4 };
  return { fontSize: 10, lineHeight: 1.35 };
}
