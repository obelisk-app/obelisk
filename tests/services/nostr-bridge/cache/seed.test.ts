import { afterEach, describe, expect, it, vi } from 'vitest';
import { KIND_GROUP_CHAT_MESSAGE, KIND_METADATA } from '@/utils/nostr/nip-kinds';
import { cacheClearAll, cacheSet } from '@/services/nostr-bridge/cache/cache';
import { seedCacheForRelay, type SeedTargets } from '@/services/nostr-bridge/cache/seed';

const RELAY = 'wss://seed.example';

function targets(order: string[], over: { renderableMetadata?: boolean; renderableMessages?: boolean } = {}): SeedTargets {
  const hidden = new Set(['hidden-group']);
  return {
    metadata: { seedFromCache: vi.fn(() => { order.push('metadata'); return { hiddenGroupIds: hidden, renderable: over.renderableMetadata ?? false }; }) },
    membership: { seedFromCache: vi.fn(() => { order.push('membership'); }) },
    profiles: { seedFromCache: vi.fn(() => { order.push('profiles'); }) },
    media: { seedFromCache: vi.fn(() => { order.push('media'); }) },
    messages: { seedFromCache: vi.fn(() => { order.push('messages'); return over.renderableMessages ?? false; }) },
    reactions: { seedFromCache: vi.fn(() => { order.push('reactions'); }) },
  };
}

describe('seedCacheForRelay', () => {
  afterEach(() => cacheClearAll());

  it('seeds the modules in the facade order, metadata first for the hidden set', () => {
    const order: string[] = [];
    const t = targets(order);
    expect(seedCacheForRelay(RELAY, t)).toBe(false);
    expect(order).toEqual(['metadata', 'membership', 'profiles', 'media', 'messages', 'reactions']);
    const hidden = vi.mocked(t.metadata.seedFromCache).mock.results[0].value.hiddenGroupIds;
    expect(vi.mocked(t.membership.seedFromCache).mock.calls[0][1]).toBe(hidden);
    expect(vi.mocked(t.messages.seedFromCache).mock.calls[0][1]).toBe(hidden);
    expect(vi.mocked(t.reactions.seedFromCache).mock.calls[0][1]).toBe(hidden);
  });

  it('is renderable when either the channel list or a channel history was on disk', () => {
    expect(seedCacheForRelay(RELAY, targets([], { renderableMetadata: true }))).toBe(true);
    expect(seedCacheForRelay(RELAY, targets([], { renderableMessages: true }))).toBe(true);
  });

  it('hands each module the ids the cache lists for its kinds', () => {
    cacheSet(RELAY, KIND_METADATA, 'pk1', { meta: {} });
    cacheSet(RELAY, KIND_GROUP_CHAT_MESSAGE, 'g1', []);
    const t = targets([]);
    seedCacheForRelay(RELAY, t);
    expect(vi.mocked(t.profiles.seedFromCache).mock.calls[0][1]).toEqual(['pk1']);
    const idsFor = vi.mocked(t.messages.seedFromCache).mock.calls[0][2];
    expect(idsFor(KIND_GROUP_CHAT_MESSAGE)).toEqual(['g1']);
    expect(idsFor(12345)).toEqual([]);
  });
});
