import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeImpl } from '@/services/nostr-bridge/facade/client';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { pageRelayHub } from '@/services/nostr-bridge';
import { enterInviteRelay, redeemInvite, steerToInviteRelay } from '@/services/relay/relay-invite';
import { markRedeemed, readStoredInvite, storeInvite } from '@/services/relay/relay-invite-storage';
import { KIND_RELAY_INVITE_CLAIM } from '@/constants/nostr/nip-kinds';

const RELAY = 'wss://public.obelisk.ar';
const signEventTemplate = vi.fn(async (t: { kind: number; tags: string[][]; content: string; created_at?: number }) => ({
  ...t, id: 'id', pubkey: 'pk1', sig: 'sig', created_at: t.created_at ?? 0,
}));

beforeEach(() => {
  localStorage.clear();
  registerBridge({ signEventTemplate } as unknown as BridgeImpl);
  storeInvite('code-1', RELAY);
});
afterEach(() => {
  unregisterBridge();
  vi.restoreAllMocks();
});

function relayAnswers(status: 'ok' | 'rejected' | 'timeout', reason: string | null) {
  return vi.spyOn(pageRelayHub(), 'publish').mockResolvedValue([{ url: RELAY, status, reason } as never]);
}

describe('redeemInvite', () => {
  it('sends the claim to the invite relay only, without AUTH, and records the key on OK', async () => {
    const publish = relayAnswers('ok', null);
    const outcome = await redeemInvite(readStoredInvite()!, 'pk1');
    expect(outcome).toEqual({ status: 'admitted' });
    const spec = publish.mock.calls[0][0];
    expect(spec.relays).toEqual([RELAY]);
    expect(spec.authMode).toBe('never');
    expect(spec.event.kind).toBe(KIND_RELAY_INVITE_CLAIM);
    expect(spec.event.tags).toEqual([['claim', 'code-1']]);
    expect(readStoredInvite()?.redeemed).toEqual(['pk1']);
  });

  it('drops a code the relay says is gone for good', async () => {
    relayAnswers('rejected', 'restricted: invite exhausted: this code has no uses left');
    expect(await redeemInvite(readStoredInvite()!, 'pk1')).toEqual({ status: 'dead', reason: 'exhausted' });
    expect(readStoredInvite()).toBeNull();
  });

  it('tries a stale or unanswered claim once more, freshly signed, then keeps the code', async () => {
    signEventTemplate.mockClear();
    const publish = relayAnswers('ok', 'no ack (ephemeral kind)');
    expect((await redeemInvite(readStoredInvite()!, 'pk1', 0)).status).toBe('retry');
    expect(publish).toHaveBeenCalledTimes(2);
    publish.mockReset().mockResolvedValue([{ url: RELAY, status: 'rejected', reason: 'restricted: invite stale: clock' } as never]);
    expect((await redeemInvite(readStoredInvite()!, 'pk1', 0)).status).toBe('retry');
    expect(publish).toHaveBeenCalledTimes(2);
    expect(signEventTemplate).toHaveBeenCalledTimes(4);
    expect(readStoredInvite()).toEqual({ code: 'code-1', relay: RELAY, redeemed: [] });
  });

  it('is let in by the second try after a stale first one', async () => {
    const publish = vi.spyOn(pageRelayHub(), 'publish')
      .mockResolvedValueOnce([{ url: RELAY, status: 'rejected', reason: 'restricted: invite stale: clock' } as never])
      .mockResolvedValueOnce([{ url: RELAY, status: 'ok', reason: null } as never]);
    expect(await redeemInvite(readStoredInvite()!, 'pk1', 0)).toEqual({ status: 'admitted' });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(readStoredInvite()?.redeemed).toEqual(['pk1']);
  });

  it('does not retry a refusal that is not about time', async () => {
    const publish = relayAnswers('rejected', 'restricted: This pubkey is blocked from this relay');
    expect((await redeemInvite(readStoredInvite()!, 'pk1', 0)).status).toBe('retry');
    expect(publish).toHaveBeenCalledOnce();
  });
});

describe('steerToInviteRelay (relay trust)', () => {
  const UNKNOWN = 'wss://relay.stranger.example';

  function deps(over: Partial<Parameters<typeof steerToInviteRelay>[1]> = {}) {
    const order: string[] = [];
    const confirm = vi.fn(async () => { order.push('confirm'); return true; });
    const enter = vi.fn(async (relay: string) => { order.push(`enter ${relay}`); });
    return { order, confirm, enter, value: { current: 'wss://lacrypta-relay.obelisk.ar', configured: ['wss://lacrypta-relay.obelisk.ar'], confirm, enter, ...over } };
  }

  it('switches silently to a built-in default relay', async () => {
    const d = deps();
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('switched');
    expect(d.confirm).not.toHaveBeenCalled();
    expect(d.enter).toHaveBeenCalledWith(RELAY);
  });

  it('switches silently to a relay already in the person\'s list', async () => {
    storeInvite('code-2', 'relay.mine.example');
    const d = deps({ configured: ['wss://relay.mine.example/'] });
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('switched');
    expect(d.confirm).not.toHaveBeenCalled();
  });

  it('asks before an unknown relay, and nothing reaches it before the yes', async () => {
    storeInvite('code-3', UNKNOWN);
    const d = deps();
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('switched');
    expect(d.confirm).toHaveBeenCalledWith('relay.stranger.example');
    expect(d.order).toEqual(['confirm', `enter ${UNKNOWN}`]);
  });

  it('stays put when the person says no, and does not ask again for the same invite', async () => {
    storeInvite('code-4', UNKNOWN);
    const d = deps({ confirm: vi.fn(async () => false) });
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('declined');
    expect(d.enter).not.toHaveBeenCalled();
    expect(readStoredInvite()?.steer).toBe('declined');
    // A reload: the stored invite says it was asked already.
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('none');
    expect(d.value.confirm).toHaveBeenCalledOnce();
  });

  it('steers once per stored invite, even after it switched', async () => {
    const d = deps();
    await steerToInviteRelay(readStoredInvite(), d.value);
    expect(readStoredInvite()?.steer).toBe('offered');
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('none');
    expect(d.enter).toHaveBeenCalledOnce();
    // Opening the link again is a new request.
    storeInvite('code-1', RELAY);
    expect(readStoredInvite()?.steer).toBeUndefined();
  });

  it('leaves alone an invite that already let a key in, or that is for the relay in view', async () => {
    const d = deps({ current: RELAY });
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('none');
    markRedeemed('pk1');
    expect(await steerToInviteRelay(readStoredInvite(), deps().value)).toBe('none');
  });

  it('reports a switch that failed', async () => {
    const d = deps({ enter: vi.fn(async () => { throw new Error('unreachable'); }) });
    expect(await steerToInviteRelay(readStoredInvite(), d.value)).toBe('failed');
  });
});

describe('enterInviteRelay', () => {
  it('adds the invite relay to the rail and switches to it, even when it is already there', async () => {
    const addRelay = vi.fn().mockRejectedValueOnce(new Error('relay already added')).mockResolvedValue(undefined);
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    registerBridge({ addRelay, switchRelay } as unknown as BridgeImpl);
    await enterInviteRelay('wss://relay.wearebitcoin.org');
    await enterInviteRelay('wss://relay.wearebitcoin.org');
    expect(addRelay).toHaveBeenCalledWith('wss://relay.wearebitcoin.org');
    expect(switchRelay).toHaveBeenCalledTimes(2);
  });

  it('does not switch when the relay cannot be added', async () => {
    const switchRelay = vi.fn();
    registerBridge({ addRelay: vi.fn().mockRejectedValue(new Error('invalid relay URL')), switchRelay } as unknown as BridgeImpl);
    await expect(enterInviteRelay('wss://bad')).rejects.toThrow('invalid');
    expect(switchRelay).not.toHaveBeenCalled();
  });
});

