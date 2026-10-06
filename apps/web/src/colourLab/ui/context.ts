import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

import { type Catalogue } from '../catalogue/types';
import { type ColourEngine, type EngineSnapshot } from '../engine/engine';
import { type SlotView, buildSlotViews } from '../model/views';
import { type LabState, type LabStore } from '../model/store';

export interface LabContextValue {
  store: LabStore;
  engine: ColourEngine;
  catalogue: Catalogue;
}

export const LabContext = createContext<LabContextValue | null>(null);

export function useLab(): LabContextValue {
  const value = useContext(LabContext);
  if (!value) throw new Error('useLab must be used inside the Colour Lab');
  return value;
}

export interface LabView {
  state: LabState;
  snapshot: EngineSnapshot;
  views: SlotView[];
}

/** The lab's state, what the engine has found, and the rows built from both. */
export function useLabView(): LabView {
  const { store, engine, catalogue } = useLab();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const views = useMemo(
    () =>
      buildSlotViews({
        catalogue,
        originals: snapshot.originals,
        defaultLinks: snapshot.defaultLinks,
        liveHex: snapshot.liveHex,
        usage: snapshot.usage,
        usageKnown: snapshot.usageKnown,
        roleUse: snapshot.roleUse,
        scheme: state.scheme,
        edits: state.edits[state.scheme],
      }),
    [catalogue, snapshot, state.edits, state.scheme],
  );
  return { state, snapshot, views };
}
