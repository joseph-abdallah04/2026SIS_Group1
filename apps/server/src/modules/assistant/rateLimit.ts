// In-memory sliding window for assistant turns. The user pays their own provider,
// but the server still fetches DuckDuckGo and holds an SSE slot per turn, so a
// tight loop from one account should not run unbounded.
import { ApiError } from '../../middleware/error.js';

const WINDOW_MS = 60_000;

const buckets = new Map<string, number[]>();

/**
 * Records this turn and throws 429 when `userId` has already taken `limit`
 * turns in the last minute. `limit <= 0` disables the check (tests).
 */
export function assertTurnAllowed(userId: string, limit: number, now = Date.now()): void {
  if (limit <= 0) return;

  const cutoff = now - WINDOW_MS;
  const recent = (buckets.get(userId) ?? []).filter((stamp) => stamp > cutoff);
  if (recent.length >= limit) {
    throw new ApiError(
      429,
      'Too many assistant turns in a short time. Wait a moment and try again.',
      'ASSISTANT_RATE_LIMITED',
    );
  }
  recent.push(now);
  buckets.set(userId, recent);
}

/** Test seam — the map lives for the life of the process. */
export function resetTurnLimiter(): void {
  buckets.clear();
}
