import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { CallSignalChannel, DM_CALL_SIGNAL_TAG, FLUSH_MS, MAX_ATTEMPTS, RESEND_MS } from './signaling';
import { fakeEphemeralRelay } from './fake-ephemeral-relay';
import type { VoiceSignalPayload } from '@/lib/voice/types';

const CALL = 'f'.repeat(64);
const sig = (type: VoiceSignalPayload['type'], extra: Partial<VoiceSignalPayload> = {}): VoiceSignalPayload => ({
  type, sessionId: 's1', seq: 1, sdp: 'v=0 c=IN IP4 192.168.1.20', ...extra,
});

function pair(relay = fakeEphemeralRelay()) {
  const aSk = generateSecretKey();
  const bSk = generateSecretKey();
  const gotA: VoiceSignalPayload[] = [];
  const gotB: VoiceSignalPayload[] = [];
  const hellosA: string[] = [];
  // a = caller: doesn't know b's key yet.
  const a = new CallSignalChannel({ relays: ['wss://r'], selfSk: aSk, callId: CALL, onSignal: (p) => gotA.push(p), onHello: (k) => hellosA.push(k), pool: relay.pool });
  // b = callee: knows a's key from the invite.
  const b = new CallSignalChannel({ relays: ['wss://r'], selfSk: bSk, peerEph: getPublicKey(aSk), callId: CALL, onSignal: (p) => gotB.push(p), pool: relay.pool });
  return { relay, a, b, aSk, bSk, gotA, gotB, hellosA };
}

describe('CallSignalChannel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('learns the peer from its hello, then delivers both ways, opaque to the relay', async () => {
    const { relay, a, b, bSk, gotA, gotB, hellosA } = pair();
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(10);
    b.sendHello();
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 5);
    expect(hellosA).toEqual([getPublicKey(bSk)]);
    expect(a.peer).toBe(getPublicKey(bSk));

    await a.send(sig('offer'));
    await vi.advanceTimersByTimeAsync(FLUSH_MS * 3);
    expect(gotB).toEqual([sig('offer')]);
    await b.send(sig('answer'));
    await vi.advanceTimersByTimeAsync(FLUSH_MS * 3);
    expect(gotA).toEqual([sig('answer')]);

    for (const ev of relay.published) {
      expect(ev.tags).toContainEqual(['t', DM_CALL_SIGNAL_TAG]);
      expect(ev.tags.some((t) => t[0] === 'expiration')).toBe(true);
      expect(ev.content).not.toContain(CALL);
      expect(ev.content).not.toContain('192.168');
    }
  });

  it('gets a message through when it was sent before the other side was subscribed', async () => {
    // The race behind "sometimes it never connects": the offer went out
    // before the callee's REQ was live, and an ephemeral relay keeps nothing.
    const relay = fakeEphemeralRelay({ liveDelayMs: 2500 });
    const { a, b, bSk, gotB } = pair(relay);
    a.setPeer(getPublicKey(bSk));
    a.start();
    await a.send(sig('offer'));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 5);
    b.start(); // the callee subscribes only now
    await vi.advanceTimersByTimeAsync(2500 + RESEND_MS * 2);
    expect(gotB).toEqual([sig('offer')]);
  });

  it('re-sends lost events until acked, and delivers each message exactly once', async () => {
    let dropped = 0;
    const relay = fakeEphemeralRelay({ drop: (_ev, n) => n < 3 && ++dropped > 0 });
    const { a, b, bSk, gotB } = pair(relay);
    a.setPeer(getPublicKey(bSk));
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(10);
    await a.send(sig('offer'));
    await a.send(sig('ice', { seq: 2 }));
    await vi.advanceTimersByTimeAsync(RESEND_MS * 6);
    expect(dropped).toBe(3);
    expect(gotB.map((p) => p.type)).toEqual(['offer', 'ice']);
    // Once acked, it stops re-sending.
    const count = relay.published.length;
    await vi.advanceTimersByTimeAsync(RESEND_MS * 5);
    expect(relay.published.length).toBe(count);
  });

  it('batches an offer and its candidates into one event', async () => {
    const { relay, a, b, bSk } = pair();
    a.setPeer(getPublicKey(bSk));
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(10);
    const before = relay.published.length;
    await a.send(sig('offer'));
    for (let i = 0; i < 6; i++) await a.send(sig('ice', { seq: i + 2 }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 1);
    expect(relay.published.length - before).toBe(1);
  });

  it('gives up on a message after MAX_ATTEMPTS sends', async () => {
    const relay = fakeEphemeralRelay({ drop: () => true });
    const { a, bSk } = pair(relay);
    a.setPeer(getPublicKey(bSk));
    a.start();
    await a.send(sig('offer'));
    await vi.advanceTimersByTimeAsync(RESEND_MS * (MAX_ATTEMPTS + 5));
    expect(relay.published.length).toBe(MAX_ATTEMPTS);
  });

  it('drops queued re-sends of a torn-down session', async () => {
    const relay = fakeEphemeralRelay({ drop: () => true });
    const { a, bSk } = pair(relay);
    a.setPeer(getPublicKey(bSk));
    a.start();
    await a.send(sig('offer', { sessionId: 'old' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 1);
    a.dropSession('old');
    const n = relay.published.length;
    await vi.advanceTimersByTimeAsync(RESEND_MS * 4);
    expect(relay.published.length).toBe(n);
  });

  it('ignores strangers: a non-hello from an unknown key, a hello for another call, and anyone once pinned', async () => {
    const relay = fakeEphemeralRelay();
    const aSk = generateSecretKey();
    const hellos: string[] = [];
    const got: VoiceSignalPayload[] = [];
    const a = new CallSignalChannel({ relays: ['wss://r'], selfSk: aSk, callId: CALL, onSignal: (p) => got.push(p), onHello: (k) => hellos.push(k), pool: relay.pool });
    a.start();
    await vi.advanceTimersByTimeAsync(10);
    const from = (sk: Uint8Array, callId: string) => new CallSignalChannel({ relays: ['wss://r'], selfSk: sk, peerEph: getPublicKey(aSk), callId, onSignal: () => {}, pool: relay.pool });
    // Knows our key, but sends a signal without saying hello first.
    await from(generateSecretKey(), CALL).send(sig('offer'));
    // Hello, but for another call.
    from(generateSecretKey(), 'e'.repeat(64)).sendHello();
    await vi.advanceTimersByTimeAsync(FLUSH_MS * 3);
    expect(a.peer).toBeNull();
    expect(got).toHaveLength(0);
    // The real callee pins; a second "callee" is ignored afterwards.
    const bSk = generateSecretKey();
    from(bSk, CALL).sendHello();
    await vi.advanceTimersByTimeAsync(FLUSH_MS * 3);
    expect(a.peer).toBe(getPublicKey(bSk));
    from(generateSecretKey(), CALL).sendHello();
    await vi.advanceTimersByTimeAsync(FLUSH_MS * 3);
    expect(hellos).toEqual([getPublicKey(bSk)]);
  });

  it('resolves ready on EOSE', async () => {
    const relay = fakeEphemeralRelay({ liveDelayMs: 300 });
    const { a } = pair(relay);
    let ready = false;
    void a.ready.then(() => { ready = true; });
    a.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(ready).toBe(true);
  });

  it('keeps every event under the NIP-44 size cap', async () => {
    const { relay, a, b, bSk, aSk } = pair();
    a.setPeer(getPublicKey(bSk));
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(10);
    const big = 'x'.repeat(15_000);
    for (let i = 0; i < 5; i++) await a.send(sig('offer', { sdp: big, seq: i }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS * 10);
    const conv = nip44.utils.getConversationKey(aSk, getPublicKey(bSk));
    for (const ev of relay.published.filter((e) => e.pubkey === getPublicKey(aSk))) {
      expect(nip44.decrypt(ev.content, conv).length).toBeLessThan(65_535);
    }
  });
});
