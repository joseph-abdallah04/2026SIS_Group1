import initial from 'virtual:colour-lab/catalogue';

import { type Catalogue } from './types';

/** The catalogue as it was when the page loaded. */
export const initialCatalogue: Catalogue = initial;

/** Matches CATALOGUE_EVENT in the plugin, which this file cannot import without pulling in Node. */
const EVENT = 'colour-lab:catalogue';

/** Calls back with a fresh catalogue whenever a source file changes. Returns how to stop. */
export function watchCatalogue(onUpdate: (catalogue: Catalogue) => void): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => undefined;
  hot.on(EVENT, onUpdate);
  return () => hot.off(EVENT, onUpdate);
}
