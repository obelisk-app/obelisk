/**
 * Without a bridge (SSR, tests, before login) neither half of the
 * read-state sync subscribes, publishes or listens for page lifecycle.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge/client', () => ({ getBridgeImpl: () => null }));

import { subscribeAndIngest } from '@/services/read-state/sync-ingest';
import { watchAndPublish } from '@/services/read-state/sync-publish';
import type { SyncOptions } from '@/services/read-state/sync-options';

const opts: SyncOptions = {
  relays: ['wss://relay.example'],
  dTag: 'obelisk:readstate:v1',
  cacheNamespace: 'wss://relay.example',
  ledgerScope: 'readstate:groups',
  transport: 'replaceable',
};

describe('read-state sync halves without a bridge', () => {
  it('ingest never applies and returns a no-op cleanup', () => {
    const apply = vi.fn();
    const stop = subscribeAndIngest(opts, apply);
    expect(apply).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });

  it('publish never reads the store or attaches page listeners', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const fingerprint = vi.fn(() => 'fp');
    const stop = watchAndPublish(opts, fingerprint, () => ({ v: 1 }));
    expect(fingerprint).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalledWith('pagehide', expect.anything());
    stop();
    add.mockRestore();
  });
});
