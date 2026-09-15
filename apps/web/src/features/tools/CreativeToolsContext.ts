import { createContext, useContext } from 'react';
import type { ArtifactJson, BoardItem } from '@roundtable/shared';

import type { ToolKind } from './toolRegistry';

export type ProposalSubmissionStatus = 'idle' | 'submitting' | 'success';

/**
 * What one write outside an editor came to. The reason it carries its own error
 * rather than leaving it in `submissionError`: several of these can be in the
 * air at once, and a caller must be told about its own.
 */
export type ProposeResult = { ok: true } | { ok: false; error: string };

export interface CreativeToolsContextValue {
  activeTool: ToolKind | null;
  /**
   * Which board this editor belongs to, so an unfinished canvas can be kept
   * against it. A draft made for one question must never open on another.
   */
  draftScope: { sessionId: string; questionId: string; viewerId: string | null };
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
   * Where this viewer's unproposed sticky for the current question is kept, or
   * null where there is no session, question or signed-in viewer to keep it for.
   */
  stickyDraftKey: string | null;
  submissionStatus: ProposalSubmissionStatus;
  submissionError: string | null;
  openTool: (tool: ToolKind) => void;
  openEditorForExtend: (proposal: BoardItem) => void;
  /** Reopen a proposal's own editor to change what it says (F16). */
  openEditorForEdit: (proposal: BoardItem) => void;
  /** False when the open tool's close guard kept it open. */
  closeTool: () => boolean;
  setCloseGuard: (guard: (() => boolean) | null) => void;
  resetSubmission: () => void;
  /**
   * The editor's write: one per tool opened, since the lock it takes is released
   * by opening or closing a tool, and `submissionStatus` is the editor's screen.
   */
  submitArtifact: (artifact: ArtifactJson) => Promise<boolean>;
  /**
   * A write from somewhere that is not an editor — the assistant's chat cards,
   * which never open a tool and each keep their own state. Same placement and
   * same error copy; none of the editor's one-at-a-time state.
   */
  proposeArtifact: (artifact: ArtifactJson) => Promise<ProposeResult>;
}

export const CreativeToolsContext = createContext<CreativeToolsContextValue | null>(null);

export function useCreativeTools(): CreativeToolsContextValue {
  const value = useContext(CreativeToolsContext);
  if (!value) throw new Error('useCreativeTools must be used inside CreativeToolsProvider');
  return value;
}
