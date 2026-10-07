/**
 * The rows of the Stacker key-binding panel: every bindable action in the
 * panel's order, the keys bound to it with the legend a person recognises,
 * and whether the panel is listening for a new key for it.
 */
import { BINDABLE, keyLabel, keysFor, type BindableAction, type KeyMap } from '@/lib/games/stacker/keymap';

export interface KeyRow {
  action: BindableAction;
  keys: Array<{ code: string; label: string }>;
  listening: boolean;
}

/**
 * `spaceLabel` words the space bar, which has no legend of its own and so is
 * the one key the panel names in the reader's language.
 */
export function keyRows(map: KeyMap, listening: BindableAction | null, spaceLabel: string): KeyRow[] {
  return BINDABLE.map(({ action }) => ({
    action,
    keys: keysFor(map, action).map((code) => ({ code, label: code === 'Space' ? spaceLabel : keyLabel(code) })),
    listening: listening === action,
  }));
}
