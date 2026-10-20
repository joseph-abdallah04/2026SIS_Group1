import { useEffect } from 'react';

/**
 * While `active`, the browser asks before the page is refreshed, closed or
 * left for another address, so unsaved setup work is not lost without a word.
 * Moving within the app is the page's own to ask about (its Cancel and
 * Dashboard do); the new-session page also keeps a copy in this browser.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers ask only when this is set.
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [active]);
}
