import { describe, expect, it, vi } from 'vitest';
import type { RelayHub, SubscribeSpec } from '@nostr-wot/relay/hub';
import { concordSocketConstructor } from '@/services/nostr-bridge/concord/hub-socket';

function harness() {
  const release = vi.fn();
  const hub = {
    connect: vi.fn(async () => {}), disconnect: vi.fn(),
    subscribe: vi.fn((spec: SubscribeSpec) => {
      spec.onEose?.('wss://relay.example');
      return { release };
    }),
    publish: vi.fn(async () => [{ status: 'ok' }]),
  };
  const Socket = concordSocketConstructor(hub as unknown as RelayHub, 'concord:test');
  return { socket: new Socket('wss://relay.example'), hub, release };
}

describe('Concord virtual WebSocket lifecycle', () => {
  it('delivers immediate hub EOSE asynchronously after the SDK attaches its observer', async () => {
    const { socket, hub, release } = harness();
    await new Promise<void>(resolve => { socket.onopen = () => resolve(); });
    socket.send(JSON.stringify(['REQ', 'read', { kinds: [1059] }]));
    const frame = await new Promise(resolve => { socket.onmessage = event => resolve(JSON.parse(event.data)); });
    expect(frame).toEqual(['EOSE', 'read']);
    expect(hub.subscribe).toHaveBeenCalledWith(expect.objectContaining({ identityId: 'concord:test' }));
    socket.close();
    socket.close();
    expect(release).toHaveBeenCalledTimes(1);
    expect(hub.disconnect).toHaveBeenCalledTimes(1);
  });

  it('offers paginated fallback and suppresses queued replies after close', async () => {
    const { socket } = harness();
    await new Promise<void>(resolve => { socket.onopen = () => resolve(); });
    socket.send(JSON.stringify(['NEG-OPEN', 'sync', {}, '00']));
    const frame = await new Promise(resolve => { socket.onmessage = event => resolve(JSON.parse(event.data)); });
    expect(frame).toEqual(['NEG-ERR', 'sync', 'unsupported: use paginated REQ']);
    const receive = vi.fn();
    socket.onmessage = receive;
    socket.send(JSON.stringify(['REQ', 'stale', { kinds: [1059] }]));
    socket.close();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(receive).not.toHaveBeenCalled();
  });
});
