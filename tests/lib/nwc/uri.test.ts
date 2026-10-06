import { describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import { NwcError, parseNwcUri } from '@/lib/nwc';

const WALLET = 'b'.repeat(64);
const SECRET = '1'.repeat(64);

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(NwcError);
    return (e as NwcError).code;
  }
}

describe('parseNwcUri', () => {
  it('reads the wallet, the relays, the client key and the address', () => {
    const c = parseNwcUri(`  nostr+walletconnect://${WALLET}?relay=wss%3A%2F%2Frelay.one.example&relay=wss://relay.two.example/&secret=${SECRET}&lud16=ana%40getalby.com `);
    expect(c.walletPubkey).toBe(WALLET);
    expect(c.relays).toEqual(['wss://relay.one.example/', 'wss://relay.two.example/']);
    expect(c.clientPubkey).toBe(getPublicKey(c.secret));
    expect(c.lud16).toBe('ana@getalby.com');
  });

  it('accepts the older scheme spelling and upper-case hex', () => {
    const c = parseNwcUri(`nostrwalletconnect://${WALLET.toUpperCase()}?relay=wss://r.example&secret=${SECRET}`);
    expect(c.walletPubkey).toBe(WALLET);
    expect(c.lud16).toBeNull();
  });

  it('keeps at most three relays and drops duplicates', () => {
    const relays = ['a', 'b', 'a', 'c', 'd'].map((h) => `relay=wss://${h}.example`).join('&');
    expect(parseNwcUri(`nostr+walletconnect://${WALLET}?${relays}&secret=${SECRET}`).relays)
      .toEqual(['wss://a.example/', 'wss://b.example/', 'wss://c.example/']);
  });

  it('allows ws:// only for a local relay', () => {
    expect(parseNwcUri(`nostr+walletconnect://${WALLET}?relay=ws://localhost:7777&secret=${SECRET}`).relays).toEqual(['ws://localhost:7777/']);
    expect(codeOf(() => parseNwcUri(`nostr+walletconnect://${WALLET}?relay=ws://relay.example&secret=${SECRET}`))).toBe('nwc-invalid-uri');
  });

  it.each([
    ['another scheme', `https://${WALLET}?relay=wss://r.example&secret=${SECRET}`],
    ['a short wallet key', `nostr+walletconnect://${'b'.repeat(63)}?relay=wss://r.example&secret=${SECRET}`],
    ['no secret', `nostr+walletconnect://${WALLET}?relay=wss://r.example`],
    ['a short secret', `nostr+walletconnect://${WALLET}?relay=wss://r.example&secret=abc`],
    ['a zero secret', `nostr+walletconnect://${WALLET}?relay=wss://r.example&secret=${'0'.repeat(64)}`],
    ['no relay', `nostr+walletconnect://${WALLET}?secret=${SECRET}`],
    ['an http relay', `nostr+walletconnect://${WALLET}?relay=https://r.example&secret=${SECRET}`],
    ['a relay with credentials', `nostr+walletconnect://${WALLET}?relay=wss://u:p@r.example&secret=${SECRET}`],
    ['plain text', 'not a link'],
  ])('refuses %s', (_label, uri) => {
    expect(codeOf(() => parseNwcUri(uri))).toBe('nwc-invalid-uri');
  });
});
