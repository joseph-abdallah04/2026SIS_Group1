import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput, ProposalUpdateInput } from '@roundtable/shared/schemas';

import { CreativeToolsContext } from './CreativeToolsContext';
import { draftKeyFor } from './sticky/stickyDraft';
import { parseToolKind, type ToolKind } from './toolRegistry';
import { useProposalSubmission } from './useProposalSubmission';

interface CreativeToolsProviderProps {
  children: ReactNode;
  /** Which session the tools are writing into, so a draft stays with it. */
  sessionId: string;
  /** The question the board is on; a draft is kept per question. */
  questionId: string;
  isLive: boolean;
  /** Who is looking, so extending your own proposal can say "your". */
  viewerId: string | null;
  proposals: readonly BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
  editProposal: (input: ProposalUpdateInput) => Promise<void>;
}

export function CreativeToolsProvider({
  children,
  sessionId,
  questionId,
  isLive,
  viewerId,
  proposals,
  propose,
  editProposal,
}: CreativeToolsProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [extensionSource, setExtensionSource] = useState<BoardItem | null>(null);
  // Which button opened the copy. Meaningless without a source, and cleared
  // with it everywhere below.
  const [extensionKind, setExtensionKind] = useState<'extend' | 'reuse'>('extend');
  const [editSource, setEditSource] = useState<BoardItem | null>(null);
  const activeTool = parseToolKind(searchParams.get('tool'));
  const submission = useProposalSubmission({
    extensionSource,
    isReusing: extensionKind === 'reuse',
    editSource,
    isLive,
    proposals,
    propose,
    editProposal,
  });
  const closeGuardRef = useRef<(() => boolean) | null>(null);

  const setCloseGuard = useCallback((guard: (() => boolean) | null) => {
    closeGuardRef.current = guard;
  }, []);

  useEffect(() => {
    if (!activeTool) return;

    const onPopState = () => {
      if (closeGuardRef.current && !closeGuardRef.current()) window.history.forward();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [activeTool]);

  function setToolParam(tool: ToolKind, replace: boolean) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tool', tool);
    setSearchParams(nextParams, { replace });
  }

  // The three entry points are mutually exclusive, so each clears the others:
  // a stale source would decide whether the next save creates or overwrites.
  function openTool(tool: ToolKind) {
    submission.reset();
    setExtensionSource(null);
    setEditSource(null);
    setToolParam(tool, activeTool !== null);
  }

  function openCopy(proposal: BoardItem, kind: 'extend' | 'reuse') {
    submission.reset();
    setEditSource(null);
    setExtensionSource(proposal);
    setExtensionKind(kind);
    setToolParam(proposal.type, activeTool !== null);
  }

  const openEditorForExtend = (proposal: BoardItem) => openCopy(proposal, 'extend');
  const openEditorForReuse = (proposal: BoardItem) => openCopy(proposal, 'reuse');

  function openEditorForEdit(proposal: BoardItem) {
    submission.reset();
    setExtensionSource(null);
    setEditSource(proposal);
    setToolParam(proposal.type, activeTool !== null);
  }

  function closeTool(): boolean {
    if (closeGuardRef.current && !closeGuardRef.current()) return false;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tool');
    setSearchParams(nextParams, { replace: true });
    setExtensionSource(null);
    setEditSource(null);
    if (submission.status !== 'submitting') submission.reset();
    return true;
  }

  return (
    <CreativeToolsContext.Provider
      value={{
        activeTool,
        draftScope: { sessionId, questionId, viewerId },
        extensionSource,
        isReusing: extensionSource !== null && extensionKind === 'reuse',
        isExtendingOwn:
          extensionSource !== null &&
          extensionKind === 'extend' &&
          viewerId !== null &&
          extensionSource.authorId === viewerId,
        editSource,
        isLive,
        stickyDraftKey:
          sessionId && questionId && viewerId ? draftKeyFor(sessionId, questionId, viewerId) : null,
        submissionStatus: submission.status,
        submissionError: submission.error,
        openTool,
        openEditorForExtend,
        openEditorForReuse,
        openEditorForEdit,
        closeTool,
        setCloseGuard,
        resetSubmission: submission.reset,
        submitArtifact: submission.submitArtifact,
      }}
    >
      {children}
    </CreativeToolsContext.Provider>
  );
}
