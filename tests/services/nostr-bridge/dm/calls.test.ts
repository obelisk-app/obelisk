import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DmCallsModule } from '@/services/nostr-bridge/dm/calls';
import type { PersistedSession } from '@/services/nostr-bridge/session/session-storage';
import { encodeDmCallMessage } from '@/services/call/protocol';
import { setPreference } from '@/services/preferences/preferences';

const ME = 'a'.repeat(64);
const PEER = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
const CALL_ID = 'd'.repeat(64);
const session: PersistedSession = { pubKeyHex: ME, loginMethod: 'nsec', relayUrl: 'wss://r.example' };

function setup(current: PersistedSession | null = session) {
  const deps = {
    dmSigner: vi.fn(() => null),
    resolveGiftWrapRelays: vi.fn(async () => ({ relays: ['wss://inbox.example'] })),
    publishSignedEvent: vi.fn(),
    ownInbox: vi.fn(() => ['wss://r.example']),
  };
  return { mod: new DmCallsModule({ session: () => current }, deps), deps };
}

const rumor = (from: string, p: string, createdAt = Math.floor(Date.now() / 1000)) => ({
  id: 'rumor',
  pubkey: from,
  kind: 25055,
  created_at: createdAt,
  tags: [['p', p]],
  content: encodeDmCallMessage({ type: 'hangup', callId: CALL_ID }),
});

describe('dm/calls', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_800_000_000_000 }));
  afterEach(() => vi.useRealTimers());

  it('hands a fresh inbound control message to every listener, peer = sender', () => {
    const { mod } = setup();
    const a = vi.fn();
    const b = vi.fn();
    mod.subscribe(a);
    const stop = mod.subscribe(b);
    mod.ingest(rumor(PEER, ME), PEER);
    expect(a).toHaveBeenCalledWith(expect.objectContaining({ type: 'hangup', callId: CALL_ID, from: PEER, peer: PEER }));
    expect(b).toHaveBeenCalledTimes(1);
    stop();
    mod.ingest(rumor(PEER, ME), PEER);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('reads our own notice from another device as about the rumor p-tag peer', () => {
    const { mod } = setup();
    const cb = vi.fn();
    mod.subscribe(cb);
    mod.ingest(rumor(ME, PEER), ME);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ from: ME, peer: PEER }));
  });

  it('drops stale, misaddressed and logged-out messages, and survives a throwing listener', () => {
    const { mod } = setup();
    const cb = vi.fn();
    mod.subscribe(() => { throw new Error('boom'); });
    mod.subscribe(cb);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mod.ingest(rumor(PEER, ME, Math.floor(Date.now() / 1000) - 3600), PEER);
    mod.ingest(rumor(PEER, OTHER), PEER);
    expect(cb).not.toHaveBeenCalled();
    mod.ingest(rumor(PEER, ME), PEER);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    const loggedOut = setup(null);
    const none = vi.fn();
    loggedOut.mod.subscribe(none);
    loggedOut.mod.ingest(rumor(PEER, ME), PEER);
    expect(none).not.toHaveBeenCalled();
  });

  it('holds a message that arrives before anyone listens, and hands it to the first listener', async () => {
    const { mod } = setup();
    mod.ingest(rumor(PEER, ME), PEER);
    const cb = vi.fn();
    mod.subscribe(cb);
    expect(cb).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'hangup', from: PEER, peer: PEER }));
    // Handed over once, not to every later listener.
    const later = vi.fn();
    mod.subscribe(later);
    await vi.advanceTimersByTimeAsync(0);
    expect(later).not.toHaveBeenCalled();
    // Nor handed to a different account than the one it was for.
    let who: PersistedSession | null = session;
    const switching = new DmCallsModule({ session: () => who }, setup().deps);
    switching.ingest(rumor(PEER, ME), PEER);
    who = { ...session, pubKeyHex: OTHER };
    const otherAccount = vi.fn();
    switching.subscribe(otherAccount);
    await vi.advanceTimersByTimeAsync(0);
    expect(otherAccount).not.toHaveBeenCalled();
  });

  it('drops a held message that went stale before anyone listened, and caps what it holds', async () => {
    const { mod } = setup();
    for (let i = 0; i < 40; i++) mod.ingest(rumor(PEER, ME), PEER);
    vi.advanceTimersByTime(60 * 60 * 1000);
    mod.ingest(rumor(PEER, ME), PEER);
    const cb = vi.fn();
    mod.subscribe(cb);
    await vi.advanceTimersByTimeAsync(0);
    // The 40 went stale; only the one that arrived after the hour is fresh.
    expect(cb).toHaveBeenCalledTimes(1);
    const fresh = setup().mod;
    for (let i = 0; i < 40; i++) fresh.ingest(rumor(PEER, ME), PEER);
    const many = vi.fn();
    fresh.subscribe(many);
    await vi.advanceTimersByTimeAsync(0);
    expect(many).toHaveBeenCalledTimes(16);
  });

  it('refuses to send while logged out or with DMs off, before touching the relays', async () => {
    await expect(setup(null).mod.send(PEER, { type: 'hangup', callId: CALL_ID })).rejects.toThrow(/Not logged in/);
    setPreference('directMessagesEnabled', false);
    const { mod, deps } = setup();
    await expect(mod.send(PEER, { type: 'hangup', callId: CALL_ID })).rejects.toThrow(/Direct messages are off/);
    expect(deps.resolveGiftWrapRelays).not.toHaveBeenCalled();
  });
});
