import { type Rgb } from '../colour/convert';
import { customSpec, type Scheme } from './resolve';
import { type RoleKey } from './roles';
import { type LabStore } from './store';
import { type SlotView } from './views';

/**
 * The colour chosen in the picker, for the colour overall or for one role of it.
 * A copy that was following a token stops following it.
 */
export function pickColour(
  store: LabStore,
  scheme: Scheme,
  view: SlotView,
  rgb: Rgb,
  role?: RoleKey,
): void {
  store.setSpec(scheme, view.key, customSpec(rgb), role);
}

/**
 * Back to what the slot is with nothing set: the app's colour in the light
 * theme, the dark palette's in the dark one. Clearing the setting is not enough
 * for a copy whose token has been changed, since it would go back to following
 * it: that one is told to stay as it was.
 */
export function restoreDefault(
  store: LabStore,
  scheme: Scheme,
  view: SlotView,
  followedIsChanged: boolean,
  role?: RoleKey,
): void {
  if (role) {
    store.setSpec(scheme, view.key, null, role);
    return;
  }
  const staysPut = view.link !== null && followedIsChanged;
  if (!staysPut) {
    store.clearSlot(scheme, view.key);
    return;
  }
  store.setSpec(
    scheme,
    view.key,
    scheme === 'light' ? { kind: 'original' } : customSpec(view.baseline),
  );
  // A setting for one role would still name a colour of its own: a reset is all of it.
  for (const key of Object.keys(view.own?.roles ?? {}) as RoleKey[]) {
    store.setSpec(scheme, view.key, null, key);
  }
}

/** Stop following the token it was matched to, keeping the colour it has now. */
export function unlinkSlot(store: LabStore, scheme: Scheme, view: SlotView): void {
  const frozen = view.changed
    ? customSpec(view.current)
    : scheme === 'light'
      ? { kind: 'original' as const }
      : customSpec(view.baseline);
  store.setSpec(scheme, view.key, frozen);
}

/** Follow the token it was matched to again. */
export function relinkSlot(store: LabStore, scheme: Scheme, view: SlotView): void {
  store.setSpec(scheme, view.key, null);
}
