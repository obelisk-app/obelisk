import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bridgeModule from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
const mocks = vi.hoisted(() => ({
  author: 'a', relay: 'wss://relay.test', revision: 5, operator: 'a',
  packs: {} as Record<string, { createdAt: number }>,
  save: vi.fn(), publish: vi.fn(),
}));
vi.mock('@/services/relay/relay-info', () => ({ fetchRelayInfo: async () => ({}), operatorPubkeyFromRelayInfo: () => mocks.operator }));
vi.mock('@/services/relay/relay-emojis', () => ({ publishRelayEmojiSet: mocks.publish, relayEmojiRevision: () => mocks.revision }));
import { saveLibraryPack } from '@/services/media/save-library-pack';
import type { EditablePack } from '@/types/media/library';
const draft: EditablePack = { identifier: 'cats', owner: 'a', title: 'Cats', description: '', image: '', items: [] };

beforeEach(() => {
  const bridge = fakeBridge({}, { saveMediaPack: mocks.save });
  vi.spyOn(bridge.myPubkey, 'get').mockImplementation(() => mocks.author);
  vi.spyOn(bridge.currentRelayUrl, 'get').mockImplementation(() => mocks.relay);
  vi.spyOn(bridge.mediaPacks, 'get').mockImplementation(() => mocks.packs as ReturnType<typeof bridge.mediaPacks.get>);
  vi.spyOn(bridgeModule, 'getBridge').mockResolvedValue(bridge);
  vi.spyOn(bridgeModule, 'getBridgeImpl').mockReturnValue(bridge);
  mocks.author = 'a'; mocks.operator = 'a'; mocks.relay = 'wss://relay.test'; mocks.revision = 5; mocks.packs = {};
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.publish.mockReset().mockResolvedValue(undefined);
});
describe('saveLibraryPack', () => {
  it('rejects changed accounts and stale destinations before publishing', async () => {
    mocks.author = 'b';
    await expect(saveLibraryPack(draft)).rejects.toMatchObject({ code: 'media-account-changed' });
    mocks.author = 'a'; mocks.packs['30030:a:cats'] = { createdAt: 10 };
    await expect(saveLibraryPack(draft)).rejects.toMatchObject({ code: 'media-stale' });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('saves an empty owned pack with the matching revision', async () => {
    mocks.packs['30030:a:cats'] = { createdAt: 10 };
    await saveLibraryPack({ ...draft, baseCreatedAt: 10 });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ items: [] }));
  });
  it('writes a server snapshot without live references and retains source metadata', async () => {
    const items = [{ name: 'cat', url: 'https://example.com/cat', kind: 'sticker' as const, packAddress: '30030:source:cats' }];
    await saveLibraryPack({ ...draft, items, serverRelay: mocks.relay, baseCreatedAt: 5 }, { title: 'Server', emojis: [], updatedAt: 5, packAddresses: ['30030:source:cats'] });
    expect(mocks.publish).toHaveBeenCalledWith(mocks.relay, expect.objectContaining({ emojis: items, packAddresses: [] }));
  });
  it('rejects non-operators, another active relay, and stale server revisions', async () => {
    const server = { title: 'Server', emojis: [], updatedAt: 5 };
    const snapshot = { ...draft, serverRelay: mocks.relay, baseCreatedAt: 5 };
    mocks.operator = 'b';
    await expect(saveLibraryPack(snapshot, server)).rejects.toMatchObject({ code: 'media-permission' });
    mocks.operator = 'a'; mocks.relay = 'wss://other.test';
    await expect(saveLibraryPack(snapshot, server)).rejects.toMatchObject({ code: 'media-permission' });
    mocks.relay = snapshot.serverRelay; mocks.revision = 6;
    await expect(saveLibraryPack(snapshot, server)).rejects.toMatchObject({ code: 'media-stale' });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('prevents overlapping writes to a destination', async () => {
    let finish!: () => void;
    mocks.save.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const first = saveLibraryPack(draft);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    await expect(saveLibraryPack(draft)).rejects.toMatchObject({ code: 'media-pending' });
    finish(); await first;
  });
});
