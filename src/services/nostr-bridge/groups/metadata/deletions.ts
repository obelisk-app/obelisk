/** Accepted NIP-29 deletion requests are authoritative on their originating relay. */
import { verifyEvent, type Event as NostrEvent } from 'nostr-tools';
import { BoundedSet } from '@nostr-wot/relay/hub';
import { KIND_GROUP_DELETE, KIND_GROUP_METADATA, KIND_GROUP_CHAT_MESSAGE, KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS, KIND_GROUP_CREATE, KIND_REACTION } from '@/constants/nostr/nip-kinds';
import { MAX_TOMBSTONES } from '@/constants/nostr-bridge/groups';
import { cacheDelete, cacheGet, cacheSet } from '../../cache/cache';
import { getTag } from '../../common/event-tags';

export class GroupDeletions {
  private readonly deleted = new BoundedSet<string>(MAX_TOMBSTONES);

  has(groupId: string): boolean { return this.deleted.has(groupId); }

  ingest(relay: string, ev: NostrEvent): string | null {
    if (ev.kind !== KIND_GROUP_DELETE || !verifyEvent(ev)) return null;
    const groupId = getTag(ev, 'h');
    if (!groupId) return null;
    this.deleted.add(groupId);
    cacheSet(relay, KIND_GROUP_DELETE, groupId, true);
    for (const kind of [KIND_GROUP_METADATA, KIND_GROUP_CHAT_MESSAGE, KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS, KIND_GROUP_CREATE, KIND_REACTION]) {
      cacheDelete(relay, kind, groupId);
    }
    return groupId;
  }

  seed(relay: string, ids: readonly string[]): void {
    for (const id of ids) if (cacheGet<boolean>(relay, KIND_GROUP_DELETE, id)?.value) this.deleted.add(id);
  }

  clear(): void { this.deleted.clear(); }
}
