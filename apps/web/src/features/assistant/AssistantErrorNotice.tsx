// One failed turn, said plainly: what went wrong, what to do about it, and a code to quote.
//
// The words come from `ASSISTANT_ERRORS` by code, not from whatever the provider said —
// that used to be the whole bubble, and it read like
// "'messages.2' : for 'role:assistant' the following must be satisfied…". The provider's
// words are still here, one click away under Details, because they are what someone
// debugging the provider needs.
import { ASSISTANT_ERRORS, isAssistantErrorCode } from '@roundtable/shared';

export interface AssistantErrorNoticeProps {
  /** Shown only when the code is missing or unknown to this build. */
  message: string;
  code?: string;
  detail?: string;
  /** Cards the same turn produced before it failed. */
  cardsAbove?: number;
}

export function AssistantErrorNotice({
  message,
  code,
  detail,
  cardsAbove = 0,
}: AssistantErrorNoticeProps) {
  const known = isAssistantErrorCode(code) ? ASSISTANT_ERRORS[code] : null;

  return (
    <div className="rt-assistant-error" data-error-code={code}>
      <p className="rt-assistant-error-title">{known?.title ?? 'Something went wrong'}</p>
      {cardsAbove > 0 && <p className="rt-assistant-error-note">{cardsNote(cardsAbove)}</p>}
      <p className="rt-assistant-error-hint">{known?.hint ?? message}</p>
      {code && (
        <p className="rt-assistant-error-code-line">
          Error code <code className="rt-assistant-error-code">{code}</code>
        </p>
      )}
      {detail && (
        <details className="rt-assistant-error-details">
          <summary>Details</summary>
          <p>{detail}</p>
        </details>
      )}
    </div>
  );
}

/** The tool already worked; only what came after it failed. */
function cardsNote(cards: number): string {
  return cards === 1
    ? 'The card above is complete. Only the reply after it failed.'
    : `The ${cards} cards above are complete. Only the reply after them failed.`;
}
