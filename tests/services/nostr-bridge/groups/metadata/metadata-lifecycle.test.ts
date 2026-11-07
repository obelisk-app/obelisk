import { beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, type Event as NostrEvent } from 'nostr-tools';
import { GroupMetadataModule, type GroupMetadataContext } from '@/services/nostr-bridge/groups/metadata/metadata';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import { cacheGet, cacheSet } from '@/services/nostr-bridge/cache/cache';
import { KIND_GROUP_DELETE, KIND_GROUP_METADATA } from '@/constants/nostr/nip-kinds';

const RELAY = 'wss://a.example';
const metadata = (): NostrEvent => ({ id: 'meta', pubkey: 'relay', sig: '', kind: KIND_GROUP_METADATA, created_at: 10, content: '', tags: [['d', 'room'], ['name', 'Private room'], ['private'], ['hidden']] });
const deletion = (): NostrEvent => finalizeEvent({ kind: KIND_GROUP_DELETE, tags: [['h', 'room']], created_at: 20, content: '' }, generateSecretKey());

function setup() {
  const ctx = {
    currentRelayUrl: new StateStore(RELAY), relays: () => [RELAY], session: () => null,
    track: vi.fn(), subscribeWatched: vi.fn(), queryRelaysWithConfidence: vi.fn(), signAndPublish: vi.fn(),
  } satisfies GroupMetadataContext;
  const deleted = vi.fn();
  const metadataModule = new GroupMetadataModule(ctx, { recordCreator: vi.fn(), onGroupDiscovered: vi.fn(), onGroupDeleted: deleted });
  return { metadataModule, ctx, deleted };
}

beforeEach(() => localStorage.clear());

describe('group lifecycle', () => {
  it('ignores a delayed private metadata query after A -> B -> A', async () => {
    const { metadataModule, ctx } = setup();
    let resolve!: (value: { events: NostrEvent[]; complete: boolean }) => void;
    ctx.queryRelaysWithConfidence.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = metadataModule.fetchGroupMetadata('room');
    metadataModule.clearGroups();
    ctx.currentRelayUrl.set('wss://b.example');
    metadataModule.clearGroups();
    ctx.currentRelayUrl.set(RELAY);
    resolve({ events: [metadata()], complete: true });
    expect(await pending).toBe(false);
    expect(metadataModule.groups.get()).toEqual([]);
    expect(cacheGet(RELAY, KIND_GROUP_METADATA, 'room')).toBeNull();
  });

  it('removes a deleted channel, purges its cache and blocks stale metadata after reload', () => {
    const { metadataModule, deleted } = setup();
    metadataModule.ingest(metadata());
    expect(metadataModule.groups.get()).toHaveLength(1);
    metadataModule.ingest(deletion());
    expect(metadataModule.groups.get()).toEqual([]);
    expect(deleted).toHaveBeenCalledWith('room');
    expect(cacheGet(RELAY, KIND_GROUP_METADATA, 'room')).toBeNull();
    metadataModule.ingest({ ...metadata(), created_at: 30 });
    expect(metadataModule.groups.get()).toEqual([]);
    metadataModule.clearGroups();
    cacheSet(RELAY, KIND_GROUP_METADATA, 'room', { group: { id: 'room', isPublic: true }, createdAt: 10 });
    metadataModule.seedFromCache(RELAY, (kind) => [KIND_GROUP_DELETE, KIND_GROUP_METADATA].includes(kind) ? ['room'] : []);
    expect(metadataModule.isDeleted('room')).toBe(true);
    expect(metadataModule.groups.get()).toEqual([]);
    metadataModule.clearGroups();
    expect(metadataModule.isDeleted('room')).toBe(false);
  });

  it('ignores deletion events without a group target', () => {
    const { metadataModule, deleted } = setup();
    metadataModule.ingest(metadata());
    metadataModule.ingest({ ...deletion(), tags: [] });
    metadataModule.ingest({ ...JSON.parse(JSON.stringify(deletion())), sig: '0'.repeat(128) });
    expect(metadataModule.groups.get()).toHaveLength(1);
    expect(deleted).not.toHaveBeenCalled();
  });
});
