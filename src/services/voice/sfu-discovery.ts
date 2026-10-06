/**
 * SFU discovery: one long-lived subscription for kind 31313 advertisements,
 * newest per SFU pubkey cached in memory. `pickSfu` (`sfu-control.ts`) reads
 * it when neither a per-channel pin nor a build-time pin decides.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';

import { getBridge, getBridgeImpl, isImportableRelayUrl } from '@/services/nostr-bridge';
import { KIND_SFU_ADVERTISE } from '@/utils/nip-kinds';

export interface SfuAdvertisement {
  pubkey: string;
  url: string | null;
  region: string | null;
  cap: number | null;
  /** Relays the SFU treats as trusted-author (events seen on them bypass
   *  the SFU's local allow-list). Clients should publish `start` here. */
  trustedRelays: readonly string[];
  /** Relays the SFU subscribes to in general (signaling, advertise, etc.). */
  generalRelays: readonly string[];
  createdAt: number;
}

const advertisements = new Map<string, SfuAdvertisement>();
let advertisementSubInflight: Promise<void> | null = null;
let advertisementUnsub: (() => void) | null = null;

function tagValues(ev: NostrEvent, name: string): string[] {
  return ev.tags.filter((t) => t[0] === name).map((t) => t[1]).filter(Boolean);
}

function firstTag(ev: NostrEvent, name: string): string | null {
  return tagValues(ev, name)[0] ?? null;
}

/**
 * Parse a kind 31313 event into an SfuAdvertisement. Exported for tests.
 */
export function parseAdvertisement(ev: NostrEvent): SfuAdvertisement {
  const capStr = firstTag(ev, 'cap');
  const capNum = capStr ? Number(capStr) : NaN;
  // Drop any `relay` / `trusted_relay` entries pointing at localhost,
  // loopback, RFC-1918, or non-wss schemes. SfuRpc subscribes to whatever
  // we hand it, and a never-resolving WebSocket to a private host stalls
  // every voice-sfu join until the rpc timeout fires. A dev box that
  // happens to publish kind 31313 with its lan IP - or an old pinned SFU
  // entry from a local test rig - shouldn't take down production browsers.
  return {
    pubkey: ev.pubkey,
    url: firstTag(ev, 'url'),
    region: firstTag(ev, 'region'),
    cap: Number.isFinite(capNum) ? capNum : null,
    trustedRelays: tagValues(ev, 'trusted_relay').filter(isImportableRelayUrl),
    generalRelays: tagValues(ev, 'relay').filter(isImportableRelayUrl),
    createdAt: ev.created_at,
  };
}

export function ingestAdvertisement(ev: NostrEvent): void {
  if (ev.kind !== KIND_SFU_ADVERTISE) return;
  const existing = advertisements.get(ev.pubkey);
  if (existing && existing.createdAt >= ev.created_at) return;
  advertisements.set(ev.pubkey, parseAdvertisement(ev));
}

/**
 * Open (once) a long-lived subscription for kind 31313 advertisements on
 * the configured relays. Subsequent calls are no-ops.
 */
export async function ensureAdvertisementSub(): Promise<void> {
  if (advertisementSubInflight) return advertisementSubInflight;
  advertisementSubInflight = (async () => {
    await getBridge();
    const impl = getBridgeImpl();
    if (!impl) return;
    // 24h `since` window - the SFU re-publishes its 31313 every 5 minutes
    // (see services/sfu/src/advertise.ts), so any live SFU's advertisement
    // is well within that window. Wider would just inflate replay traffic.
    const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const filter: Filter = { kinds: [KIND_SFU_ADVERTISE], since };
    advertisementUnsub = impl.subscribeFilter(filter, ingestAdvertisement);
  })();
  await advertisementSubInflight;
}

export function advertisementCount(): number {
  return advertisements.size;
}

/** The most recently advertised SFU, or null when none has been seen. */
export function newestAdvertisement(): SfuAdvertisement | null {
  let best: SfuAdvertisement | null = null;
  for (const ad of advertisements.values()) {
    if (!best || ad.createdAt > best.createdAt) best = ad;
  }
  return best;
}

export function snapshotAdvertisements(): readonly SfuAdvertisement[] {
  return [...advertisements.values()];
}

/** Test seam: forget every advertisement and close the subscription. */
export function resetDiscovery(): void {
  advertisements.clear();
  advertisementSubInflight = null;
  advertisementUnsub?.();
  advertisementUnsub = null;
}
