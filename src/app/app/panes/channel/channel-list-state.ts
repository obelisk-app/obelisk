import type { JsGroup, JsMessage, MessagesStatus } from '@/services/nostr-bridge';

export type ChannelEmptyStage = 'loading-info' | 'loading-messages' | 'welcome' | 'not-visible';

/**
 * Which of the empty-channel states to show. Without the status-gated split,
 * a freshly-opened channel briefly renders "No messages yet" while history
 * is still streaming, confusing for an active relay.
 *   1. group missing + 39000 EOSE not yet:                          loading
 *   2. group missing + 39000 EOSE + missing-grace passed:           not visible
 *   3. group present + status === 'loading' | 'empty-unconfirmed':  loading
 *   4. group present + status === 'empty-confirmed':                welcome
 */
export function channelEmptyStage({
  group, messagesStatus, groupMetadataEose, channelMissingGrace, metadataFetchDone,
}: {
  group: JsGroup | null | undefined;
  messagesStatus: MessagesStatus;
  groupMetadataEose: boolean;
  channelMissingGrace: boolean;
  metadataFetchDone: boolean;
}): ChannelEmptyStage {
  // Trust the bridge's confidence enum: it has already run a
  // retry ladder against auth-gated / silent-filtering relays
  // before reaching `empty-confirmed`. No UI dwell timer
  // needed on this branch.
  const groupKnownEmpty = group && messagesStatus === 'empty-confirmed';
  // Never declare a channel "missing" until the focused
  // metadataFetch has had its chance, AND the global stream has
  // EOSE'd, AND the missing-grace window has passed. Three
  // gates so the user never sees "not visible" on a channel
  // the relay still hasn't been asked about properly.
  const channelKnownMissing =
    !group && groupMetadataEose && channelMissingGrace && metadataFetchDone;
  if (!groupKnownEmpty && !channelKnownMissing) {
    // Split by which tier we're still waiting on:
    //   - !group → kind 39000 hasn't ingested this groupId yet
    //   - group && status !== 'empty-confirmed' → kind 9 still
    //     loading or in the retry ladder
    return !group ? 'loading-info' : 'loading-messages';
  }
  return group ? 'welcome' : 'not-visible';
}

/** A message folds under the one before it: same author, within five minutes. */
export function isGroupedWith(prev: JsMessage | undefined, m: JsMessage): boolean {
  return !!(prev && prev.pubkey === m.pubkey && m.createdAt - prev.createdAt < 300);
}
