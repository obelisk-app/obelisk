/**
 * What every bridge integration suite shares (round 16 split of
 * `bridge.test.ts`): the per-test lifecycle on the pool-level fake
 * (`bridge-fake-pool.ts`), the relay-URL and keypair helpers, the kind 0
 * batch settle, and the builders for relay events. A suite calls
 * `installBridgeHarness(fake)` once at module level, after its `vi.mock`.
 */
import { afterEach, beforeEach, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import type { FakeBridgePool } from '@tests/services/nostr-bridge/support/bridge-fake-pool';

let installed: FakeBridgePool | null = null;

function pool(): FakeBridgePool {
  if (!installed) throw new Error('installBridgeHarness(fake) has not run in this suite');
  return installed;
}

/** Register the warm-up and the per-test reset for a suite running on `fake`. */
export function installBridgeHarness(fake: FakeBridgePool): void {
  installed = fake;
  warmBridgeModules();

  beforeEach(() => {
    // Pools remember which test built them; see `FakePool.stale`.
    pool().state.testNo += 1;
    (() => { pool().state.published = []; pool().state.subscriptions = []; pool().state.subscriptionLog = []; pool().state.ensureRelayCalls = []; pool().state.ensureRelayImpl = null; pool().state.publishImpl = null; pool().state.querySyncCalls = []; pool().state.suppressNextEose = false; pool().state.suppressAllEose = false; pool().state.poolSeq = 0; pool().state.poolOptions = []; pool().state.closeCalls = []; pool().state.closeOpenSubscriptionCounts = []; })();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    }));
    // Each test starts fresh. The bridge lives in a globalThis slot that
    // survives a module reset, so it is forgotten explicitly; the modules are
    // still reset because the page RelayHub (`lib/relay-hub`) and the
    // module-level stores and caches the bridge writes to are singletons of
    // their own.
    unregisterBridge();
    vi.resetModules();
    setOnline(true);
    setVisibility('visible');
    // Clear localStorage between tests so persisted sessions don't bleed.
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  afterEach(async () => {
    const { getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    getBridgeImpl()?.dispose();
    unregisterBridge();
    (() => { pool().state.published = []; pool().state.subscriptions = []; pool().state.subscriptionLog = []; pool().state.ensureRelayCalls = []; pool().state.ensureRelayImpl = null; pool().state.querySyncCalls = []; pool().state.suppressNextEose = false; pool().state.suppressAllEose = false; pool().state.poolSeq = 0; pool().state.poolOptions = []; pool().state.closeCalls = []; pool().state.closeOpenSubscriptionCounts = []; })();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}

export function matches(f: Filter, ev: NostrEvent): boolean {
  return pool().matchesInternal(f as Record<string, unknown>, ev);
}


/**
 * The spelling a relay URL has on the wire since the hub owns the REQs: it
 * normalizes once at its boundary (nostr-tools' `normalizeURL`, which keeps
 * the trailing slash on a bare host), as a real `SimplePool` would too.
 */
export const onWire = (url: string) => normalizeURL(url);
export const isActiveRelayUrl = (url: string) => onWire(url) === onWire('wss://public.obelisk.ar');

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function makeKeypair() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return { skHex: bytesToHex(sk), pkHex: pk };
}

export async function flush(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/**
 * Fire the kind:0 batch window so queued profile lookups reach the wire.
 * Callers run under fake timers, so this walks the clock past the bridge's
 * 16 ms KIND0_BATCH_DELAY_MS rather than sleeping 40 real ms and hoping the
 * scheduler gets to the timer in time (under CPU contention it did not).
 */
export async function settleKind0Batch(): Promise<void> {
  if (!vi.isFakeTimers()) throw new Error('settleKind0Batch needs vi.useFakeTimers() in the calling test');
  await vi.advanceTimersByTimeAsync(20);
  await flush();
}

export function kind0SubsIn(subs: ReadonlyArray<{ filter: Record<string, unknown>; relays?: string[] }>) {
  return subs.filter((s) => (s.filter.kinds as number[] | undefined)?.includes(0));
}

/** True when some kind:0 REQ in `subs` carried `pubkey` in its authors. */
export function kind0Requested(
  subs: ReadonlyArray<{ filter: Record<string, unknown>; relays?: string[] }>,
  pubkey: string,
): boolean {
  return kind0SubsIn(subs).some((s) => (s.filter.authors as string[] | undefined)?.includes(pubkey));
}

export function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

export function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

export function hexToBytesForTest(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function fakeRelayMetadata(opts: {
  groupId: string;
  name?: string;
  about?: string;
  parent?: string;
  isPublic?: boolean;
  isHidden?: boolean;
  isRestricted?: boolean;
  isOpen?: boolean;
}): Promise<NostrEvent> {
  // Sign with a throwaway key: the bridge doesn't verify authorship of
  // kind 39000, only parses tags.
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId]];
  if (opts.name) tags.push(['name', opts.name]);
  if (opts.about) tags.push(['about', opts.about]);
  if (opts.parent) tags.push(['parent', opts.parent]);
  if (opts.isPublic !== undefined) tags.push([opts.isPublic ? 'public' : 'private']);
  if (opts.isHidden) tags.push(['hidden']);
  if (opts.isRestricted) tags.push(['restricted']);
  if (opts.isOpen !== undefined) tags.push([opts.isOpen ? 'open' : 'closed']);
  return finalizeEvent(
    {
      kind: 39000,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

export async function fakeRelayMetadataWithT(opts: {
  groupId: string;
  name?: string;
  t: string;
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId], ['t', opts.t]];
  if (opts.name) tags.push(['name', opts.name]);
  return finalizeEvent(
    {
      kind: 39000,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

export async function fakeRelayMetadataWithExtraTags(opts: {
  groupId: string;
  name?: string;
  parent?: string;
  extraTags: string[][];
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId]];
  if (opts.name) tags.push(['name', opts.name]);
  if (opts.parent) tags.push(['parent', opts.parent]);
  for (const t of opts.extraTags) tags.push(t);
  return finalizeEvent(
    {
      kind: 39000,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

export async function fakeRelayMessage(opts: {
  groupId: string;
  content: string;
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return finalizeEvent(
    {
      kind: 9,
      content: opts.content,
      tags: [['h', opts.groupId]],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

/** kind 9 with arbitrary extra tags: used for mention / reply notification tests. */
export async function fakeRelayMessageWithTags(opts: {
  groupId: string;
  content: string;
  tags?: string[][];
  createdAt?: number;
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return finalizeEvent(
    {
      kind: 9,
      content: opts.content,
      tags: [['h', opts.groupId], ...(opts.tags ?? [])],
      created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

export async function fakeRelayList(opts: {
  groupId: string;
  kind: 39001 | 39002;
  pubkeys: string[];
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId], ...opts.pubkeys.map((pk) => ['p', pk])];
  return finalizeEvent(
    {
      kind: opts.kind,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

export function deliver(ev: NostrEvent) {
  for (const sub of pool().state.subscriptions) if (matches(sub.filter as Filter, ev)) sub.sink(ev);
}
