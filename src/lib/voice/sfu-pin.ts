/**
 * Per-channel SFU pin (NIP-78 kind 30078).
 *
 * Lets channel admins bind a `voice-sfu` channel to a specific SFU operator
 * — pubkey, URL, and trusted-author relays — without baking those values
 * into the dex's build. Anyone can run their own SFU; the channel just
 * names which one to use.
 *
 *   d-tag:    `obelisk-sfu:<channelId>`
 *   content:  JSON `{ pubkey, url, trustedRelays }` (all hex / wss strings)
 *   author:   the channel admin who set the pin (latest-wins per author,
 *             across-author resolution is admin-set membership)
 *
 * Resolution order in `pickSfu`:
 *   1. channel pin (kind 30078 d=obelisk-sfu:<channelId>) — this module
 *   2. kind 31313 advertisement                           — sfu-control.ts
 *   3. NEXT_PUBLIC_SFU_* env vars                         — sfu-control.ts
 *
 * The env vars are now only a *suggested default* in the channel-settings
 * UI, not a global pin.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';

import { getBridge, getBridgeImpl, isImportableRelayUrl } from '@/lib/nostr-bridge/client';
import { KIND_NIP78_APP_DATA as KIND_NIP78 } from '@/lib/nip-kinds';

export interface SfuPin {
  pubkey: string;
  url: string;
  trustedRelays: readonly string[];
  /** Author who published the pin (NIP-29 admin pubkey). */
  setBy: string;
  /** `created_at` of the underlying event — used for newest-wins. */
  createdAt: number;
}

const cache = new Map<string, SfuPin>();
const subscribed = new Set<string>();

export function dTagFor(channelId: string): string {
  return `obelisk-sfu:${channelId}`;
}

function ingest(channelId: string, ev: NostrEvent): void {
  try {
    const parsed = JSON.parse(ev.content) as Partial<SfuPin>;
    if (typeof parsed.pubkey !== 'string' || !/^[0-9a-f]{64}$/i.test(parsed.pubkey)) return;
    if (typeof parsed.url !== 'string' || !parsed.url.startsWith('http')) return;
    // Strict filter — pins authored on a dev box can carry
    // wss://localhost:* / RFC-1918 entries that hang every browser
    // visiting the channel: SfuRpc subscribes to the listed relays for
    // its kind 25050 responses, and a never-resolving WebSocket to a
    // private host stalls `getRouterRtpCapabilities` until the rpc
    // timeout fires (the symptom we tracked back from
    // "[voice] SfuClient.start failed Error: rpc timeout: getRouterRtpCapabilities"
    // with `wss://localhost:4869` in the browser console). Dropping
    // them at ingestion is cheaper than filtering everywhere downstream.
    const trustedRelays = Array.isArray(parsed.trustedRelays)
      ? parsed.trustedRelays.filter(
          (r): r is string =>
            typeof r === 'string' && isImportableRelayUrl(r),
        )
      : [];
    const pin: SfuPin = {
      pubkey: parsed.pubkey.toLowerCase(),
      url: parsed.url,
      trustedRelays,
      setBy: ev.pubkey,
      createdAt: ev.created_at,
    };
    const existing = cache.get(channelId);
    // Newest-wins. Two admins both setting a pin race on `created_at`; the
    // later edit beats the earlier one. Same idiom we use everywhere else.
    if (existing && existing.createdAt >= ev.created_at) return;
    cache.set(channelId, pin);
  } catch {
    // bad JSON — ignore, the next valid one wins
  }
}

/**
 * Open (idempotent) a long-lived subscription for the given channel's SFU
 * pin. Safe to call repeatedly; only the first call per channel actually
 * subscribes.
 */
export async function ensureSfuPinSub(channelId: string): Promise<void> {
  if (subscribed.has(channelId)) return;
  subscribed.add(channelId);
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) return;
  const filter: Filter = { kinds: [KIND_NIP78], '#d': [dTagFor(channelId)] };
  impl.subscribeFilter(filter, (ev) => ingest(channelId, ev));
}

export function getSfuPin(channelId: string): SfuPin | null {
  return cache.get(channelId) ?? null;
}

/**
 * Wait for `pickSfu` callers: open the sub if needed, give the relay a
 * brief window to deliver the latest event, and return the cached pin.
 * `null` means no pin has been set for this channel.
 */
export async function resolveSfuPin(channelId: string, coldWaitMs = 1500): Promise<SfuPin | null> {
  await ensureSfuPinSub(channelId);
  const cached = cache.get(channelId);
  if (cached) return cached;
  // Cold-cache wait. Replaceable kinds are returned immediately by compliant
  // relays, so a short delay is enough — and keeping it short means a
  // missing pin doesn't block the join.
  await new Promise((r) => setTimeout(r, coldWaitMs));
  return cache.get(channelId) ?? null;
}

/**
 * Publish a kind 30078 SFU pin for the channel. Any channel admin can
 * publish; the dex enforces this client-side by hiding the editor when
 * the user isn't an admin. The relay enforces NIP-29 admin membership.
 */
export async function publishSfuPin(
  channelId: string,
  pin: { pubkey: string; url: string; trustedRelays: readonly string[] },
): Promise<void> {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('bridge not ready');
  const content = JSON.stringify({
    pubkey: pin.pubkey.toLowerCase(),
    url: pin.url,
    trustedRelays: [...pin.trustedRelays],
  });
  await impl.publishEvent({
    kind: KIND_NIP78,
    content,
    tags: [
      ['d', dTagFor(channelId)],
      ['e', channelId],
      ['t', 'obelisk-sfu-pin'],
    ],
  });
}

/** Test-only reset. */
export const __testing = {
  reset(): void {
    cache.clear();
    subscribed.clear();
  },
  ingest,
};
