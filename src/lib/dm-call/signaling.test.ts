import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { CallSignalChannel, type CallPoolLike, DM_CALL_SIGNAL_TAG } from './signaling';
import type { VoiceSignalPayload } from '@/lib/voice/types';

/** One in-memory relay shared by both ends. */
function fakeRelay() {
  const events: NostrEvent[] = [];
  const subs: Array<{ filter: Filter; onevent: (ev: NostrEvent) => void }> = [];
  const matches = (f: Filter, ev: NostrEvent) =>
    (!f.kinds || f.kinds.includes(ev.kind))
    && (!f['#p'] || ev.tags.some((t) => t[0] === 'p' && f['#p']!.includes(t[1])));
  const pool: CallPoolLike = {
    subscribe(_relays, filter, params) {
      const sub = { filter, onevent: params.onevent };
      subs.push(sub);
      for (const ev of events) if (matches(filter, ev)) params.onevent(ev);
      return { close: () => { subs.splice(subs.indexOf(sub), 1); } };
    },
    publish(_relays, ev) {
      events.push(ev);
      for (const s of [...subs]) if (matches(s.filter, ev)) s.onevent(ev);
      return [Promise.resolve('ok')];
    },
  };
  return { pool, events };
}

const payload = (type: VoiceSignalPayload['type']): VoiceSignalPayload => ({ type, sessionId: 's', seq: 1, sdp: 'v=0 c=IN IP4 192.168.1.20' });

describe('CallSignalChannel', () => {
  it('delivers payloads between two throwaway keys, opaque to the relay', async () => {
    const relay = fakeRelay();
    const aSk = generateSecretKey();
    const bSk = generateSecretKey();
    const callId = 'f'.repeat(64);
    const got: VoiceSignalPayload[] = [];
    const a = new CallSignalChannel({ relays: ['wss://r'], selfSk: aSk, peerEph: getPublicKey(bSk), callId, onSignal: () => {}, pool: relay.pool });
    const b = new CallSignalChannel({ relays: ['wss://r'], selfSk: bSk, peerEph: getPublicKey(aSk), callId, onSignal: (p) => got.push(p), pool: relay.pool });
    a.start();
    b.start();
    await a.send(payload('offer'));
    expect(got).toEqual([payload('offer')]);

    const ev = relay.events[0];
    expect(ev.pubkey).toBe(getPublicKey(aSk));
    expect(ev.tags).toContainEqual(['p', getPublicKey(bSk)]);
    expect(ev.tags).toContainEqual(['t', DM_CALL_SIGNAL_TAG]);
    expect(ev.tags.some((t) => t[0] === 'expiration')).toBe(true);
    // Neither the call id nor the SDP (with its IP) is readable on the relay.
    expect(ev.content).not.toContain(callId);
    expect(ev.content).not.toContain('192.168');
    expect(JSON.stringify(ev.tags)).not.toContain(callId);
  });

  it('ignores events from any key but the announced peer, and other calls', async () => {
    const relay = fakeRelay();
    const aSk = generateSecretKey();
    const bSk = generateSecretKey();
    const mallory = generateSecretKey();
    const got: VoiceSignalPayload[] = [];
    const b = new CallSignalChannel({ relays: ['wss://r'], selfSk: bSk, peerEph: getPublicKey(aSk), callId: '1'.repeat(64), onSignal: (p) => got.push(p), pool: relay.pool });
    b.start();
    // Mallory knows b's throwaway key but isn't a.
    await new CallSignalChannel({ relays: ['wss://r'], selfSk: mallory, peerEph: getPublicKey(bSk), callId: '1'.repeat(64), onSignal: () => {}, pool: relay.pool }).send(payload('offer'));
    // a, but for a different call.
    await new CallSignalChannel({ relays: ['wss://r'], selfSk: aSk, peerEph: getPublicKey(bSk), callId: '2'.repeat(64), onSignal: () => {}, pool: relay.pool }).send(payload('offer'));
    expect(got).toHaveLength(0);
  });

  it('stops delivering after close', async () => {
    const relay = fakeRelay();
    const aSk = generateSecretKey();
    const bSk = generateSecretKey();
    const callId = '3'.repeat(64);
    const got: VoiceSignalPayload[] = [];
    const a = new CallSignalChannel({ relays: ['wss://r'], selfSk: aSk, peerEph: getPublicKey(bSk), callId, onSignal: () => {}, pool: relay.pool });
    const b = new CallSignalChannel({ relays: ['wss://r'], selfSk: bSk, peerEph: getPublicKey(aSk), callId, onSignal: (p) => got.push(p), pool: relay.pool });
    b.start();
    b.close();
    await a.send(payload('bye'));
    expect(got).toHaveLength(0);
  });
});
