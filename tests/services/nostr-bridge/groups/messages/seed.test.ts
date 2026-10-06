import { afterEach, describe, expect, it, vi } from 'vitest';
import { KIND_GROUP_CHAT_MESSAGE, KIND_GROUP_METADATA } from '@/utils/nip-kinds';
import { cacheClearAll, cacheSet } from '@/services/nostr-bridge/cache';
import { seedCachedMessagesForGroup, seedMessagesFromCache, type MessageSeedStores } from '@/services/nostr-bridge/groups/messages/seed';
import { StateStore } from '@/services/nostr-bridge/state-store';
import type { JsGroup, JsMessage, MessagesStatus } from '@/services/nostr-bridge/types';

const RELAY = 'wss://seed.example';
const msg = (id: string): JsMessage => ({ id, pubkey: 'p', content: id, createdAt: 1, kind: 9, replyToId: null, mentions: [], customEmojis: {} });

function stores(groups: JsGroup[] = []): MessageSeedStores {
  const messagesStatusByGroup = new StateStore<Record<string, MessagesStatus>>({});
  return {
    groups: new StateStore<JsGroup[]>(groups),
    messagesByGroup: new StateStore<Record<string, JsMessage[]>>({}),
    messagesStatusByGroup,
    setStatus: vi.fn((groupId: string, status: MessagesStatus) => messagesStatusByGroup.update((p) => ({ ...p, [groupId]: status }))),
  };
}

describe('groups/messages/seed', () => {
  afterEach(() => cacheClearAll());

  it('paints cached channels, skipping hidden ones and ones already painted', () => {
    const { mentions: _m, customEmojis: _c, ...legacy } = msg('old');
    cacheSet(RELAY, KIND_GROUP_CHAT_MESSAGE, 'g1', [legacy]);
    cacheSet(RELAY, KIND_GROUP_CHAT_MESSAGE, 'hidden', [msg('h')]);
    cacheSet(RELAY, KIND_GROUP_CHAT_MESSAGE, 'live', [msg('stale')]);
    const s = stores();
    s.messagesByGroup.set({ live: [msg('fresh')] });
    const painted = seedMessagesFromCache(s, RELAY, new Set(['hidden']), (kind) => (kind === KIND_GROUP_CHAT_MESSAGE ? ['g1', 'hidden', 'live'] : []));
    expect(painted).toBe(true);
    expect(s.messagesByGroup.get().g1).toEqual([expect.objectContaining({ id: 'old', mentions: [], customEmojis: {} })]);
    expect(s.messagesByGroup.get().hidden).toBeUndefined();
    expect(s.messagesByGroup.get().live.map((m) => m.id)).toEqual(['fresh']);
    expect(s.messagesStatusByGroup.get()).toEqual({ g1: 'has-messages' });
  });

  it('paints one channel on open unless it is a hidden group the relay has not listed', () => {
    cacheSet(RELAY, KIND_GROUP_CHAT_MESSAGE, 'g1', [msg('a')]);
    cacheSet(RELAY, KIND_GROUP_METADATA, 'g1', { group: { id: 'g1', isPublic: false } });
    const s = stores();
    expect(seedCachedMessagesForGroup(s, RELAY, 'g1')).toBe(false);
    const listed = stores([{ id: 'g1' } as JsGroup]);
    expect(seedCachedMessagesForGroup(listed, RELAY, 'g1')).toBe(true);
    expect(listed.messagesByGroup.get().g1.map((m) => m.id)).toEqual(['a']);
    expect(listed.setStatus).toHaveBeenCalledWith('g1', 'has-messages');
    expect(seedCachedMessagesForGroup(stores(), RELAY, 'nothing-cached')).toBe(false);
  });
});
