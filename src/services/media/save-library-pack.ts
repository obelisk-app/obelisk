import { getBridge, getBridgeImpl } from '@/services/nostr-bridge';
import { publishRelayEmojiSet, relayEmojiRevision } from '@/services/relay/relay-emojis';
import { fetchRelayInfo, operatorPubkeyFromRelayInfo } from '@/services/relay/relay-info';
import type { EditablePack } from '@/types/media/library';
import type { RelayEmojiSet } from '@/services/relay/relay-emojis';
import { CodedError } from '@/utils/errors/codes';

const pending = new Set<string>();

/** Save only to the account/relay captured by the draft, after checking its revision. */
export async function saveLibraryPack(draft: EditablePack, server?: RelayEmojiSet): Promise<void> {
  await getBridge();
  const bridge = getBridgeImpl();
  const author = bridge?.myPubkey.get();
  if (!bridge || !author || author !== draft.owner) throw new CodedError('media-account-changed', 'media-account-changed');
  const address = `30030:${author}:${draft.identifier}`;
  const key = draft.serverRelay ?? address;
  if (pending.has(key)) throw new CodedError('media-pending', 'media-pending');
  pending.add(key);
  try {
    if (draft.serverRelay) {
      const relay = draft.serverRelay;
      const operator = operatorPubkeyFromRelayInfo(await fetchRelayInfo(relay));
      if (bridge.myPubkey.get() !== author || operator !== author || bridge.currentRelayUrl.get() !== relay) {
        throw new CodedError('media-permission', 'media-permission');
      }
      if (!server || relayEmojiRevision(relay) !== (draft.baseCreatedAt ?? 0)) throw new CodedError('media-stale', 'media-stale');
      await publishRelayEmojiSet(relay, { ...server, title: draft.title, emojis: draft.items, packAddresses: [] });
    } else {
      const latest = bridge.mediaPacks.get()[address];
      if ((latest?.createdAt ?? 0) !== (draft.baseCreatedAt ?? 0)) throw new CodedError('media-stale', 'media-stale');
      await bridge.saveMediaPack(draft);
    }
  } finally {
    pending.delete(key);
  }
}
