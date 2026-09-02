import { createContext, useContext } from 'react';
import type { ArtifactJson, BoardItem } from '@roundtable/shared';

import type { ToolKind } from './toolRegistry';

export type ProposalSubmissionStatus = 'idle' | 'submitting' | 'success';

export interface CreativeToolsContextValue {
  activeTool: ToolKind | null;
  extensionSource: BoardItem | null;
  isLive: boolean;
  submissionStatus: ProposalSubmissionStatus;
  submissionError: string | null;
  openTool: (tool: ToolKind) => void;
  openEditorForExtend: (proposal: BoardItem) => void;
  closeTool: () => void;
  resetSubmission: () => void;
  submitArtifact: (artifact: ArtifactJson) => Promise<boolean>;
}

export const CreativeToolsContext = createContext<CreativeToolsContextValue | null>(null);

export function useCreativeTools(): CreativeToolsContextValue {
  const value = useContext(CreativeToolsContext);
  if (!value) throw new Error('useCreativeTools must be used inside CreativeToolsProvider');
  return value;
}
