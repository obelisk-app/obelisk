import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';

type Watcher = { filter: Filter; onEvent: (ev: NostrEvent) => void; unsub: ReturnType<typeof vi.fn> };

const mocks = vi.hoisted(() => ({
  watchers: [] as Watcher[],
  publishEvent: vi.fn(),
}));

vi.mock('@/services/nostr-bridge/client', () => ({
  getBridge: vi.fn().mockResolvedValue({}),
  getBridgeImpl: () => ({
    publishEvent: mocks.publishEvent,
    subscribeFilterWatched: (filter: Filter, onEvent: (ev: NostrEvent) => void) => {
      const unsub = vi.fn();
      mocks.watchers.push({ filter, onEvent, unsub });
      return unsub;
    },
  }),
}));

import { publishRoleHolders, subscribeRelayRoles } from '@/services/relay-roles-sync';
import { roleCatalogDTag, roleHoldersDTag, type RelayRoles } from '@/services/relay-roles-model';

const RELAY = 'wss://relay.test';
const OPERATOR = 'f'.repeat(64);
const ALICE = 'a'.repeat(64);

function event(tags: string[][], createdAt: number): NostrEvent {
  return { id: 'id', pubkey: OPERATOR, created_at: createdAt, kind: 30078, tags, content: '', sig: 'sig' };
}

describe('subscribeRelayRoles', () => {
  beforeEach(() => {
    mocks.watchers.length = 0;
    mocks.publishEvent.mockReset();
    localStorage.clear();
  });

  it('reads the catalog from the operator only, then opens one REQ for the holders', () => {
    const seen: RelayRoles[] = [];
    const stop = subscribeRelayRoles(RELAY, [OPERATOR], (s) => seen.push(s));

    expect(mocks.watchers).toHaveLength(1);
    expect(mocks.watchers[0].filter).toEqual({ kinds: [30078], authors: [OPERATOR], '#d': [roleCatalogDTag(RELAY)] });

    mocks.watchers[0].onEvent(event([['role', 'mod', 'Moderator', '3', '#ff0000']], 100));
    expect(mocks.watchers).toHaveLength(2);
    expect(mocks.watchers[1].filter['#d']).toEqual([roleHoldersDTag(RELAY, 'mod')]);

    mocks.watchers[1].onEvent(event([['d', roleHoldersDTag(RELAY, 'mod')], ['p', ALICE]], 101));
    expect(seen.at(-1)?.holders).toEqual({ mod: [ALICE] });

    stop();
    expect(mocks.watchers[0].unsub).toHaveBeenCalled();
    expect(mocks.watchers[1].unsub).toHaveBeenCalled();
  });

  it('ignores a catalog no newer than the one it holds', () => {
    const seen: RelayRoles[] = [];
    subscribeRelayRoles(RELAY, [OPERATOR], (s) => seen.push(s));
    mocks.watchers[0].onEvent(event([['role', 'mod', 'Moderator', '3', '#ff0000']], 100));
    const count = seen.length;
    mocks.watchers[0].onEvent(event([['role', 'og', 'OG', '1', '#00ff00']], 100));
    expect(seen).toHaveLength(count);
  });

  it('opens nothing without an operator to trust', () => {
    subscribeRelayRoles(RELAY, [], () => {});
    expect(mocks.watchers).toHaveLength(0);
  });
});

describe('publishRoleHolders', () => {
  it('refuses an id that normalises to nothing', async () => {
    await expect(publishRoleHolders(RELAY, '!!!', [ALICE])).rejects.toThrow('invalid role id');
    expect(mocks.publishEvent).not.toHaveBeenCalled();
  });

  it('bumps created_at past the last publish so a same-second edit still wins', async () => {
    mocks.publishEvent.mockImplementation(async (draft: { created_at: number; tags: string[][] }) =>
      event(draft.tags, draft.created_at));
    await publishRoleHolders(RELAY, 'mod', [ALICE]);
    await publishRoleHolders(RELAY, 'mod', []);
    const [first, second] = mocks.publishEvent.mock.calls.map((call) => call[0].created_at as number);
    expect(second).toBeGreaterThan(first);
  });
});
