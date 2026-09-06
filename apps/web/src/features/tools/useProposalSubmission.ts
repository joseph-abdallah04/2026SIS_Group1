import { useRef, useState } from 'react';
import type { ArtifactJson, BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';

import { findOpenProposalPosition } from './proposalPlacement';
import { proposalErrorMessage } from './proposeErrors';
import type { ProposalSubmissionStatus } from './CreativeToolsContext';

interface UseProposalSubmissionOptions {
  extensionSource: BoardItem | null;
  isLive: boolean;
  proposals: readonly BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
}

export function useProposalSubmission({
  extensionSource,
  isLive,
  proposals,
  propose,
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
      setError('Reconnect to the session before proposing your idea.');
      return false;
    }

    submitting.current = true;
    setStatus('submitting');
    setError(null);

    const position = findOpenProposalPosition(proposals, artifactJson.type);
    const input: ProposalCreateInput = {
      type: artifactJson.type,
      artifactJson,
      ...position,
      ...(extensionSource ? { extendsProposalId: extensionSource.id } : {}),
    };

    try {
      await propose(input);
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
