/**
 * Which discovery hints this account has already seen.
 *
 * A fresh account lands on an empty shell and is left to guess what a relay
 * is, what the feed covers, or where its identity lives. Rather than a tour
 * that demands attention up front, each surface explains itself the first
 * time you reach it: the control carries a dot, and a small callout says in
 * one line what the thing is. Once seen — or once used — it never returns.
 *
 * "Seen" is the whole state, and it has to be reactive: the dot on a control
 * disappears the moment its hint is dismissed, wherever that control is
 * rendered.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/lib/quota-safe-storage';
import { createEnsureForAccount } from './multi-account';

interface HintsState {
  seen: string[];
  /** Hints are off entirely — the "don't show tips" escape hatch. */
  muted: boolean;
  isSeen: (id: string) => boolean;
  markSeen: (id: string) => void;
  /** Stop showing hints without marking every id, so a later reset restores them. */
  muteHints: () => void;
  /** "Show tips again" — back to a brand-new account's state. */
  resetHints: () => void;
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
    },
  ),
);

const swapAccount = createEnsureForAccount('obelisk:hints', useHintsStore);

let activePubkey: string | null = null;

/**
 * Multi-account isolation — swaps the persist key to
 * `obelisk:hints:{pubkey}`. Without it, logging into a second account on the
 * same device would inherit the first one's "already seen" and explain
 * nothing to someone who has never used the app.
 *
 * The explicit clear is load-bearing: zustand's `rehydrate()` merges what it
 * finds, so switching to an account with nothing stored leaves the previous
 * account's state in memory — which is exactly the inheritance this is meant
 * to prevent, and only for the account that most needs the hints.
 */
export function ensureHintsStoreForAccount(myPubkey: string): void {
  if (activePubkey === myPubkey) return;
  activePubkey = myPubkey;
  useHintsStore.setState({ seen: [], muted: false });
  swapAccount(myPubkey);
}
