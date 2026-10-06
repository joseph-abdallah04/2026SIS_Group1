/**
 * Colour Lab: the entry point. Imported first by main.tsx.
 *
 * Dev tooling for the colour-testing branch, which never merges to main. It
 * starts only under `vite dev`, adds one element to the page, and changes
 * nothing else in the app. Two switches for when something looks wrong:
 *   ?colourLab=off         does not start
 *   ?colourLabShield=off   starts, without wrapping addEventListener
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { initialCatalogue, watchCatalogue } from './catalogue/client';
import { ColourEngine } from './engine/engine';
import { createHost } from './host/host';
import { installShield } from './host/shield';
import { LabStore, STORAGE_KEY } from './model/store';
import { ColourLab } from './ui/ColourLab';
import css from './ui/colourLab.css?inline';

const params = new URLSearchParams(window.location.search);

function start(): void {
  const store = new LabStore();
  const host = createHost(css);
  const engine = new ColourEngine(store, document, (node) => host.element.contains(node));
  engine.start();

  createRoot(host.mount).render(
    createElement(ColourLab, {
      store,
      engine,
      catalogue: { initial: initialCatalogue, watch: watchCatalogue },
    }),
  );

  // Another tab's edits, and what is left unsaved when this one goes.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) store.syncEdits();
  });
  window.addEventListener('pagehide', () => store.flush());

  // For driving the lab from a script, and from the console.
  (window as unknown as { __colourLab: unknown }).__colourLab = { store, engine, host };
}

if (import.meta.env.DEV && params.get('colourLab') !== 'off') {
  // Before the app registers a single listener, or those are out of its reach.
  if (params.get('colourLabShield') !== 'off') installShield();

  // The app's stylesheets are added as its modules run, which is before this.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
