/**
 * The signed-in user's lists on the pool-level fake: contact list, mutes, media packs and favourites, and the account export.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import {
  deliver,
  flush,
  installBridgeHarness,
  makeKeypair,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);

describe('nostr-bridge', () => {

  it("exports authored events and resolves favorited media-pack events", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const creatorSk = generateSecretKey();
    const creatorPubkey = getPublicKey(creatorSk);
    const address = "30030:" + creatorPubkey + ":cats";
    const ownSk = Uint8Array.from(skHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
    const profile = finalizeEvent({ kind: 0, created_at: 10, content: JSON.stringify({ name: "Alice" }), tags: [] }, ownSk);
    const favorites = finalizeEvent({ kind: 10030, created_at: 11, content: "", tags: [["a", address]] }, ownSk);
    const pack = finalizeEvent({ kind: 30030, created_at: 12, content: "", tags: [["d", "cats"], ["emoji", "party", "https://cdn.example/cat.webp"]] }, creatorSk);
    fake.state.published.push(profile, favorites, pack);

    const backup = await bridge.exportAccountData();

    expect(backup.pubkey).toBe(pkHex);
    expect(backup.events.map((event) => event.id)).toEqual([profile.id, favorites.id]);
    expect(backup.referencedMediaPackEvents.map((event) => event.id)).toEqual([pack.id]);
    expect(backup.complete).toBe(true);
  });


  it('subscribes, caches, and publishes NIP-51 media packs and favorites', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { cacheGet } = await import('@/services/nostr-bridge/cache');
    const { mediaPackAddress } = await import('@/utils/media-tags/media-packs');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const creatorSk = generateSecretKey();
    const creatorPubkey = getPublicKey(creatorSk);
    const address = mediaPackAddress(creatorPubkey, 'cats');
    const packEvent = finalizeEvent({
      kind: 30030,
      created_at: 50,
      content: '',
      tags: [
        ['d', 'cats'],
        ['title', 'Cat pack'],
        ['emoji', 'party_cat', 'https://cdn.example/cat.webp'],
        ['media', 'party_cat', 'sticker'],
      ],
    }, creatorSk);

    const packSnapshots: Array<Readonly<Record<string, { title: string }>>> = [];
    bridge.subscribeMediaPacks((packs) => packSnapshots.push(packs));
    deliver(packEvent);
    await flush();

    expect(packSnapshots.at(-1)?.[address]?.title).toBe('Cat pack');
    expect(cacheGet('wss://public.obelisk.ar', 30030, `media-pack:${address}`)?.value).toMatchObject({
      address,
      title: 'Cat pack',
    });

    await bridge.saveMediaFavorites({ items: [], packAddresses: [address] });
    await flush();

    const published = fake.state.published.find((event) => event.kind === 10030);
    expect(published?.tags).toContainEqual(['a', address]);
    expect(bridge.myMediaFavorites.get().packAddresses).toEqual([address]);
    expect(cacheGet('wss://public.obelisk.ar', 10030, `media-favorites:${pkHex}`)?.value).toMatchObject({
      packAddresses: [address],
    });
  });


  it("blacklists abusive media-pack publishers from relay events and cache", async () => {
    const { getBridge } = await import("@/services/nostr-bridge/client");
    const { cacheGet, cacheSet } = await import("@/services/nostr-bridge/cache");
    const { skHex, pkHex } = makeKeypair();
    const blockedAuthor = "43fabde62ffea1aa0ddae7c0ac03b7017e2d864f8665784b00bbfa2f9114c06a";
    const address = "30030:" + blockedAuthor + ":niggaemotes";
    const cacheId = "media-pack:" + address;
    cacheSet("wss://public.obelisk.ar", 30030, cacheId, {
      address,
      identifier: "niggaemotes",
      author: blockedAuthor,
      title: "niggaemotes",
      description: "",
      image: "",
      items: [{ name: "blocked", url: "https://cdn.example/blocked.webp", kind: "sticker" }],
      createdAt: 50,
    });

    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    expect(bridge.mediaPacks.get()[address]).toBeUndefined();
    expect(cacheGet("wss://public.obelisk.ar", 30030, cacheId)).toBeNull();

    deliver({
      id: "8d862c147fd53c4809407d2b35feb29e43b98ae734b4c7ba68a59605f006b1dd",
      pubkey: blockedAuthor,
      created_at: 51,
      kind: 30030,
      tags: [["d", "niggaemotes"], ["emoji", "blocked", "https://cdn.example/blocked.webp"]],
      content: "",
      sig: "0".repeat(128),
    });
    await flush();

    expect(bridge.mediaPacks.get()[address]).toBeUndefined();
    expect(cacheGet("wss://public.obelisk.ar", 30030, cacheId)).toBeNull();
  });


  it('deletes only an owned media pack with a NIP-09 address request', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { mediaPackAddress } = await import('@/utils/media-tags/media-packs');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await bridge.saveMediaPack({
      identifier: 'mine',
      title: 'Mine',
      description: '',
      image: '',
      items: [{ name: 'wave', url: 'https://cdn.example/wave.webp', kind: 'sticker' }],
    });
    const address = mediaPackAddress(pkHex, 'mine');
    await bridge.saveMediaFavorites({ items: [], packAddresses: [address] });

    await bridge.deleteMediaPack(address);

    const deletion = fake.state.published.find((event) => event.kind === 5);
    expect(deletion?.tags).toEqual([
      ['a', address],
      ['k', '30030'],
    ]);
    expect(bridge.mediaPacks.get()[address]).toBeUndefined();
    expect(bridge.myMediaFavorites.get().packAddresses).toEqual([]);

    await bridge.saveMediaPack({
      identifier: 'mine',
      title: 'Mine again',
      description: '',
      image: '',
      items: [{ name: 'wave', url: 'https://cdn.example/wave.webp', kind: 'sticker' }],
    });
    const recreated = fake.state.published.filter((event) => event.kind === 30030).at(-1);
    expect(recreated!.created_at).toBeGreaterThan(deletion!.created_at);
    expect(bridge.mediaPacks.get()[address]?.title).toBe('Mine again');
  });


  it('caches the newest contact list and updates it immediately after edits', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const first = makeKeypair().pkHex;
    const second = makeKeypair().pkHex;
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    expect(fake.state.subscriptions.map((sub) => sub.filter)).toContainEqual(
      expect.objectContaining({ kinds: [3], authors: [pkHex] }),
    );
    const seen: Array<NostrEvent | null> = [];
    const ready: boolean[] = [];
    bridge.subscribeMyContactList((event) => seen.push(event));
    bridge.subscribeMyContactListReady((value) => ready.push(value));
    await bridge.publishEvent({
      kind: 3,
      content: 'relay metadata',
      tags: [['p', first]],
      created_at: 21,
    });
    expect(seen.at(-1)?.tags).toEqual([['p', first]]);
    expect(ready.at(-1)).toBe(true);
    expect(Object.keys(localStorage).some((key) => key.endsWith(`/3/${pkHex}`))).toBe(true);

    const secret = Uint8Array.from(skHex.match(/.{2}/g)!.map((hex) => parseInt(hex, 16)));
    deliver(finalizeEvent({
      kind: 3,
      content: 'stale',
      tags: [['p', second]],
      created_at: 20,
    }, secret));
    await flush();
    expect(seen.at(-1)?.tags).toEqual([['p', first]]);
  });


  it('subscribeMyMutes parses NIP-51 kind 10000 p-tags for the local user', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const muted1 = makeKeypair();
    const muted2 = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const seen: ReadonlyArray<string>[] = [];
    bridge.subscribeMyMutes((l) => seen.push(l));

    const muteEvent = await finalizeEvent(
      {
        kind: 10000,
        content: '',
        tags: [['p', muted1.pkHex], ['p', muted2.pkHex]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: pkHex,
      } as Parameters<typeof finalizeEvent>[0],
      // sign with the local user's key: the relay would accept any author,
      // but the bridge filters by `authors: [me]`.
      Uint8Array.from(skHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))),
    );
    deliver(muteEvent);
    await flush();

    expect(seen.at(-1)).toEqual([muted1.pkHex, muted2.pkHex]);
  });


  it('does not overwrite the mute list when the preservation read times out', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    fake.state.published = [];
    fake.state.suppressNextEose = true;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = expect(bridge.setMuted(makeKeypair().pkHex, true))
        .rejects.toThrow('Could not load your mute list');
      await vi.advanceTimersByTimeAsync(4000);
      await pending;
    } finally {
      vi.useRealTimers();
    }
    expect(fake.state.published.some((event) => event.kind === 10000)).toBe(false);
  });
});
