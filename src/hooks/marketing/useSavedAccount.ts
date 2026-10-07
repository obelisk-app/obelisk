/**
 * The signed-in look of the marketing pages, read from what the app saved in
 * this browser, without loading the Nostr bridge.
 *
 * The landing page only needs to know "is someone signed in here, and what is
 * their name and picture". The bridge answers that by connecting to relays,
 * which made every visitor to the marketing site download it. The app already
 * keeps both facts in storage: the session record (`obelisk-dex/session`) and
 * the kind 0 profile cache. Reading them is enough
 * (`src/services/marketing/saved-account.ts`).
 */
import { useSyncExternalStore } from 'react';
import {
  savedAccountSnapshot,
  serverSavedAccountSnapshot,
  subscribeSavedAccount,
} from '@/services/marketing/saved-account';
import type { SavedAccount } from '@/utils/marketing/saved-account';

/**
 * The account saved in this browser, or null. Null on the server and in the
 * first client render, so the server HTML and hydration agree.
 */
export function useSavedAccount(): SavedAccount | null {
  return useSyncExternalStore(subscribeSavedAccount, savedAccountSnapshot, serverSavedAccountSnapshot);
}
