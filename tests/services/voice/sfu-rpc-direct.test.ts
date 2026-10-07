import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeFake = vi.hoisted(() => ({
  signEventTemplate: vi.fn(async (template: { kind: number; content: string; tags: string[][] }) => ({
    ...template, created_at: 1, pubkey: 'b'.repeat(64), id: 'id', sig: 'sig',
  })),
}));
vi.mock('@/services/nostr-bridge/facade/client', () => ({
  getBridge: vi.fn(async () => bridgeFake),
  getBridgeImpl: vi.fn(() => bridgeFake),
}));

import { connectDirectRpc, type DirectRpcHooks } from '@/services/voice/sfu-rpc-direct';
import { DirectRpcError } from '@/services/voice/sfu-rpc-support';

const CHANNEL = 'c'.repeat(64);

/** A socket the test scripts by hand: nothing happens until it says so. */
class ScriptedSocket {
  static last: ScriptedSocket | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: Record<string, unknown>[] = [];
  closed = false;
  constructor(readonly url: URL) { ScriptedSocket.last = this; }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.closed = true; }
  say(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

function hooks(): DirectRpcHooks & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    sfuUrl: 'https://sfu.example',
    channelId: CHANNEL,
    clientId: 'client-1',
    attach: (s) => log.push(s ? 'attach' : 'detach'),
    onAuthenticated: () => log.push('authenticated'),
    onInbound: (m) => log.push(`inbound:${String(m.type)}`),
    onLost: (e) => log.push(`lost:${e.closeCode}`),
  };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', ScriptedSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connectDirectRpc', () => {
  it('answers the challenge with a signed kind 22242 and resolves on auth_ok', async () => {
    const h = hooks();
    const done = connectDirectRpc(h);
    const socket = ScriptedSocket.last!;
    expect(socket.url.toString()).toBe(`wss://sfu.example/rpc?channelId=${CHANNEL}`);
    socket.say({ type: 'auth', kind: 22242, channelId: CHANNEL, challenge: 'ch', relay: 'wss://sfu.example' });
    await flush();
    expect(socket.sent[0]).toMatchObject({ type: 'auth', clientId: 'client-1', event: { kind: 22242 } });
    socket.say({ type: 'auth_ok' });
    await done;
    socket.say({ type: 'response', requestId: 'r', ok: true });
    await flush();
    expect(h.log).toEqual(['attach', 'authenticated', 'inbound:response']);
  });

  it('refuses a challenge for another channel, and lets go of the socket', async () => {
    const h = hooks();
    const done = connectDirectRpc(h);
    ScriptedSocket.last!.say({ type: 'auth', kind: 22242, channelId: 'other', challenge: 'ch', relay: 'r' });
    await expect(done).rejects.toThrow('Invalid SFU authentication challenge');
    expect(h.log).toEqual(['attach', 'detach']);
    expect(ScriptedSocket.last!.closed).toBe(true);
  });

  it('a denied socket rejects with its close code, so the caller does not fall back', async () => {
    const done = connectDirectRpc(hooks());
    ScriptedSocket.last!.onclose?.({ code: 4403, reason: 'not whitelisted' });
    const err = await done.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DirectRpcError);
    expect((err as DirectRpcError).closeCode).toBe(4403);
    expect((err as Error).message).toBe('SFU access denied: not whitelisted');
  });

  it('a socket that closes after authentication fails the pending calls', async () => {
    const h = hooks();
    const done = connectDirectRpc(h);
    ScriptedSocket.last!.say({ type: 'auth_ok' });
    await done;
    ScriptedSocket.last!.onclose?.({ code: 1006, reason: '' });
    expect(h.log.at(-1)).toBe('lost:1006');
  });

  it('nothing but auth is accepted before authentication', async () => {
    const done = connectDirectRpc(hooks());
    ScriptedSocket.last!.say({ type: 'notification', method: 'x' });
    await expect(done).rejects.toThrow('SFU WebSocket authentication required');
  });
});
