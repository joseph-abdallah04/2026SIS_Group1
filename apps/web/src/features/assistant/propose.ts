// F37 — "Propose": send an artifact the agent produced to the shared pinboard.
//
// Deliberately reuses the pinboard's normal `proposal:create` pipeline rather than a
// private assistant route, so the proposal is authored by the user, validated by the same
// rules, and broadcast the same way as one drawn by hand (docs/02 §8.8).
import type { ProposalArtifact } from '@roundtable/shared';

import { getSocket } from '../../lib/socket';

/** How long to wait for the server's ack before assuming the pipeline isn't there yet. */
const ACK_TIMEOUT_MS = 6_000;

export interface ProposeInput {
  sessionId: string;
  questionId: string;
  artifact: ProposalArtifact;
}

export interface ProposeOutcome {
  ok: boolean;
  proposalId?: string;
  error?: string;
}

export async function proposeArtifact(input: ProposeInput): Promise<ProposeOutcome> {
  const socket = getSocket();
  if (!socket.connected) {
    return {
      ok: false,
      error: 'Not connected to the session — reconnecting, try again in a moment.',
    };
  }

  const position = scatter();

  return new Promise<ProposeOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: ProposeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    // The pinboard module is still being built. Until its handler exists nothing acks, so
    // a timeout is a real outcome here, not a bug — say so plainly instead of hanging.
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: 'The pinboard did not respond. It may not be wired up in this build yet.',
        }),
      ACK_TIMEOUT_MS,
    );

    socket.emit(
      'proposalCreate',
      {
        sessionId: input.sessionId,
        questionId: input.questionId,
        artifact: input.artifact,
        x: position.x,
        y: position.y,
      },
      (ack) => finish(ack ?? { ok: false, error: 'Empty response from the server.' }),
    );
  });
}

/**
 * Drops the proposal in a loose cluster near the middle of the board rather than exactly
 * on top of the last one. The pinboard owner may well override placement; this only needs
 * to avoid a perfect stack.
 */
function scatter(): { x: number; y: number } {
  return {
    x: Math.round(320 + (Math.random() - 0.5) * 220),
    y: Math.round(240 + (Math.random() - 0.5) * 180),
  };
}
