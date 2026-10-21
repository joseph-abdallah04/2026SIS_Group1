import type { ReactNode } from 'react';

interface AppPageProps {
  /** The bar across the top: it stays where it is while the page scrolls. */
  header: ReactNode;
  children: ReactNode;
}

/**
 * A page under the app's bar, in the setup pages' shell: the bar stays put
 * and only the page below it scrolls, so the scrollbar starts under the bar
 * rather than running past it from the top of the window.
 *
 * `relative` on the scroll area, so whatever is placed absolutely inside it
 * (screen-reader-only labels, menus) is placed in here and scrolls with it,
 * rather than against the page, where it would stretch the page into a second
 * scrollbar. Printing lets go of the frame, so a printout is not cut off at
 * the height of the window.
 */
export function AppPage({ header, children }: AppPageProps) {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-rt-surface text-rt-ink print:block print:h-auto print:overflow-visible">
      {header}
      <div
        data-page-scroll=""
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto print:block print:overflow-visible"
      >
        {children}
      </div>
    </main>
  );
}
