import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput, ProposalUpdateInput } from '@roundtable/shared/schemas';

import { CreativeToolsContext } from './CreativeToolsContext';
import { parseToolKind, type ToolKind } from './toolRegistry';
import { useProposalSubmission } from './useProposalSubmission';

interface CreativeToolsProviderProps {
  children: ReactNode;
  isLive: boolean;
  proposals: readonly BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
  editProposal: (input: ProposalUpdateInput) => Promise<void>;
}

export function CreativeToolsProvider({
  children,
  isLive,
  proposals,
  propose,
  editProposal,
}: CreativeToolsProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [extensionSource, setExtensionSource] = useState<BoardItem | null>(null);
  const [editSource, setEditSource] = useState<BoardItem | null>(null);
  const activeTool = parseToolKind(searchParams.get('tool'));
  const submission = useProposalSubmission({
    extensionSource,
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

  function openEditorForExtend(proposal: BoardItem) {
    submission.reset();
    setEditSource(null);
    setExtensionSource(proposal);
    setToolParam(proposal.type, activeTool !== null);
  }

  function openEditorForEdit(proposal: BoardItem) {
    submission.reset();
    setExtensionSource(null);
    setEditSource(proposal);
    setToolParam(proposal.type, activeTool !== null);
  }

  function closeTool() {
    if (closeGuardRef.current && !closeGuardRef.current()) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('tool');
    setSearchParams(nextParams, { replace: true });
    setExtensionSource(null);
    setEditSource(null);
    if (submission.status !== 'submitting') submission.reset();
  }

  return (
    <CreativeToolsContext.Provider
      value={{
        activeTool,
        extensionSource,
        editSource,
        isLive,
        submissionStatus: submission.status,
        submissionError: submission.error,
        openTool,
        openEditorForExtend,
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
