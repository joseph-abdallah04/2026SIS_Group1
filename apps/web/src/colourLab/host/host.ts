import { setShieldHost, shieldHost } from './shield';
import { TopLayer } from './topLayer';

export interface LabHost {
  /** The element in the page. Everything of the lab's is inside its shadow root. */
  element: HTMLElement;
  /** Where the React root goes. */
  mount: HTMLElement;
  dispose(): void;
}

/**
 * What the page's own styles must not be able to reach, and what the lab must
 * not leave behind. A full-window layer that lets every click through except
 * on the lab's own parts, so it never gets between the page and the pointer.
 */
const HOST_STYLE = [
  'all: initial',
  'position: fixed',
  'inset: 0',
  'width: 100vw',
  'height: 100vh',
  'max-width: none',
  'max-height: none',
  'margin: 0',
  'padding: 0',
  'border: 0',
  'overflow: visible',
  'background: transparent',
  'pointer-events: none',
  'z-index: 2147483647',
].join('; ');

/**
 * Builds the lab's host: a shadow-DOM element that is a popover, so it can be
 * drawn above a modal dialog, and a `role="dialog"`, so the app's own key and
 * wheel handlers (which stand aside for anything inside a dialog) leave it be.
 * Not a `<dialog>`: an open one switches off the app's mic shortcut.
 */
export function createHost(css: string): LabHost {
  const element = document.createElement('div');
  element.id = 'rt-colour-lab';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-label', 'Colour Lab');
  element.setAttribute('popover', 'manual');
  element.style.cssText = HOST_STYLE;

  const shadow = element.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const mount = document.createElement('div');
  mount.className = 'cl-root';
  shadow.append(style, mount);

  // Not the app's focus to take: a press on a button must leave focus where the
  // app had it, so an editor being typed into is not interrupted. Fields are
  // the exception, since they need the focus.
  shadow.addEventListener('mousedown', (event) => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLElement && target.closest('input, textarea, select')) return;
    event.preventDefault();
  });

  document.body.appendChild(element);
  setShieldHost(element);
  const unshield = shieldHost(element);
  const layer = new TopLayer(element);
  layer.start();

  return {
    element,
    mount,
    dispose() {
      layer.stop();
      unshield();
      setShieldHost(null);
      element.remove();
    },
  };
}
