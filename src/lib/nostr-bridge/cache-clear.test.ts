import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllClientCacheExceptSession } from './cache-clear';

const TEST_PUBKEY = 'a'.repeat(64);
const TEST_RELAY_HOST = 'public.obelisk.ar';

function set(key: string, value: unknown): void {
  window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

function has(key: string): boolean {
  return window.localStorage.getItem(key) !== null;
}

describe('clearAllClientCacheExceptSession', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('wipes bridgeCache entries', () => {
    set(`obelisk-cache-v3/${TEST_RELAY_HOST}/39000/group-1`, { v: { id: 'g1' }, t: 1 });
    set(`obelisk-cache-v3/${TEST_RELAY_HOST}/0/${TEST_PUBKEY}`, { v: { meta: {} }, t: 1 });
    set(`obelisk-cache-v3/${TEST_RELAY_HOST}/39001/group-1`, { v: ['a'], t: 1 });

    const removed = clearAllClientCacheExceptSession();

    expect(removed).toBe(3);
    expect(has(`obelisk-cache-v3/${TEST_RELAY_HOST}/39000/group-1`)).toBe(false);
    expect(has(`obelisk-cache-v3/${TEST_RELAY_HOST}/0/${TEST_PUBKEY}`)).toBe(false);
    expect(has(`obelisk-cache-v3/${TEST_RELAY_HOST}/39001/group-1`)).toBe(false);
  });

  it('wipes legacy bridgeCache prefixes', () => {
    set('obelisk-cache/old-key', 'x');
    set('obelisk-cache-v2/older-key', 'y');

    clearAllClientCacheExceptSession();

    expect(has('obelisk-cache/old-key')).toBe(false);
    expect(has('obelisk-cache-v2/older-key')).toBe(false);
  });

  it('wipes per-account stores (read-state, DM, forum-follow)', () => {
    set(`obelisk-read-state:${TEST_PUBKEY}`, { state: {} });
    set(`obelisk-dm-store:${TEST_PUBKEY}`, { state: {} });
    set(`obelisk-forum-follow:${TEST_PUBKEY}`, { state: {} });

    clearAllClientCacheExceptSession();

    expect(has(`obelisk-read-state:${TEST_PUBKEY}`)).toBe(false);
    expect(has(`obelisk-dm-store:${TEST_PUBKEY}`)).toBe(false);
    expect(has(`obelisk-forum-follow:${TEST_PUBKEY}`)).toBe(false);
  });

  it('wipes UI flags (forum-collapsed, mobile-setup-seen, just-generated)', () => {
    set('obelisk-dex/forum-collapsed/some-group', '1');
    set(`obelisk-dex/mobile-setup-seen/${TEST_PUBKEY}`, '1');
    set(`obelisk-dex/just-generated/${TEST_PUBKEY}`, '1');

    clearAllClientCacheExceptSession();

    expect(has('obelisk-dex/forum-collapsed/some-group')).toBe(false);
    expect(has(`obelisk-dex/mobile-setup-seen/${TEST_PUBKEY}`)).toBe(false);
    expect(has(`obelisk-dex/just-generated/${TEST_PUBKEY}`)).toBe(false);
  });

  it('wipes NIP-11 cache and voice-chat-width', () => {
    set('obelisk:relay-info-v2', { foo: 1 });
    set('obelisk:voice-chat-width', '320');

    clearAllClientCacheExceptSession();

    expect(has('obelisk:relay-info-v2')).toBe(false);
    expect(has('obelisk:voice-chat-width')).toBe(false);
  });

  it('preserves session, relays config, and preferences', () => {
    set('obelisk-dex/session', { privKeyHex: 'aa', pubKeyHex: TEST_PUBKEY, relayUrl: 'wss://x', loginMethod: 'nsec' });
    set('obelisk-dex/relays', ['wss://public.obelisk.ar']);
    set('obelisk:preferences', { showActivityIndicator: true });
    set(`obelisk-cache-v3/${TEST_RELAY_HOST}/39000/group-1`, { v: { id: 'g1' }, t: 1 });

    const removed = clearAllClientCacheExceptSession();

    expect(removed).toBe(1);
    expect(has('obelisk-dex/session')).toBe(true);
    expect(has('obelisk-dex/relays')).toBe(true);
    expect(has('obelisk:preferences')).toBe(true);
    expect(has(`obelisk-cache-v3/${TEST_RELAY_HOST}/39000/group-1`)).toBe(false);
  });

  it('returns 0 when nothing matches', () => {
    set('obelisk-dex/session', { x: 1 });
    set('obelisk:preferences', { y: 2 });
    set('some-unrelated-key', 'z');

    const removed = clearAllClientCacheExceptSession();

    expect(removed).toBe(0);
    expect(has('obelisk-dex/session')).toBe(true);
    expect(has('obelisk:preferences')).toBe(true);
    expect(has('some-unrelated-key')).toBe(true);
  });

  it('is idempotent', () => {
    set(`obelisk-cache-v3/${TEST_RELAY_HOST}/0/${TEST_PUBKEY}`, { v: {}, t: 1 });

    const first = clearAllClientCacheExceptSession();
    const second = clearAllClientCacheExceptSession();

    expect(first).toBe(1);
    expect(second).toBe(0);
  });
});
