import { useEffect, useLayoutEffect, useState } from 'react';

import {
  activityHoldsEqual,
  assistantActivityLabel,
  nextHeldActivity,
  turnToolActivityLabel,
  type ActivityHold,
} from './assistantActivity';
import type { ChatEntry } from './useAssistantChat';

export function AgentActivity({
  entries,
  streaming,
  thinking,
}: {
  entries: ChatEntry[];
  streaming: boolean;
  thinking: boolean;
}) {
  const desired = assistantActivityLabel(entries, streaming, thinking);
  const fallback = turnToolActivityLabel(entries);
  const [hold, setHold] = useState<ActivityHold | null>(null);
  const [, setTick] = useState(0);

  const { shown, hold: nextHold } = nextHeldActivity(
    desired,
    fallback,
    streaming,
    Date.now(),
    hold,
  );

  useLayoutEffect(() => {
    setHold((prev) => (activityHoldsEqual(prev, nextHold) ? prev : nextHold));
  }, [nextHold, nextHold?.label, nextHold?.until]);

  useEffect(() => {
    if (!nextHold) return;
    const wait = nextHold.until - Date.now();
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setTick((n) => n + 1), wait);
    return () => window.clearTimeout(timer);
  }, [nextHold?.label, nextHold?.until]);

  if (!shown) return null;

  return (
    <p className="rt-assistant-activity" aria-live="polite">
      <span className="rt-assistant-activity-label">{shown}</span>
    </p>
  );
}
