import { type Role } from '../catalogue/types';

/**
 * The roles a colour can be set apart in. The same slot is text in one place and
 * a background in another, and wants different values in a dark theme: a gold
 * that is bright enough to read as text is far too bright to put light text on.
 */
export type RoleKey = Exclude<Role, 'other'>;

export const ROLE_KEYS: readonly RoleKey[] = ['text', 'fill', 'border', 'shadow', 'image'];

export const ROLE_LABELS: Readonly<Record<RoleKey, string>> = {
  text: 'Text',
  fill: 'Fill',
  border: 'Border',
  shadow: 'Shadow',
  image: 'Image',
};

export const isRoleKey = (role: Role): role is RoleKey => role !== 'other';
