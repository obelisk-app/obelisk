import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const subs = vi.hoisted(() => ({ count: 0, unsub: vi.fn() }));
vi.mock('@/services/nostr-bridge/facade/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/nostr-bridge/facade/client')>();
  const impl = { subscribeFilter: () => { subs.count += 1; return subs.unsub; } };
  return { ...real, getBridge: async () => impl, getBridgeImpl: () => impl };
});

import {
  advertisementCount,
  ensureAdvertisementSub,
  ingestAdvertisement,
  newestAdvertisement,
  resetDiscovery,
  snapshotAdvertisements,
} from '@/services/voice/sfu-discovery';
import { KIND_SFU_ADVERTISE } from '@/utils/nostr/nip-kinds';

function ad(pubkey: string, createdAt: number, tags: string[][] = []): NostrEvent {
  return { id: `${pubkey}-${createdAt}`, pubkey, created_at: createdAt, kind: KIND_SFU_ADVERTISE, content: '', sig: 's', tags };
}

afterEach(() => {
  resetDiscovery();
  subs.count = 0;
});

describe('sfu-discovery', () => {
  it('keeps only the newest advertisement per SFU, and picks the newest SFU', () => {
    ingestAdvertisement(ad('a', 10, [['url', 'https://a.example']]));
    ingestAdvertisement(ad('a', 5, [['url', 'https://stale.example']]));
    ingestAdvertisement(ad('b', 20));
    expect(advertisementCount()).toBe(2);
    expect(snapshotAdvertisements().find((x) => x.pubkey === 'a')?.url).toBe('https://a.example');
    expect(newestAdvertisement()?.pubkey).toBe('b');
  });

  it('ignores other kinds, and has nothing to pick when empty', () => {
    ingestAdvertisement({ ...ad('a', 10), kind: 1 });
    expect(advertisementCount()).toBe(0);
    expect(newestAdvertisement()).toBeNull();
  });

  it('opens the subscription once, and reset closes it', async () => {
    await ensureAdvertisementSub();
    await ensureAdvertisementSub();
    expect(subs.count).toBe(1);
    resetDiscovery();
    expect(subs.unsub).toHaveBeenCalled();
    await ensureAdvertisementSub();
    expect(subs.count).toBe(2);
  });
});
