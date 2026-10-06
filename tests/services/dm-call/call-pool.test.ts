/**
 * The DM call's privacy property, on the real hub (round 16): a call rides
 * the page's relay hub under its own `never-auth` identity, so even on a
 * relay the user is browsing and authenticated to, the call's REQs and
 * EVENTs go out on a different socket, and that socket never answers a
 * NIP-42 challenge, with the session's key or any other. A relay therefore
 * cannot tie the call's throwaway key to the user through AUTH
 * (`audits/obelisk/round2/DECISIONS.md` §1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { callIdentityId, createCallPool } from '@/services/dm-call/call-pool';
import { A, flush, makeHub, makeSigner, sessionIdentity, type TestHub, type TestSigner } from '@/lib/relay-hub/test-support';

const CALL = 'call-1';

describe('a DM call on the relay hub', () => {
  let t: TestHub;
  let session: TestSigner;

  beforeEach(async () => {
    vi.useFakeTimers();
    t = makeHub();
    session = makeSigner();
    t.hub.setIdentity(sessionIdentity(session));
    // The user is browsing relay A and has authenticated to it.
    t.hub.acquireAuthLease(A, 'active');
    await t.hub.connect(A);
    t.factory.get(A)?.challenge('session-challenge');
    await flush();
    t.factory.get(A)?.acceptAuth();
    await flush();
    expect(t.hub.status(A).auth).toBe('authenticated');
  });
  afterEach(() => {
    t.hub.dispose();
    vi.useRealTimers();
  });

  function startCall() {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const pool = createCallPool(t.hub, CALL, pubkey);
    const events: string[] = [];
    let ready = false;
    const sub = pool.subscribe([A], { kinds: [25050], '#p': [pubkey] }, {
      onevent: (ev) => events.push(ev.id),
      oneose: () => { ready = true; },
    });
    const signal = finalizeEvent({ kind: 25050, created_at: 1, content: 'opaque', tags: [['p', 'b'.repeat(64)]] }, sk);
    return { pool, sub, signal, events, isReady: () => ready };
  }

  it('never shares a socket with the session identity, even on a relay the user is browsing', async () => {
    const call = startCall();
    await flush();
    const sessionSocket = t.factory.get(A, 'session');
    const callSocket = t.factory.get(A, callIdentityId(CALL));
    expect(sessionSocket).toBeDefined();
    expect(callSocket).toBeDefined();
    expect(callSocket).not.toBe(sessionSocket);

    // The call's REQ is on the call socket only.
    expect(callSocket?.reqLog.map((r) => r.filters[0].kinds)).toEqual([[25050]]);
    expect(sessionSocket?.reqLog.some((r) => r.filters.some((f) => f.kinds?.includes(25050)))).toBe(false);
    callSocket?.eose();
    expect(call.isReady()).toBe(true);

    // And so is its EVENT.
    await expect(call.pool.publish([A], call.signal)).resolves.toBeDefined();
    expect(callSocket?.published.map((e) => e.id)).toEqual([call.signal.id]);
    expect(sessionSocket?.published).toEqual([]);
  });

  it("never answers a challenge on the call's socket, with the session key or any other", async () => {
    const call = startCall();
    await flush();
    const callSocket = t.factory.get(A, callIdentityId(CALL));
    const promptsBefore = session.calls.length;
    expect(callSocket?.onauth).toBeUndefined();

    // The relay challenges the call's socket. Nothing may answer it, even
    // with someone asking for permission on the call identity.
    t.hub.acquireAuthLease(A, 'voice', callIdentityId(CALL));
    callSocket?.challenge('call-challenge');
    await flush();
    expect(callSocket?.onauth).toBeUndefined();
    expect(callSocket?.sentAuth).toEqual([]);
    expect(session.calls).toHaveLength(promptsBefore);
    expect(session.calls.every((tpl) => !tpl.tags.some((tag) => tag[0] === 'challenge' && tag[1] === 'call-challenge'))).toBe(true);
    expect(t.hub.status(A, callIdentityId(CALL)).auth).toBe('none');

    // A publish the relay refuses for want of AUTH is reported, not answered.
    callSocket!.autoAck = false;
    const signal = finalizeEvent({ kind: 1, created_at: 1, content: '', tags: [] }, generateSecretKey());
    const refused = call.pool.publish([A], signal);
    await flush();
    callSocket?.rejectPublish(signal.id, 'auth-required: members only');
    await expect(refused).rejects.toThrow(/auth-required/);
    await expect(refused).rejects.toMatchObject({ code: 'call-relay-failed' });
    expect(callSocket?.sentAuth).toEqual([]);
    expect(session.calls).toHaveLength(promptsBefore);
  });

  it('a finished call removes its identity: its socket closes, the session socket stays up', async () => {
    const call = startCall();
    await flush();
    const callSocket = t.factory.get(A, callIdentityId(CALL));
    call.sub.close();
    call.pool.destroy?.();
    expect(t.hub.getIdentity(callIdentityId(CALL))).toBeUndefined();
    expect(callSocket?.connected).toBe(false);
    expect(t.hub.statuses().map((s) => s.identityId)).toEqual(['session']);
    expect(t.hub.status(A)).toMatchObject({ connection: 'connected', auth: 'authenticated' });
    call.pool.destroy?.(); // idempotent
  });
});
