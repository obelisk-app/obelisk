/**
 * Which discovery hints this account has already seen.
 *
 * A fresh account lands on an empty shell and is left to guess what a relay
 * is, what the feed covers, or where its identity lives. Rather than a tour
 * that demands attention up front, each surface explains itself the first
 * time you reach it: the control carries a dot, and a small callout says in
 * one line what the thing is. Once seen, or once used, it never returns.
 *
 * "Seen" is the whole state, and it has to be reactive: the dot on a control
 * disappears the moment its hint is dismissed, wherever that control is
 * rendered.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/services/common/quota-safe-storage';
import { createEnsureForAccount } from '../common/multi-account';
import { stringArray, versionedPersist } from '../common/persist-version';

interface HintsState {
  seen: string[];
  /** Hints are off entirely: the "don't show tips" escape hatch. */
  muted: boolean;
  isSeen: (id: string) => boolean;
  markSeen: (id: string) => void;
  /** Stop showing hints without marking every id, so a later reset restores them. */
  muteHints: () => void;
  /** "Show tips again": back to a brand-new account's state. */
  resetHints: () => void;
}

type HintsPersisted = Pick<HintsState, 'seen' | 'muted'>;

/** Saved-shape version. 0: before versioning, same fields. */
export const HINTS_STORE_VERSION = 1;

export function sanitizeHintsPersisted(raw: Record<string, unknown>): HintsPersisted {
  return { seen: stringArray(raw.seen), muted: raw.muted === true };
}

export const useHintsStore = create<HintsState>()(
  persist(
    (set, get) => ({
      seen: [],
      muted: false,
      isSeen: (id) => get().seen.includes(id),
      markSeen: (id) => {
        const { seen } = get();
        if (seen.includes(id)) return;
        set({ seen: [...seen, id] });
      },
      muteHints: () => set({ muted: true }),
      resetHints: () => set({ seen: [], muted: false }),
    }),
    {
      name: 'obelisk:hints',
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (s): HintsPersisted => ({ seen: s.seen, muted: s.muted }),
      ...versionedPersist<HintsState, HintsPersisted>({
        version: HINTS_STORE_VERSION,
        sanitize: sanitizeHintsPersisted,
      }),
    },
  ),
);

/**
 * Multi-account isolation: swaps the persist key to
 * `obelisk:hints:{pubkey}`. Without it, logging into a second account on the
 * same device would inherit the first one's "already seen" and explain
 * nothing to someone who has never used the app.
 *
 * The account that most needs the hints is the one with nothing stored yet,
 * which is exactly the case zustand's merging `rehydrate()` gets wrong. The
 * factory owns that fix (see `multi-account.ts`); this store used to carry
 * its own `setState` clear, which also wiped the OUTGOING account's saved
 * hints on every switch because `persist` writes every `setState` through.
 */
export const ensureHintsStoreForAccount = createEnsureForAccount('obelisk:hints', useHintsStore);
