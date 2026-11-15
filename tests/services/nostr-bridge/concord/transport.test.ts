import { describe, expect, it, vi } from 'vitest';
import type { SubscribeSpec, PublishResult } from '@nostr-wot/relay/hub';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { createConcordTransport } from '@/services/nostr-bridge/concord/transport';
import { KIND_GIFT_WRAP } from '@/constants/nostr/nip-kinds';

function harness() {
  const release = vi.fn();
  let subscription: SubscribeSpec | undefined;
  const hub = {
    setIdentity: vi.fn(), removeIdentity: vi.fn(),
    subscribe: vi.fn((spec: SubscribeSpec) => {
      subscription = spec;
      return { release, keys: ['test'], shared: false, setPriority: vi.fn() };
    }),
    publish: vi.fn(async (): Promise<readonly PublishResult[]> => [
      { url: 'wss://one.example', status: 'ok', reason: null },
      { url: 'wss://two.example', status: 'timeout', reason: null },
    ]),
  };
  return { hub, release, subscription: () => subscription! };
}

describe('Concord hub transport', () => {
  const event = finalizeEvent({ kind: KIND_GIFT_WRAP, tags: [], content: 'ciphertext', created_at: 1 }, generateSecretKey());

  it('isolates sockets and preserves individual publish outcomes', async () => {
    const { hub } = harness();
    const transport = createConcordTransport(hub, 'concord:session-one');
    expect(hub.setIdentity).toHaveBeenCalledWith({ id: 'concord:session-one', pubkey: null, signer: null, authPolicy: 'never-auth' });
    const relays = ['wss://one.example', 'wss://two.example'];
    const result = await transport.publish(relays, event);
    expect(result.map(row => row.status)).toEqual(['ok', 'timeout']);
    expect(hub.publish).toHaveBeenCalledWith({ relays, event, identityId: 'concord:session-one', authMode: 'never' });
    transport.dispose();
    await expect(transport.publish(relays, event)).rejects.toThrow('Concord session ended');
  });

  it('releases subscriptions and suppresses late callbacks after disposal', () => {
    const h = harness();
    const transport = createConcordTransport(h.hub, 'concord:session-two');
    const onEvent = vi.fn();
    transport.subscribe(['wss://one.example'], [{ kinds: [KIND_GIFT_WRAP] }], { onEvent });
    transport.dispose();
    transport.dispose();
    h.subscription().onEvent(event, 'wss://one.example');
    expect(onEvent).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.hub.removeIdentity).toHaveBeenCalledTimes(1);
  });
});
