import { useEffect, useRef, useState } from 'react';
import type { ArtifactJson, BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput, ProposalUpdateInput } from '@roundtable/shared/schemas';

import { findOpenProposalPosition } from './proposalPlacement';
import { proposalErrorMessage } from './proposeErrors';
import type { ProposalSubmissionStatus, ProposeResult } from './CreativeToolsContext';

interface UseProposalSubmissionOptions {
  extensionSource: BoardItem | null;
  /** The source came from Reuse (F38), so it has no card on this board to sit beside. */
  isReusing: boolean;
  /** Set when the editor is rewriting a proposal rather than making one. */
  editSource: BoardItem | null;
  isLive: boolean;
  proposals: readonly BoardItem[];
  propose: (input: ProposalCreateInput) => Promise<void>;
  editProposal: (input: ProposalUpdateInput) => Promise<void>;
}

export function useProposalSubmission({
  extensionSource,
  isReusing,
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
        // An extension lands beside the card it builds on, so the two read as
        // related at a glance. Looked up on the board as it is now: the
        // original may have moved, or gone, since the editor opened.
        const original =
          extensionSource && !isReusing
            ? proposals.find((item) => item.id === extensionSource.id)
            : undefined;
        await propose({
          type: artifactJson.type,
          artifactJson,
          ...findOpenProposalPosition(proposals, artifactJson, original),
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

  /**
   * A write that does not belong to an editor.
   *
   * `submitArtifact` above is one write per tool opened: the lock it takes is
   * released by opening or closing a tool, and `status` drives the editor's own
   * screen. That is right for a popup you open, propose from once, and close —
   * it is what stops a stray keypress on a focused Propose button putting the
   * same note on the board twice.
   *
   * It is wrong for the assistant, which proposes from chat cards that never
   * open a tool and each track their own sending, proposed and failed. Sharing
   * the editor's lock gave it exactly one write per page load; sharing the
   * editor's `error` would tell one card about another's failure. So this
   * shares the parts that are about the board — where the artifact lands, and
   * what a rejection reads as — and keeps nothing that is about a popup.
   *
   * Always a create. Extending and editing are things you do from a tool.
   */
  async function proposeArtifact(artifactJson: ArtifactJson): Promise<ProposeResult> {
    if (!isLive)
      return { ok: false, error: 'Reconnect to the session before proposing your idea.' };

    try {
      await propose({
        type: artifactJson.type,
        artifactJson,
        ...findOpenProposalPosition(proposals, artifactJson),
      });
      return { ok: true };
    } catch (cause) {
      return { ok: false, error: proposalErrorMessage(cause) };
    }
  }

  return { status, error, reset, submitArtifact, proposeArtifact };
}

/** How long a proposal can be on its way before the studio shows it is waiting. */
const SLOW_SUBMISSION_MS = 300;

/**
 * Whether a proposal has been on its way long enough to be worth showing.
 *
 * Most go through in well under a tenth of a second. Greying the studio's tools
 * and swapping the Propose label for that moment flickered the whole studio just
 * before it closed, so they wait to change until the send is actually slow.
 * Input is still refused from the first moment, by the editors' own checks and
 * by the send refusing a second one; only how it looks waits.
 */
export function useSlowSubmission(submitting: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!submitting) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_SUBMISSION_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [submitting]);
  return submitting && slow;
}
