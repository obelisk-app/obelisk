import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The call session (WebRTC, simple-peer) is fetched on demand
 * (`services/dm-call/load-session.ts`). These pin what that must never cost:
 * an invite rings with nothing loaded, and no call is lost or doubled while
 * the download is in flight, slow, or failed.
 */

const sent = vi.hoisted(() => [] as Array<{ peer: string; msg: { type: string; callId: string } }>);
vi.mock('@/services/nostr-bridge/client', () => {
  const bridge = {
    sendDmCallMessage: vi.fn(async (peer: string, msg: never) => { sent.push({ peer, msg }); }),
    myContactList: { get: () => ({ tags: [['p', 'b'.repeat(64)]] }) },
    displayNameFor: () => 'Bob',
    getPublicKey: () => 'a'.repeat(64),
    subscribeDmCallMessages: vi.fn(() => () => {}),
    subscribeDirectMessages: vi.fn(() => () => {}),
  };
  return { getBridge: async () => bridge, getBridgeImpl: () => bridge };
});

const ring = vi.hoisted(() => ({ incoming: 0, stopped: 0 }));
vi.mock('@/services/notifications/alert', () => ({
  ringIncomingCall: () => { ring.incoming++; return { stop: () => { ring.stopped++; } }; },
  startRingback: () => ({ stop: () => {} }),
}));

/** The loader, under the test's control: each load waits for `release` or `fail`. */
const loader = vi.hoisted(() => ({
  loads: 0,
  prefetches: 0,
  release: (() => {}) as () => void,
  fail: (() => {}) as (e: Error) => void,
  sessions: [] as Array<{ calls: string[] }>,
}));
vi.mock('@/services/dm-call/load-session', () => {
  class FakeSession {
    selfEph = 'e'.repeat(64);
    calls: string[] = [];
    constructor() { loader.sessions.push(this); }
    async acquireMedia() { this.calls.push('acquire'); }
    listen() { this.calls.push('listen'); }
    async answer(eph: string) { this.calls.push(`answer:${eph}`); }
    peerAccepted() {}
    hangup() {}
    end(reason: string) { this.calls.push(`end:${reason}`); }
  }
  let pending: Promise<{ DmCallSession: typeof FakeSession }> | null = null;
  const load = () => {
    loader.loads++;
    if (!pending) {
      pending = new Promise((resolve, reject) => {
        loader.release = () => resolve({ DmCallSession: FakeSession });
        loader.fail = (e) => { pending = null; reject(e); };
      });
    }
    return pending;
  };
  return {
    loadDmCallSession: load,
    prefetchDmCallSession: () => { loader.prefetches++; load().catch(() => {}); },
    reset: () => { pending = null; },
  };
});

const ME = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const CALL = 'c'.repeat(64);
const EPH = 'f'.repeat(64);

import { __resetDmCallsForTests, handleDmCallMessage, useDmCallStore } from '@/store/dm-call';
import * as loadSession from '@/services/dm-call/load-session';
import { setPreference } from '@/services/preferences';

const invite = () => ({
  type: 'invite' as const, callId: CALL, eph: EPH, relays: ['wss://call.example'], video: false,
  from: BOB, sentAt: Date.now() / 1000, peer: BOB,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('dm-call store with the session not loaded yet', () => {
  beforeEach(() => {
    __resetDmCallsForTests();
    (loadSession as unknown as { reset: () => void }).reset();
    Object.assign(loader, { loads: 0, prefetches: 0, sessions: [] });
    Object.assign(ring, { incoming: 0, stopped: 0 });
    sent.length = 0;
    setPreference('callsFrom', 'contacts');
    setPreference('callIpProtection', 'never');
    setPreference('callRelays', ['wss://call.example']);
  });
  afterEach(() => { __resetDmCallsForTests(); });

  it('rings at once, with nothing loaded, and starts the download only after the ring', () => {
    handleDmCallMessage(invite(), ME);
    expect(ring.incoming).toBe(1);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'incoming', peer: BOB, callId: CALL });
    expect(loader.prefetches).toBe(1);
    expect(loader.sessions).toHaveLength(0);
  });

  it('an accept clicked while the session downloads waits for it, then answers', async () => {
    handleDmCallMessage(invite(), ME);
    const accepting = useDmCallStore.getState().acceptCall(false);
    await flush();
    expect(ring.stopped).toBe(1);
    expect(loader.sessions).toHaveLength(0);
    // A second click while it loads does not build a second session.
    const again = useDmCallStore.getState().acceptCall(false);
    loader.release();
    await Promise.all([accepting, again]);
    expect(loader.sessions).toHaveLength(1);
    expect(loader.sessions[0].calls).toEqual(['acquire', `answer:${EPH}`]);
    expect(useDmCallStore.getState().status).toBe('connecting');
    expect(sent.map((s) => s.msg.type)).toEqual(['accept']);
  });

  it('a cancel that lands while the session downloads ends the call and builds nothing', async () => {
    handleDmCallMessage(invite(), ME);
    const accepting = useDmCallStore.getState().acceptCall(false);
    await flush();
    handleDmCallMessage({ type: 'cancel', callId: CALL, from: BOB, sentAt: 0, peer: BOB }, ME);
    loader.release();
    await accepting;
    expect(loader.sessions).toHaveLength(0);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'ended', endReason: 'missed' });
  });

  it('a download that fails declines the call with an error, and the next call tries again', async () => {
    handleDmCallMessage(invite(), ME);
    const accepting = useDmCallStore.getState().acceptCall(false);
    await flush();
    loader.fail(new Error('chunk failed'));
    await accepting;
    expect(useDmCallStore.getState()).toMatchObject({ status: 'ended', endReason: 'error', error: 'chunk failed' });
    expect(sent.map((s) => s.msg.type)).toEqual(['decline']);

    __resetDmCallsForTests();
    const calling = useDmCallStore.getState().startCall(BOB, false);
    await flush();
    loader.release();
    await calling;
    expect(loader.sessions).toHaveLength(1);
    expect(sent.map((s) => s.msg.type)).toEqual(['decline', 'invite']);
  });

  it('an outgoing call shows "Calling" before the download lands, and a double click starts one call', async () => {
    const first = useDmCallStore.getState().startCall(BOB, false);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'outgoing', peer: BOB });
    const second = useDmCallStore.getState().startCall(BOB, true);
    loader.release();
    await Promise.all([first, second]);
    expect(loader.sessions).toHaveLength(1);
    expect(sent.filter((s) => s.msg.type === 'invite')).toHaveLength(1);
  });

  it('hanging up while the call still loads sends nothing and builds nothing', async () => {
    const calling = useDmCallStore.getState().startCall(BOB, false);
    await flush();
    useDmCallStore.getState().hangup();
    loader.release();
    await calling;
    expect(loader.sessions).toHaveLength(0);
    expect(sent).toEqual([]);
    expect(useDmCallStore.getState()).toMatchObject({ status: 'ended', endReason: 'cancelled' });
  });

  it('an invite during an outgoing call that is still loading gets a busy, not a second ring', async () => {
    const calling = useDmCallStore.getState().startCall(BOB, false);
    handleDmCallMessage({ ...invite(), callId: 'd'.repeat(64) }, ME);
    expect(ring.incoming).toBe(0);
    loader.release();
    await calling;
    await flush();
    expect(sent.map((s) => s.msg.type).sort()).toEqual(['busy', 'invite']);
  });
});
