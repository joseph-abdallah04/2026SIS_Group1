import { useRef, useState } from 'react';
import type { ArtifactJson, BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput, ProposalUpdateInput } from '@roundtable/shared/schemas';

import { findOpenProposalPosition } from './proposalPlacement';
import { proposalErrorMessage } from './proposeErrors';
import type { ProposalSubmissionStatus } from './CreativeToolsContext';

interface UseProposalSubmissionOptions {
  extensionSource: BoardItem | null;
  /** Set when the editor is rewriting a proposal rather than making one. */
  editSource: BoardItem | null;
  isLive: boolean;
  proposals: readonly BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
  editProposal: (input: ProposalUpdateInput) => Promise<void>;
}

export function useProposalSubmission({
  extensionSource,
  editSource,
  isLive,
  proposals,
  propose,
  editProposal,
}: UseProposalSubmissionOptions) {
  const [status, setStatus] = useState<ProposalSubmissionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  function reset() {
    submitting.current = false;
    setStatus('idle');
    setError(null);
  }

  async function submitArtifact(artifactJson: ArtifactJson): Promise<boolean> {
    if (submitting.current) return false;

    if (!isLive) {
      setError(
        editSource
          ? 'Reconnect to the session before saving your changes.'
          : 'Reconnect to the session before proposing your idea.',
      );
      return false;
    }

    submitting.current = true;
    setStatus('submitting');
    setError(null);

    try {
      if (editSource) {
        // An edit changes what the proposal says and nothing else: it keeps its
        // id, its author and the place on the board it was dragged to, so no
        // position is computed or sent.
        await editProposal({ id: editSource.id, artifactJson });
      } else {
        await propose({
          type: artifactJson.type,
          artifactJson,
          ...findOpenProposalPosition(proposals, artifactJson.type),
          ...(extensionSource ? { extendsProposalId: extensionSource.id } : {}),
        });
      }
      setStatus('success');
      return true;
    } catch (cause) {
      submitting.current = false;
      setStatus('idle');
      setError(proposalErrorMessage(cause));
      return false;
    }
  }

  return { status, error, reset, submitArtifact };
}
