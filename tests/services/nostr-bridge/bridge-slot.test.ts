/**
 * The page bridge's slot: `registerBridge` / `unregisterBridge`, and the
 * reason the slot lives on `globalThis` (a re-evaluated `client.ts`, which is
 * what Fast Refresh does on an edit, must find the instance the page has).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BridgeImpl } from '@/services/nostr-bridge/client';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/bridge-slot';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';

warmBridgeModules();

const fake = (name: string) => ({ name }) as unknown as BridgeImpl;

afterEach(() => {
  unregisterBridge();
});

describe('registerBridge', () => {
  it('makes the instance the page bridge, for getBridgeImpl and getBridge alike', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const a = fake('a');
    registerBridge(a);
    expect(getBridgeImpl()).toBe(a);
    await expect(getBridge()).resolves.toBe(a);
  });

  it('is idempotent for the registered instance and replaces a different one', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const a = fake('a');
    registerBridge(a);
    const first = getBridge();
    registerBridge(a);
    expect(getBridge()).toBe(first);
    const b = fake('b');
    registerBridge(b);
    expect(getBridgeImpl()).toBe(b);
    await expect(getBridge()).resolves.toBe(b);
  });
});

describe('unregisterBridge', () => {
  it('empties the slot, or leaves it alone when asked about another instance', async () => {
    const { getBridgeImpl } = await import('@/services/nostr-bridge/client');
    const a = fake('a');
    registerBridge(a);
    unregisterBridge(fake('someone else'));
    expect(getBridgeImpl()).toBe(a);
    unregisterBridge(a);
    expect(getBridgeImpl()).toBeNull();
    registerBridge(a);
    unregisterBridge();
    expect(getBridgeImpl()).toBeNull();
  });
});

describe('the slot', () => {
  it('outlives a re-evaluated client module, so a Fast Refresh finds the page bridge instead of building a second', async () => {
    const before = await import('@/services/nostr-bridge/client');
    const a = fake('a');
    registerBridge(a);
    vi.resetModules();
    const after = await import('@/services/nostr-bridge/client');
    expect(after).not.toBe(before);
    expect(after.getBridgeImpl()).toBe(a);
    await expect(after.getBridge()).resolves.toBe(a);
  });
});
