/**
 * The lease bookkeeping behind "a socket answers AUTH only while someone
 * asked it to", and the rule that turns a lease count into a signer.
 */
import { describe, expect, it } from 'vitest';
import { AuthLeases, wantsSigner } from '@/lib/relay-hub/auth-leases';
import { makeSigner, sessionIdentity, ephemeralIdentity } from '@/lib/relay-hub/test-support';

describe('AuthLeases', () => {
  it('refcounts per socket key across reasons and forgets the row at zero', () => {
    const leases = new AuthLeases();
    leases.acquire('wss://a/|session', 'active');
    leases.acquire('wss://a/|session', 'dm');
    leases.acquire('wss://a/|session', 'active');
    expect(leases.count('wss://a/|session')).toBe(3);
    expect(leases.release('wss://a/|session', 'active')).toBe(2);
    expect(leases.release('wss://a/|session', 'dm')).toBe(1);
    expect(leases.release('wss://a/|session', 'active')).toBe(0);
    expect(leases.count('wss://a/|session')).toBe(0);
    expect(leases.release('wss://a/|session', 'active')).toBeNull();
  });

  it('drops one identity\'s rows only, and clear drops all', () => {
    const leases = new AuthLeases();
    leases.acquire('wss://a/|session', 'active');
    leases.acquire('wss://a/|ephemeral:1', 'voice');
    leases.dropIdentity('ephemeral:1');
    expect(leases.count('wss://a/|ephemeral:1')).toBe(0);
    expect(leases.count('wss://a/|session')).toBe(1);
    leases.clear();
    expect(leases.count('wss://a/|session')).toBe(0);
  });
});

describe('wantsSigner', () => {
  const signer = makeSigner();

  it('needs an auth-when-challenged identity with a pubkey, a signer and a lease', () => {
    expect(wantsSigner(sessionIdentity(signer), 1)).toBe(true);
    expect(wantsSigner(sessionIdentity(signer), 0)).toBe(false);
    expect(wantsSigner(sessionIdentity(signer, { signer: null }), 1)).toBe(false);
    expect(wantsSigner(sessionIdentity(signer, { pubkey: null }), 1)).toBe(false);
  });

  it('never gives a never-auth identity a signer, whatever its leases', () => {
    expect(wantsSigner(ephemeralIdentity('c1', signer), 5)).toBe(false);
  });
});
