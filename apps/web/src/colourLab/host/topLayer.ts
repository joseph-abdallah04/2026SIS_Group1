/**
 * Keeps the lab above everything, including a modal dialog.
 *
 * The studio opens as a modal `<dialog>`, which makes the rest of the page
 * inert: nothing outside it can be clicked, and the lab, sitting in `<body>`,
 * would be dead exactly when the colours need testing there. A top-layer
 * popover in `<body>` is no better: it is drawn above the dialog but is still
 * outside it, so it is still inert.
 *
 * So the host is moved into whichever modal dialog is on top, which makes it
 * part of what is interactive, and is shown as a popover so it is drawn above
 * the dialog's own content and is not clipped by the dialog's overflow or
 * transform. With no modal open it goes back to `<body>`.
 *
 * A dialog that is closed and reopened (the studio does this to step aside for
 * the board and to come back) goes above the popover again, so the popover is
 * shown afresh each time anything about a dialog changes.
 */
export class TopLayer {
  private observer: MutationObserver | null = null;
  private readonly order = new Map<HTMLDialogElement, number>();
  private counter = 0;

  constructor(private readonly host: HTMLElement) {}

  start(): void {
    this.sync();
    this.observer = new MutationObserver((records) => {
      if (records.some((record) => this.concernsDialogs(record))) this.sync();
    });
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private concernsDialogs(record: MutationRecord): boolean {
    if (record.type === 'attributes') return record.target instanceof HTMLDialogElement;
    const involves = (node: Node): boolean =>
      node !== this.host &&
      node instanceof Element &&
      (node instanceof HTMLDialogElement || node.querySelector('dialog') !== null);
    return [...record.addedNodes, ...record.removedNodes].some(involves);
  }

  private modalDialogs(): HTMLDialogElement[] {
    return Array.from(document.querySelectorAll('dialog')).filter((dialog) => {
      try {
        return dialog.matches(':modal');
      } catch {
        return false;
      }
    });
  }

  /** Moves the host to where it can be used and puts it back on top. */
  sync(): void {
    const modals = this.modalDialogs();
    for (const dialog of [...this.order.keys()]) {
      if (!modals.includes(dialog)) this.order.delete(dialog);
    }
    for (const dialog of modals) {
      if (!this.order.has(dialog)) this.order.set(dialog, ++this.counter);
    }
    // The one opened last is on top, and it is the one that decides what is inert.
    const top = modals.reduce<HTMLDialogElement | null>(
      (best, dialog) =>
        best === null || (this.order.get(dialog) ?? 0) > (this.order.get(best) ?? 0)
          ? dialog
          : best,
      null,
    );
    const target: HTMLElement = top ?? document.body;
    if (this.host.parentElement !== target) target.appendChild(this.host);
    this.raise();
  }

  private raise(): void {
    if (typeof this.host.showPopover !== 'function') return;
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover();
      this.host.showPopover();
    } catch {
      // Not connected yet, or the browser has no popover support: the host
      // keeps its own z-index and still works anywhere outside a modal.
    }
  }
}
