import { ensureReadStateStoreForAccount } from '@/store/read-state';
import { ensureNotificationsStoreForAccount } from '@/store/notifications';
import { ensureDMStoreForAccount } from '@/store/chat/dm';
import { ensureModerationStoreForAccount } from '@/store/moderation';
import { ensureHintsStoreForAccount } from '@/store/hints';
import { ensureChannelPrefsStoreForAccount } from '@/store/chat/channel-prefs';

/** Every persisted account store is switched together before sync begins. */
const PER_ACCOUNT_STORES = [
  ensureReadStateStoreForAccount,
  ensureNotificationsStoreForAccount,
  ensureDMStoreForAccount,
  ensureModerationStoreForAccount,
  // Without this, a second account on the same device inherits the first
  // one's "already seen" and gets explained nothing.
  ensureHintsStoreForAccount,
  // Channel right-click prefs (mute / follow / notify level).
  ensureChannelPrefsStoreForAccount,
] as const;

export function ensureReadStateAccount(pubkey: string): void {
  for (const ensure of PER_ACCOUNT_STORES) ensure(pubkey);
}
