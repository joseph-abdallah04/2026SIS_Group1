// Quoted data from the user, the board, or the web. Models follow instructions they
// find in tool results and history as readily as they follow the system prompt, so
// anything we did not write ourselves is wrapped before it reaches them.

const TAG = 'untrusted';

/** Strips a nested fence so user text cannot close the wrapper early. */
function stripFences(text: string): string {
  return text.replace(/<\/?untrusted\b[^>]*>/gi, '');
}

/** Inline quoted span — agenda lines, selected-card summaries. */
export function quoteUntrusted(text: string): string {
  return `<${TAG}>${stripFences(text)}</${TAG}>`;
}

/** Multi-line quoted block — search results, look_up_session, the chat recap. */
export function quoteUntrustedBlock(source: string, text: string): string {
  const safeSource = source.replace(/[^a-z0-9_-]/gi, '');
  return `<${TAG} source="${safeSource}">\n${stripFences(text)}\n</${TAG}>`;
}
