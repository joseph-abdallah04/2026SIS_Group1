import { afterEach, describe, expect, it, vi } from 'vitest';

import { installShield, setShieldHost, shieldHost, uninstallShield } from './shield';

/** A host with something inside its shadow root, as the lab has. */
function labHost() {
  const host = document.createElement('div');
  const inner = document.createElement('button');
  host.attachShadow({ mode: 'open' }).append(inner);
  document.body.append(host);
  return { host, inner };
}

const fromInside = (inner: Element, type = 'pointerdown') =>
  inner.dispatchEvent(new Event(type, { bubbles: true, composed: true, cancelable: true }));

afterEach(() => {
  uninstallShield();
  document.body.innerHTML = '';
});

describe('installShield', () => {
  it('keeps an event from the lab away from a capture-phase listener', () => {
    installShield();
    const { host, inner } = labHost();
    setShieldHost(host);
    const capture = vi.fn();
    document.addEventListener('pointerdown', capture, true);

    fromInside(inner);
    expect(capture).not.toHaveBeenCalled();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('leaves bubble-phase listeners to the host, which stops those itself', () => {
    installShield();
    const { host, inner } = labHost();
    setShieldHost(host);
    const bubble = vi.fn();
    document.addEventListener('pointerdown', bubble);
    fromInside(inner);
    expect(bubble).toHaveBeenCalledTimes(1);
  });

  it('works for a listener object, with the right this', () => {
    installShield();
    const { host, inner } = labHost();
    setShieldHost(host);
    const handleEvent = vi.fn();
    document.addEventListener('keydown', { handleEvent }, { capture: true });
    fromInside(inner, 'keydown');
    expect(handleEvent).not.toHaveBeenCalled();
    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    expect(handleEvent).toHaveBeenCalledTimes(1);
  });

  it('removes a capture listener it wrapped', () => {
    installShield();
    const listener = vi.fn();
    document.addEventListener('click', listener, true);
    document.removeEventListener('click', listener, true);
    document.body.dispatchEvent(new Event('click', { bubbles: true }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not stop an event that is not about to be shielded', () => {
    installShield();
    const { host, inner } = labHost();
    setShieldHost(host);
    const listener = vi.fn();
    document.addEventListener('transitionend', listener, true);
    fromInside(inner, 'transitionend');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is safe to install twice, and to take away', () => {
    const before = EventTarget.prototype.addEventListener;
    installShield();
    const wrapped = EventTarget.prototype.addEventListener;
    installShield();
    expect(EventTarget.prototype.addEventListener).toBe(wrapped);
    uninstallShield();
    expect(EventTarget.prototype.addEventListener).toBe(before);
  });

  it('honours once', () => {
    installShield();
    const listener = vi.fn();
    document.addEventListener('mousedown', listener, { capture: true, once: true });
    document.body.dispatchEvent(new Event('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new Event('mousedown', { bubbles: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('shieldHost', () => {
  it('stops an event at the host so nothing above it hears it', () => {
    const { host, inner } = labHost();
    shieldHost(host);
    const above = vi.fn();
    document.body.addEventListener('click', above);
    fromInside(inner, 'click');
    expect(above).not.toHaveBeenCalled();
  });

  it('lets an event reach everything inside the host first', () => {
    const { host, inner } = labHost();
    shieldHost(host);
    const inside = vi.fn();
    host.shadowRoot?.addEventListener('click', inside);
    fromInside(inner, 'click');
    expect(inside).toHaveBeenCalledTimes(1);
  });

  it('turns Escape into a key nothing may act on', () => {
    const { host, inner } = labHost();
    shieldHost(host);
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    inner.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);

    const other = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    inner.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('stops listening when told to', () => {
    const { host, inner } = labHost();
    const stop = shieldHost(host);
    stop();
    const above = vi.fn();
    document.body.addEventListener('click', above);
    fromInside(inner, 'click');
    expect(above).toHaveBeenCalledTimes(1);
  });
});
