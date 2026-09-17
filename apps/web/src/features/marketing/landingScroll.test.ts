import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrollToLandingHash } from './landingScroll';

describe('scrollToLandingHash', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('scrolls the matching section into view', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const section = document.createElement('section');
    section.id = 'voting';
    document.body.append(section);

    expect(scrollToLandingHash('#voting', 'auto')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('does nothing when the hash is empty or unknown', () => {
    expect(scrollToLandingHash('')).toBe(false);
    expect(scrollToLandingHash('#nope')).toBe(false);
  });
});
