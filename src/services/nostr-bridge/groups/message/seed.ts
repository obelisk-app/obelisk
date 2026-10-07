/**
 * Messages from the stale-while-revalidate cache (round 4 plan, step 17):
 * the relay-wide paint `seed.ts` runs on login, reload and relay switch, and
 * the one-channel paint a channel open or a restart runs. Pure move from
 * `client.ts` (`seedCacheForRelay`'s message block, `seedCachedMessagesForGroup`).
 */
import { KIND_GROUP_CHAT_MESSAGE, KIND_GROUP_METADATA } from '@/utils/nostr/nip-kinds';
import { cacheGet } from '../../cache/cache';
import type { StateStore } from '../../common/state-store';
import type { JsGroup, JsMessage, MessagesStatus } from '../../common/types';

export interface MessageSeedStores {
  readonly groups: StateStore<JsGroup[]>;
  readonly messagesByGroup: StateStore<Record<string, JsMessage[]>>;
  readonly messagesStatusByGroup: StateStore<Record<string, MessagesStatus>>;
  /** Write a status only if it changed (`MessageStatusModule.set`). */
  setStatus(groupId: string, status: MessagesStatus): void;
}

/**
 * Paint every cached channel the store does not hold yet, skipping hidden
 * groups. True when anything renderable was painted.
 */
export function seedMessagesFromCache(
  stores: MessageSeedStores,
  relay: string,
  hiddenGroupIds: ReadonlySet<string>,
  idsFor: (kind: number) => string[],
): boolean {
  let hasRenderableCache = false;
  const currentMessages = stores.messagesByGroup.get();
  const cachedMessages: Record<string, JsMessage[]> = {};
  for (const groupId of idsFor(KIND_GROUP_CHAT_MESSAGE)) {
    if (hiddenGroupIds.has(groupId)) continue;
    if ((currentMessages[groupId]?.length ?? 0) > 0) continue;
    const entry = cacheGet<JsMessage[]>(relay, KIND_GROUP_CHAT_MESSAGE, groupId);
    if (!entry || entry.value.length === 0) continue;
    cachedMessages[groupId] = entry.value.map((message) => ({
      ...message,
      mentions: message.mentions ?? [],
      customEmojis: message.customEmojis ?? {},
    }));
    hasRenderableCache = true;
  }
  if (Object.keys(cachedMessages).length > 0) {
    stores.messagesByGroup.update((prev) => {
      const next = { ...prev };
      for (const [groupId, messages] of Object.entries(cachedMessages)) {
        if ((prev[groupId]?.length ?? 0) === 0) next[groupId] = messages;
      }
      return next;
    });
    stores.messagesStatusByGroup.update((prev) => {
      const next = { ...prev };
      for (const groupId of Object.keys(cachedMessages)) next[groupId] = "has-messages";
      return next;
    });
  }
  return hasRenderableCache;
}

/** Paint one channel from the cache unless it is hidden and unknown, or already painted. */
export function seedCachedMessagesForGroup(stores: MessageSeedStores, relay: string, groupId: string): boolean {
  const cachedGroup = cacheGet<{ group: JsGroup }>(relay, KIND_GROUP_METADATA, groupId)?.value.group;
  const hidden = cachedGroup && (cachedGroup.isHidden ?? !cachedGroup.isPublic);
  if (hidden && !stores.groups.get().some((group) => group.id === groupId)) return false;
  const existing = stores.messagesByGroup.get()[groupId];
  if (existing && existing.length > 0) {
    stores.setStatus(groupId, 'has-messages');
    return true;
  }
  const entry = cacheGet<JsMessage[]>(relay, KIND_GROUP_CHAT_MESSAGE, groupId);
  if (!entry || entry.value.length === 0) return false;
  // Backfill optional fields added after the cache was written so older
  // entries don't surface `undefined` for a now-required field.
  const msgs: JsMessage[] = entry.value.map((m) => ({
    ...m,
    mentions: m.mentions ?? [],
    customEmojis: m.customEmojis ?? {},
  }));
  stores.messagesByGroup.update((prev) => {
    const cur = prev[groupId];
    if (cur && cur.length > 0) return prev;
    return { ...prev, [groupId]: msgs };
  });
  stores.setStatus(groupId, 'has-messages');
  return true;
}
