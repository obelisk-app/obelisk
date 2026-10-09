import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Nip46Signer } from '@nostr-wot/signers';
import { SimplePool } from 'nostr-tools/pool';
import { installLoginTrace, traceSignerFrame } from '@/services/session/login-trace-sdk';
import { traceLogin, traceLoginFailure, traceRelayHost } from '@/services/session/login-trace';

const secret = 'never-log-this-pairing-secret';
let detach: (() => void) | undefined;
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  detach?.(); detach = undefined;
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});
function logs() { return JSON.stringify(vi.mocked(console.info).mock.calls); }

describe('safe login diagnostics', () => {
  it('does not log in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const start = Nip46Signer.startNostrConnect;
    detach = installLoginTrace();
    traceLogin('test');
    expect(console.info).not.toHaveBeenCalled();
    expect(Nip46Signer.startNostrConnect).toBe(start);
  });

  it('records protocol progress without payloads, full keys, auth challenges or echoed errors', () => {
    const context = { attempt: 1, relay: traceRelayHost(`wss://user:${secret}@relay.example/private?token=${secret}`) };
    const event = { kind: 24133, id: secret, pubkey: secret, tags: [['p', secret]], content: `${secret}?iv=${secret}` };
    for (const frame of [
      ['REQ', secret, { kinds: [24133], '#p': [secret] }],
      ['EVENT', secret, event], ['AUTH', secret],
      ['CLOSED', secret, `auth-required: ${secret}`],
      ['NOTICE', secret], ['OK', secret, false, `invalid: ${secret}`],
    ]) traceSignerFrame(JSON.stringify(frame), 'receive', context);
    traceSignerFrame(JSON.stringify(['EVENT', event]), 'send', context);
    expect(logs()).not.toContain(secret);
    expect(logs()).toContain('nip04');
    expect(logs()).toContain('auth-required');
    expect(logs()).toContain('relay.example');
    expect(traceLoginFailure(new Error(`bunker://${secret}`))).toBe('secret');
  });

  it('preserves pairing, signer results, cancellation, and restores the SDK after the last observer', async () => {
    const getPublicKey = vi.fn().mockResolvedValue(secret);
    const signer = { getPublicKey } as unknown as Nip46Signer;
    const cancel = vi.fn();
    const start = vi.spyOn(Nip46Signer, 'startNostrConnect').mockReturnValue({
      uri: `nostrconnect://client?secret=${secret}`, clientPubkey: secret, cancel, ready: Promise.resolve(signer),
    });
    detach = installLoginTrace();
    const otherDetach = installLoginTrace();
    const pool = new SimplePool();
    const handle = Nip46Signer.startNostrConnect({ relays: ['wss://relay.example'], pool, secret });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ pool, secret }));
    expect(handle.uri).toContain(secret);
    expect(await handle.ready).toBe(signer);
    expect(await signer.getPublicKey()).toBe(secret);
    handle.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    expect(getPublicKey).toHaveBeenCalledOnce();
    expect(logs()).toContain('sdk.pairing.accepted');
    expect(logs()).toContain('sdk.get-public-key.success');
    expect(logs()).not.toContain(secret);
    detach(); detach();
    expect(Nip46Signer.startNostrConnect).not.toBe(start);
    otherDetach();
    expect(Nip46Signer.startNostrConnect).toBe(start);
  });

  it('rethrows the original bunker failure without leaking its URI', async () => {
    const error = new Error(`connection failed: bunker://${secret}`);
    vi.spyOn(Nip46Signer, 'fromBunkerUri').mockRejectedValue(error);
    detach = installLoginTrace();
    await expect(Nip46Signer.fromBunkerUri(`bunker://${secret}`, { pool: new SimplePool() })).rejects.toBe(error);
    expect(logs()).toContain('sdk.bunker.failure');
    expect(logs()).not.toContain(secret);
  });
});
