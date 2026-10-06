/**
 * Voice on the pool-level fake: mesh and SFU REQs, presence beacons and the active-call store.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { KIND_SFU_ACTIVE_CALL, KIND_VOICE_PRESENCE, KIND_VOICE_SIGNAL } from '@/utils/nip-kinds';
import {
  deliver,
  flush,
  installBridgeHarness,
  makeKeypair,
  onWire,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);

describe('nostr-bridge', () => {

  it('subscribeVoiceFilterWatched rides the session pool for mesh signaling', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const existingPoolIds = new Set(fake.state.subscriptions.map((sub) => sub.poolId));
    const poolSeqBefore = fake.state.poolSeq;
    const unsubscribe = (bridge as unknown as {
      subscribeVoiceFilterWatched: (
        filter: Filter,
        onEvent: (ev: NostrEvent) => void,
        options?: { relays?: readonly string[]; relayMode?: 'replace' | 'merge' },
      ) => () => void;
    }).subscribeVoiceFilterWatched(
      { kinds: [KIND_VOICE_SIGNAL] },
      () => {},
      { relays: ['wss://public.obelisk.ar'], relayMode: 'replace' },
    );
    await flush();

    const voiceSub = fake.state.subscriptions.find((sub) => {
      const f = sub.filter as { kinds?: number[] };
      return f.kinds?.includes(KIND_VOICE_SIGNAL);
    });
    expect(voiceSub).toBeTruthy();
    // The session's one pool, no new one built: the call's REQ shares the
    // socket (and the AUTH) the session already holds on the relay.
    expect(fake.state.poolSeq).toBe(poolSeqBefore);
    expect(existingPoolIds.has(voiceSub!.poolId)).toBe(true);

    unsubscribe();
    await flush();
    expect(fake.state.subscriptions.some((sub) => {
      const f = sub.filter as { kinds?: number[] };
      return f.kinds?.includes(KIND_VOICE_SIGNAL);
    })).toBe(false);
    expect(fake.state.subscriptions.length).toBeGreaterThan(0);
  });


  it('a mesh call leaves background group streams open: the hub budget admits the voice REQ, nothing is trimmed', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { getRelayHub } = await import('@/lib/relay-hub');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    bridge.subscribeMessages('voice-channel', () => {});
    bridge.subscribeMessages('background-channel', () => {});
    bridge.subscribeReactions('background-channel', () => {});
    await flush();

    const subsForGroup = (groupId: string) =>
      fake.state.subscriptions.filter((sub) => {
        const f = sub.filter as { '#h'?: string[] };
        return f['#h']?.includes(groupId);
      });

    expect(subsForGroup('voice-channel').length).toBeGreaterThan(0);
    expect(subsForGroup('background-channel').length).toBeGreaterThan(0);

    const stop = getBridgeImpl()!.subscribeVoiceFilterWatched(
      { kinds: [KIND_VOICE_SIGNAL], '#p': [pkHex] },
      () => {},
      { relays: ['wss://public.obelisk.ar'], relayMode: 'replace', answerAuth: true },
    );
    await flush();

    // The call's REQ is admitted at 'voice' priority within the socket's
    // budget; the background streams stay (the budget parks the lowest
    // priority REQ only when the socket is full, registry.test.ts).
    const budget = getRelayHub().status('wss://public.obelisk.ar').budget;
    expect(budget.used).toBeLessThanOrEqual(budget.max);
    expect(budget.parked).toBe(0);
    expect(fake.state.subscriptions.some((sub) => (sub.filter as { kinds?: number[] }).kinds?.includes(KIND_VOICE_SIGNAL))).toBe(true);
    expect(subsForGroup('voice-channel').length).toBeGreaterThan(0);
    expect(subsForGroup('background-channel').length).toBeGreaterThan(0);
    stop();
  });


  it('a mesh call leaves lazy admin/member subs open', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    bridge.setActiveGroup('active-channel');
    bridge.subscribeAdmins('active-channel', () => {});
    bridge.subscribeMembers('background-channel', () => {});
    await flush();

    const adminMemberSubsFor = (groupId: string) =>
      fake.state.subscriptions.filter((sub) => {
        const f = sub.filter as { kinds?: number[]; '#d'?: string[] };
        return f.kinds?.includes(39001) && f.kinds?.includes(39002) && f['#d']?.includes(groupId);
      });

    expect(adminMemberSubsFor('active-channel')).toHaveLength(1);
    expect(adminMemberSubsFor('background-channel')).toHaveLength(1);

    const stop = getBridgeImpl()!.subscribeVoiceFilterWatched(
      { kinds: [KIND_VOICE_SIGNAL], '#p': [pkHex] },
      () => {},
      { relays: ['wss://public.obelisk.ar'], relayMode: 'replace', answerAuth: true },
    );
    await flush();

    expect(adminMemberSubsFor('active-channel')).toHaveLength(1);
    expect(adminMemberSubsFor('background-channel')).toHaveLength(1);
    stop();
  });


  it('keeps replace-mode voice subscriptions pinned across relay switches', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const seen: NostrEvent[] = [];
    const unsub = impl.subscribeFilterWatched(
      { kinds: [KIND_VOICE_PRESENCE] },
      (ev) => seen.push(ev),
      { relays: ['wss://origin.example'], relayMode: 'replace', affectsRelayAccess: false },
    );
    await flush();
    // The registry issues the REQ once the origin relay's socket is up, so
    // it is found by its filter rather than by position; the hub's spelling.
    const pinned = fake.state.subscriptions.find((sub) =>
      (sub.filter as { kinds?: number[] }).kinds?.includes(KIND_VOICE_PRESENCE) && sub.relays?.includes(onWire('wss://origin.example')));
    expect(pinned?.relays).toEqual([onWire('wss://origin.example')]);

    await bridge.switchRelay('wss://other.example');
    await flush();

    const peerSk = generateSecretKey();
    const peerPk = getPublicKey(peerSk);
    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [['e', 'mesh-channel'], ['t', 'obelisk-voice-presence']],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: peerPk,
    } as Parameters<typeof finalizeEvent>[0], peerSk));
    expect(seen).toHaveLength(1);

    await impl.publishEvent(
      { kind: KIND_VOICE_PRESENCE, content: '', tags: [['e', 'mesh-channel']] },
      { extraRelays: ['wss://origin.example'], mode: 'replace' },
    );
    await flush();
    expect(fake.state.published.at(-1)?.relays).toEqual(['wss://origin.example']);
    unsub();
  });


  it('surfaces explicit relay rejections for ephemeral voice events', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    fake.state.publishImpl = () => [Promise.reject(new Error('restricted: Access denied'))];
    await expect(getBridgeImpl()!.publishEvent(
      { kind: KIND_VOICE_PRESENCE, content: '', tags: [['e', 'mesh-channel']] },
      { extraRelays: ['wss://lacrypta-relay.obelisk.ar'], mode: 'replace' },
    )).rejects.toThrow('restricted: Access denied');
  });


  it('marks mesh voice channels live from presence beacons', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const snapshots: Array<Readonly<Record<string, { mode?: string; participantCount: number; participantPubkeys?: string[] }>>> = [];
    const unsub = bridge.subscribeActiveCallByChannel((m) => snapshots.push(m));
    const peerSk = generateSecretKey();
    const peerPk = getPublicKey(peerSk);
    const now = Math.floor(Date.now() / 1000);
    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
      pubkey: peerPk,
    } as Parameters<typeof finalizeEvent>[0], peerSk));
    await flush();

    expect(snapshots.at(-1)?.['mesh-channel']).toMatchObject({
      mode: 'mesh',
      participantCount: 1,
      participantPubkeys: [peerPk],
    });
    unsub();
  });


  it('removes mesh voice participants when a same-second leave beacon arrives', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    let latest: Readonly<Record<string, { mode?: string; participantCount: number; participantPubkeys?: string[] }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const peerSk = generateSecretKey();
    const peerPk = getPublicKey(peerSk);
    const now = Math.floor(Date.now() / 1000);

    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
      pubkey: peerPk,
    } as Parameters<typeof finalizeEvent>[0], peerSk));
    await flush();
    expect(latest['mesh-channel']).toMatchObject({ participantPubkeys: [peerPk] });

    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['status', 'left'],
        ['expiration', String(now - 1)],
      ],
      created_at: now,
      pubkey: peerPk,
    } as Parameters<typeof finalizeEvent>[0], peerSk));
    await flush();
    expect(latest['mesh-channel']).toBeUndefined();

    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
      pubkey: peerPk,
    } as Parameters<typeof finalizeEvent>[0], peerSk));
    await flush();
    expect(latest['mesh-channel']).toBeUndefined();
    unsub();
  });


  it('marks a locally published mesh beacon live without waiting for relay echo', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    let latest: Readonly<Record<string, { mode?: string; participantCount: number }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const now = Math.floor(Date.now() / 1000);

    await impl.publishEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'local-mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
    });

    expect(latest['local-mesh-channel']).toMatchObject({
      mode: 'mesh',
      participantCount: 1,
    });
    unsub();
  });


  it('clears a locally published mesh call when the local user publishes a leave beacon', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    let latest: Readonly<Record<string, { mode?: string; participantCount: number }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const now = Math.floor(Date.now() / 1000);

    await impl.publishEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'local-mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
    });
    expect(latest['local-mesh-channel']).toMatchObject({ participantCount: 1 });

    await impl.publishEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'local-mesh-channel'],
        ['t', 'obelisk-voice-presence'],
        ['status', 'left'],
        ['expiration', String(now - 1)],
      ],
      created_at: now,
    });

    expect(latest['local-mesh-channel']).toBeUndefined();
    unsub();
  });


  it('ignores non-Obelisk kind 20078 events for mesh live detection', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    let latest: Readonly<Record<string, { mode?: string }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const peerSk = generateSecretKey();
    const peerPk = getPublicKey(peerSk);
    const now = Math.floor(Date.now() / 1000);
    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'mesh-channel'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
      pubkey: peerPk,
    } as Parameters<typeof finalizeEvent>[0], peerSk));
    await flush();

    expect(latest['mesh-channel']).toBeUndefined();
    unsub();
  });


  it('ignores SFU topology beacons for mesh live detection', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    let latest: Readonly<Record<string, { mode?: string }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const sfuSk = generateSecretKey();
    const sfuPk = getPublicKey(sfuSk);
    const now = Math.floor(Date.now() / 1000);
    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'voice-sfu-channel'],
        ['t', 'obelisk-voice-presence'],
        ['sfu', '1'],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
      pubkey: sfuPk,
    } as Parameters<typeof finalizeEvent>[0], sfuSk));
    await flush();

    expect(latest['voice-sfu-channel']).toBeUndefined();
    unsub();
  });


  it('uses SFU topology beacon p-tags as passive active-call participants', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    let latest: Readonly<Record<string, { mode?: string; participantCount: number; participantPubkeys?: string[]; hostPubkey?: string }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const sfuSk = generateSecretKey();
    const sfuPk = getPublicKey(sfuSk);
    const peerA = getPublicKey(generateSecretKey());
    const peerB = getPublicKey(generateSecretKey());
    const now = Math.floor(Date.now() / 1000);
    deliver(finalizeEvent({
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', 'voice-sfu-channel'],
        ['t', 'obelisk-voice-presence'],
        ['sfu', '1'],
        ['p', peerB],
        ['p', peerA],
        ['expiration', String(now + 30)],
      ],
      created_at: now,
      pubkey: sfuPk,
    } as Parameters<typeof finalizeEvent>[0], sfuSk));
    await flush();

    expect(latest['voice-sfu-channel']).toMatchObject({
      hostPubkey: sfuPk,
      mode: 'sfu',
      participantCount: 2,
      participantPubkeys: [peerA, peerB].sort(),
    });
    unsub();
  });


  it('parses SFU active-call content participants for passive rosters', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    let latest: Readonly<Record<string, { mode?: string; participantCount: number; participantPubkeys?: string[] }>> = {};
    const unsub = bridge.subscribeActiveCallByChannel((m) => { latest = m; });
    const sfuSk = generateSecretKey();
    const peerA = getPublicKey(generateSecretKey());
    const peerB = getPublicKey(generateSecretKey());
    const now = Math.floor(Date.now() / 1000);
    deliver(finalizeEvent({
      kind: KIND_SFU_ACTIVE_CALL,
      content: JSON.stringify({ participants: [peerB, peerA] }),
      tags: [
        ['d', 'voice-sfu-channel'],
        ['status', 'active'],
        ['count', '2'],
        ['expiration', String(now + 90)],
      ],
      created_at: now,
    } as Parameters<typeof finalizeEvent>[0], sfuSk));
    await flush();

    expect(latest['voice-sfu-channel']).toMatchObject({
      mode: 'sfu',
      participantCount: 2,
      participantPubkeys: [peerA, peerB].sort(),
    });
    unsub();
  });
});
