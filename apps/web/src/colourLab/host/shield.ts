/**
 * Keeps the lab and the app out of each other's way.
 *
 * The app listens for presses and keys on the whole document, mostly in the
 * capture phase, to close its own popups: an outside press closes the sticky
 * popup, the emoji picker and the card menus, and Escape closes the studio.
 * A press on the lab is "outside" to every one of them, so using the lab would
 * close whatever the colours are being tested on.
 *
 * Two halves. The host element stops events in the bubble phase, which covers
 * every listener that waits for them to arrive (and the app's React root, when
 * the host has been moved inside a dialog). A capture-phase listener runs
 * before the host ever sees the event, so for those the page's
 * `addEventListener` is wrapped, and a listener registered for capture simply
 * does not hear an event that came from the host.
 */

const SHIELDED_EVENTS = new Set([
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'wheel',
  'keydown',
  'keyup',
  'keypress',
  'focusin',
  'focusout',
  'touchstart',
  'touchmove',
  'touchend',
  'paste',
  'copy',
  'cut',
  'dragstart',
]);

/** Events the host stops from leaving it. All of them bubble. */
export const STOPPED_AT_HOST = [
  ...SHIELDED_EVENTS,
  'pointerover',
  'pointerout',
  'mouseover',
  'mouseout',
  'dragover',
  'drop',
] as const;

type Listener = EventListenerOrEventListenerObject;

let host: Element | null = null;
let installed: {
  add: EventTarget['addEventListener'];
  remove: EventTarget['removeEventListener'];
} | null = null;

const wrappers = new WeakMap<object, EventListener>();

const isCapture = (options: boolean | AddEventListenerOptions | EventListenerOptions | undefined) =>
  options === true || (typeof options === 'object' && options !== null && options.capture === true);

function wrap(listener: Listener): EventListener {
  let wrapped = wrappers.get(listener);
  if (!wrapped) {
    wrapped = function (this: unknown, event: Event) {
      // Retargeting makes the host the target of anything that came from inside it.
      if (host !== null && event.target === host) return;
      if (typeof listener === 'function') listener.call(this, event);
      else listener.handleEvent(event);
    };
    wrappers.set(listener, wrapped);
  }
  return wrapped;
}

/** Tells the shield which element is the lab's. */
export function setShieldHost(element: Element | null): void {
  host = element;
}

/**
 * Wraps `addEventListener` and `removeEventListener`. Has to run before the
 * app registers anything, or those listeners are out of its reach; it is
 * imported first for that reason.
 */
export function installShield(): void {
  if (installed) return;
  const proto = EventTarget.prototype;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;
  installed = { add, remove };

  proto.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: Listener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const shield = listener && SHIELDED_EVENTS.has(type) && isCapture(options);
    add.call(this, type, shield ? wrap(listener) : listener, options);
  };
  proto.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: Listener | null,
    options?: boolean | EventListenerOptions,
  ): void {
    const shield = listener && SHIELDED_EVENTS.has(type) && isCapture(options);
    remove.call(this, type, shield ? wrap(listener) : listener, options);
  };
}

/** For tests: put the page's own methods back. */
export function uninstallShield(): void {
  if (!installed) return;
  EventTarget.prototype.addEventListener = installed.add;
  EventTarget.prototype.removeEventListener = installed.remove;
  installed = null;
  host = null;
}

/** Stops the host's events from reaching anything above it. */
export function shieldHost(element: HTMLElement): () => void {
  const stop = (event: Event): void => {
    event.stopPropagation();
    // Escape on a button in the lab must not be a close request to the dialog it sits in.
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') {
      event.preventDefault();
    }
  };
  for (const type of STOPPED_AT_HOST) element.addEventListener(type, stop);
  return () => {
    for (const type of STOPPED_AT_HOST) element.removeEventListener(type, stop);
  };
}
