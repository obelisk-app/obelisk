/**
 * The storage the `@nostr-wot/ui` login widget gets in Obelisk: memory only.
 *
 * Left to its default (`localStorageSignerStorage`), the widget writes the
 * NIP-46 pairing record, with the client nsec the bunker authorised, to
 * `localStorage` in plain text on every bunker or QR login, and a pasted or
 * generated nsec when its "Remember on this device" box is ticked. Obelisk
 * never reads either: the bridge owns persistence and seals what it keeps
 * (`src/services/nostr-bridge/session/persistence.ts`).
 *
 * In memory the widget can still reuse a pairing key within the page, which
 * is all its QR retry needs. A "remembered" nsec is dropped outright, so the
 * checkbox (hidden by CSS in `globals.css`) can keep nothing even if ticked.
 */
import { SIGNER_STORAGE_KEY_NSEC, type SignerStorage } from '@nostr-wot/ui';

export function createMemorySignerStorage(): SignerStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      if (key === SIGNER_STORAGE_KEY_NSEC) return;
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** One per page, so the widget's pairing key survives the QR retry remount. */
export const loginSignerStorage = createMemorySignerStorage();
