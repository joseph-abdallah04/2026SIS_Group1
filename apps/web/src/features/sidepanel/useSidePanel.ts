import { useCallback, useMemo, useRef, useState } from 'react';

/** The side panel's features, in the order its strip lists them. */
export type SidePanelTab = 'people' | 'chat' | 'assistant';

export interface SidePanelControl {
  /** The feature on show, or null while the panel is closed to its strip. */
  tab: SidePanelTab | null;
  /** Show this feature, opening the panel if it is closed. */
  open: (tab: SidePanelTab) => void;
  /** A strip button: show its feature, or close the panel if it already is. */
  toggle: (tab: SidePanelTab) => void;
  close: () => void;
  /**
   * The rail's own open/close, for its collapse button and its resize drag:
   * close, or bring back whichever feature was last on show.
   */
  toggleOpen: () => void;
}

/**
 * Which of the side panel's features is showing.
 *
 * Held by the session page rather than the panel, so things outside it can
 * open a feature directly: the header's people snapshot opens People.
 */
export function useSidePanel(): SidePanelControl {
  const [tab, setTab] = useState<SidePanelTab | null>(null);
  // What a drag back out after a drag-close reopens. People until anything
  // else has been shown, since it is the strip's first button.
  const lastTab = useRef<SidePanelTab>('people');

  const open = useCallback((next: SidePanelTab) => {
    lastTab.current = next;
    setTab(next);
  }, []);

  const toggle = useCallback((next: SidePanelTab) => {
    lastTab.current = next;
    setTab((current) => (current === next ? null : next));
  }, []);

  const close = useCallback(() => setTab(null), []);

  const toggleOpen = useCallback(() => {
    setTab((current) => (current === null ? lastTab.current : null));
  }, []);

  return useMemo(
    () => ({ tab, open, toggle, close, toggleOpen }),
    [tab, open, toggle, close, toggleOpen],
  );
}
