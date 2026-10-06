import { type GitInfo } from '../catalogue/types';
import { type Scheme, type SchemeEdits } from '../model/spec';
import { parseStored } from '../model/store';

/** What a prompt carries so the lab can be put back to the same colours: only the edits. */
export const STATE_FORMAT = 'colour-lab-state';

export interface LabEdits {
  light: SchemeEdits;
  dark: SchemeEdits;
}

export interface SavedState {
  format: typeof STATE_FORMAT;
  version: 1;
  generatedAt: string;
  git: GitInfo;
  edits: LabEdits;
}

export function stateOf(
  edits: Readonly<Record<Scheme, SchemeEdits>>,
  git: GitInfo,
  date: Date,
): SavedState {
  return {
    format: STATE_FORMAT,
    version: 1,
    generatedAt: date.toISOString(),
    git,
    edits: { light: edits.light, dark: edits.dark },
  };
}

/** The section at the end of a prompt. A reader of the prompt does not need it. */
export function stateSection(state: SavedState): string[] {
  return [
    '## The lab’s state',
    '',
    'This is what the Colour Lab loads to get back to these exact colours. You do not need it to make the changes above.',
    '',
    '```json',
    JSON.stringify(state, null, 1),
    '```',
    '',
  ];
}

/**
 * The edits in a prompt or a saved file, or `null` if the text holds none. Anything the lab does
 * not understand in them is dropped by the same reader that loads the lab's own storage.
 */
export function parseState(text: string): LabEdits | null {
  const candidates: string[] = [text.trim()];
  for (const match of text.matchAll(/```json\s*\n([\s\S]*?)\n```/g))
    candidates.push(match[1] ?? '');
  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate) as { format?: unknown; edits?: unknown };
      if (data.format !== STATE_FORMAT || typeof data.edits !== 'object' || data.edits === null)
        continue;
      const { edits } = parseStored(JSON.stringify({ edits: data.edits }));
      return { light: edits.light, dark: edits.dark };
    } catch {
      // Not JSON: try the next.
    }
  }
  return null;
}
