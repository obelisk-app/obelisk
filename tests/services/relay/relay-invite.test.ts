import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeImpl } from '@/services/nostr-bridge/facade/client';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { pageRelayHub } from '@/services/nostr-bridge';
import { redeemInvite } from '@/services/relay/relay-invite';
import { readStoredInvite, storeInvite } from '@/services/relay/relay-invite-storage';
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

  it('keeps the code to try again when the answer is unclear', async () => {
    relayAnswers('ok', 'no ack (ephemeral kind)');
    expect((await redeemInvite(readStoredInvite()!, 'pk1')).status).toBe('retry');
    relayAnswers('rejected', 'restricted: invite stale: clock');
    expect((await redeemInvite(readStoredInvite()!, 'pk1')).status).toBe('retry');
    expect(readStoredInvite()).toEqual({ code: 'code-1', relay: RELAY, redeemed: [] });
  });
});
