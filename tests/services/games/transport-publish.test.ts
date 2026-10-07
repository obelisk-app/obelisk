import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const publishEvent = vi.hoisted(() => vi.fn());
const dropRelayConnection = vi.hoisted(() => vi.fn());
const ready = vi.hoisted(() => ({ impl: true }));

vi.mock('@/services/nostr-bridge/facade/client', () => ({
  getBridge: vi.fn(async () => ({})),
  getBridgeImpl: () => (ready.impl ? { publishEvent, dropRelayConnection, getPublicKey: () => null } : null),
}));

import { findCreateByNonce, publishCancel, publishMove } from '@/services/games/transport-publish';
import { bridge } from '@/services/games/transport-bridge';
import { GAME_SUB_WATCHDOG_MS } from '@/constants/games/transport-bridge';
import * as entry from '@/services/games/transport';

const signed = (template: { kind: number; content: string; tags: string[][] }) =>
  ({ id: 'x'.repeat(64), pubkey: 'p', created_at: 1, sig: 's', ...template });

beforeEach(() => {
  publishEvent.mockReset();
  dropRelayConnection.mockReset();
  ready.impl = true;
});
afterEach(() => vi.useRealTimers());

describe('transport-publish', () => {
  it('retries once on a fresh connection after a lost confirmation', async () => {
    vi.useFakeTimers();
    publishEvent
      .mockRejectedValueOnce(new Error('publish timed out'))
      .mockImplementationOnce(async (t) => signed(t));
    const done = publishCancel('ch', 'g'.repeat(64));
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(dropRelayConnection).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledTimes(2);
  });

  it('passes a refusal with a reason straight through, without retrying', async () => {
    publishEvent.mockRejectedValueOnce(new Error('blocked: not a member'));
    await expect(publishMove('ch', 'g'.repeat(64), 0, { cell: 1 })).rejects.toThrow('blocked');
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(dropRelayConnection).not.toHaveBeenCalled();
  });

  it('puts the seat on a move only when one is named', async () => {
    publishEvent.mockImplementation(async (t) => signed(t));
    await publishMove('ch', 'g'.repeat(64), 2, 'a1');
    await publishMove('ch', 'g'.repeat(64), 3, 'a2', 'pk#1');
    const [first, second] = publishEvent.mock.calls.map((c) => JSON.parse(c[0].content));
    expect(first).toEqual({ n: 2, action: 'a1' });
    expect(second).toEqual({ n: 3, action: 'a2', seat: 'pk#1' });
  });

  it('cannot recover a table while logged out', async () => {
    await expect(findCreateByNonce('ch', 'nonce')).resolves.toBeNull();
  });

  it('is what the transport entry point re-exports', () => {
    expect(entry.publishMove).toBe(publishMove);
    expect(entry.findCreateByNonce).toBe(findCreateByNonce);
  });
});

describe('transport-bridge', () => {
  it('refuses to hand out a bridge that never initialised', async () => {
    ready.impl = false;
    await expect(bridge()).rejects.toThrow('nostr bridge not initialized');
  });

  it('keeps the watchdog short enough to notice a dead sub', () => {
    expect(GAME_SUB_WATCHDOG_MS).toBeLessThanOrEqual(5000);
  });
});
