import { type RoleKey } from './roles';
import { type SlotKey } from './slots';

export type Scheme = 'light' | 'dark';

/**
 * What a slot has been told to be.
 *
 *   original   as the app has it, and stop following a default link
 *   custom     a colour chosen with the picker
 *   link       follow another slot, in the same role
 *
 * No spec at all means "do the default": in the light theme, follow the brand
 * token with the same value if there is one and otherwise stay as it is; in the
 * dark theme, whatever the dark palette says.
 */
export type Spec =
  | { kind: 'original' }
  | { kind: 'custom'; hex: string; wash?: Wash }
  | { kind: 'link'; slot: SlotKey };

/**
 * Another colour for when the colour is used thinly. A colour at 5% is a hover wash and at 60% a
 * scrim, and in a dark theme those want opposite colours: ink as a wash is light, as a scrim is
 * dark. Up to and including `upTo` opacity, `hex` is used instead. Only presets make these; the
 * picker writes a plain colour.
 */
export interface Wash {
  upTo: number;
  hex: string;
}

/**
 * A slot's settings in one theme: one for the colour wherever it is used, and
 * optionally one for each role that should differ from it.
 */
export interface SlotEdit {
  base?: Spec;
  roles?: Partial<Record<RoleKey, Spec>>;
}

export type SchemeEdits = Readonly<Record<SlotKey, SlotEdit>>;
