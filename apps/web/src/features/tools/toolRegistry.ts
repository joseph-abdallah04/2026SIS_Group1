export const TOOL_KINDS = ['sticky', 'drawing', 'diagram'] as const;

export type ToolKind = (typeof TOOL_KINDS)[number];

export const TOOL_LABELS: Record<ToolKind, string> = {
  sticky: 'Sticky note',
  drawing: 'Drawing',
  diagram: 'Diagram',
};

export function parseToolKind(value: string | null): ToolKind | null {
  return TOOL_KINDS.find((tool) => tool === value) ?? null;
}
