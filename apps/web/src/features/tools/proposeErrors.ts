const PROPOSAL_ERROR_MESSAGES = {
  NOT_IN_SESSION: 'Rejoin the session before proposing your idea.',
  NO_ACTIVE_QUESTION: 'Wait for the leader to open a question before proposing.',
  INVALID_PROPOSAL: 'This idea could not be submitted. Review it and try again.',
  QUESTION_CLOSED: 'This question is no longer accepting proposals.',
  // The server's own wording ("not in this session") reads as a bug to someone
  // whose original was simply taken off the board while they worked on it.
  INVALID_EXTENDS: 'The idea you were building on was removed from the board.',
} as const;

/**
 * Why Propose is waiting on an extension that still matches its original.
 * One sentence for every tool, so the rule reads the same wherever it applies.
 */
export const EXTEND_UNCHANGED_HINT = 'Change something to extend this idea.';

export type ProposalErrorCode = keyof typeof PROPOSAL_ERROR_MESSAGES;

function readStringProperty(value: unknown, property: string): string | null {
  if (typeof value !== 'object' || value === null || !(property in value)) return null;
  const result = (value as Record<string, unknown>)[property];
  return typeof result === 'string' && result.trim() ? result : null;
}

export function proposalErrorMessage(error: unknown): string {
  const code = readStringProperty(error, 'code');
  if (code && code in PROPOSAL_ERROR_MESSAGES) {
    return PROPOSAL_ERROR_MESSAGES[code as ProposalErrorCode];
  }

  const message = readStringProperty(error, 'message');
  return message ?? 'Your idea could not be proposed. Try again.';
}
