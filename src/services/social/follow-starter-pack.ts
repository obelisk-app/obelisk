import type { Event as NostrEvent } from 'nostr-tools';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { mergedFollowTags, type StarterPack } from '@/services/social/starter-packs';
import { useToastStore } from '@/store/feedback/toast';
import type { Translate } from '@/i18n/keys';
import { KIND_CONTACT_LIST } from '@/utils/nostr/nip-kinds';

/**
 * Follow everyone in a pack with one kind 3, then say how it went.
 *
 * One merged contact list, not one write per member: follows are a single
 * replaceable event, so a per-person loop would race itself and end with
 * whichever write landed last, i.e. one follow. The merge keeps the tags and
 * content other clients wrote (relay hints, petnames), and the new list is
 * dated after the one it replaces so relays take it.
 */
export async function followStarterPack({
  bridge,
  contactEvent,
  pack,
  relays,
  t,
  now = Date.now(),
}: {
  bridge: Pick<BridgeImpl, 'publishEvent'>;
  contactEvent: NostrEvent | null;
  pack: StarterPack;
  relays: readonly string[];
  t: Translate;
  now?: number;
}): Promise<void> {
  const toast = (title: string) => useToastStore.getState().pushToast({ title, body: pack.title });
  try {
    await bridge.publishEvent({
      kind: KIND_CONTACT_LIST,
      content: contactEvent?.content ?? '',
      tags: mergedFollowTags(contactEvent?.tags ?? [], pack.members),
      created_at: Math.max(Math.floor(now / 1000), (contactEvent?.created_at ?? 0) + 1),
    }, { extraRelays: relays, mode: 'replace' });
    toast(t('social.packFollowed'));
  } catch {
    toast(t('social.actionFailed'));
  }
}
