import { createContext, useContext } from 'react';
import type { ArtifactJson, BoardItem } from '@roundtable/shared';

import type { ToolKind } from './toolRegistry';

export type ProposalSubmissionStatus = 'idle' | 'submitting' | 'success';

export interface CreativeToolsContextValue {
  activeTool: ToolKind | null;
  extensionSource: BoardItem | null;
  /**
   * The source is this viewer's own work, so the editor says "reusing yours"
   * rather than naming them as though they were someone else (F38). Copying
   * your own earlier proposal onto the current question and building on a
   * colleague's are the same write; only the wording differs.
   */
  isReusingOwn: boolean;
  /**
   * The proposal being rewritten in place, as opposed to copied. Editing keeps
   * the original's id, author and position; extending creates a new proposal
   * that merely starts from the same artifact.
   */
  editSource: BoardItem | null;
  isLive: boolean;
  /**
   * Where this viewer's unproposed sticky is kept in this session, or null
   * where there is no session or no signed-in viewer to keep it for.
   */
  stickyDraftKey: string | null;
  submissionStatus: ProposalSubmissionStatus;
  submissionError: string | null;
  openTool: (tool: ToolKind) => void;
  openEditorForExtend: (proposal: BoardItem) => void;
  /** Reopen a proposal's own editor to change what it says (F16). */
  openEditorForEdit: (proposal: BoardItem) => void;
  closeTool: () => void;
  setCloseGuard: (guard: (() => boolean) | null) => void;
  resetSubmission: () => void;
  submitArtifact: (artifact: ArtifactJson) => Promise<boolean>;
}

export const CreativeToolsContext = createContext<CreativeToolsContextValue | null>(null);

export function useCreativeTools(): CreativeToolsContextValue {
  const value = useContext(CreativeToolsContext);
  if (!value) throw new Error('useCreativeTools must be used inside CreativeToolsProvider');
  return value;
}
