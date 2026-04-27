/**
 * Standalone DM fetch probe.
 *
 * Goal: take a single npub and tell us, definitively, whether DM events
 * (kind 4 and kind 1059) are reachable on a wide net of relays. This is
 * the same wire-level query Obelisk runs inside the browser, but stripped
 * of all React/store/UI plumbing so we can isolate "is the issue the
 * walker, the cache, or the network?".
 *
 * Run:
 *   npx tsx scripts/dm-fetch-probe.ts npub1...
 */

import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import * as nip19 from 'nostr-tools/nip19';
import type { Filter } from 'nostr-tools/filter';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nsec.app',
  'wss://purplepag.es',
  'wss://nostr.wine',
  'wss://relay.snort.social',
  'wss://nostr.mom',
  'wss://relay.nostr.bg',
  'wss://nostr.fmt.wiz.biz',
  'wss://relay.nostr.band',
  'wss://relay.ditto.pub',
];

const QUERY_TIMEOUT_MS = 12_000;

function npubToHex(input: string): string {
  if (/^[0-9a-f]{64}$/i.test(input)) return input.toLowerCase();
  const decoded = nip19.decode(input);
  if (decoded.type !== 'npub') throw new Error(`Expected npub, got ${decoded.type}`);
  return decoded.data;
}

interface RelayStats {
  url: string;
  nip04In: number;
  nip04Out: number;
  nip17Wraps: number;
  relayList: number;
  inboxList: number;
  eoseAt: number | null;
}

async function probe(pubkey: string): Promise<void> {
  const pool = new SimplePool();
  const stats = new Map<string, RelayStats>();
  for (const url of RELAYS) {
    stats.set(url, {
      url, nip04In: 0, nip04Out: 0, nip17Wraps: 0,
      relayList: 0, inboxList: 0, eoseAt: null,
    });
  }
  const partners = new Set<string>();
  let foundRelayList: { relays: string[]; created_at: number } | null = null;
  let foundInboxList: { relays: string[]; created_at: number } | null = null;
  const start = Date.now();

  // SimplePool.subscribeMany takes ONE filter (the "Many" refers to relays,
  // not filters). To run multiple filters per REQ we need multiple calls;
  // the pool internally groups same-relay filters into a single REQ.
  const filters: Filter[] = [
    { kinds: [4], '#p': [pubkey], limit: 500 },
    { kinds: [4], authors: [pubkey], limit: 500 },
    { kinds: [1059], '#p': [pubkey], limit: 500 },
    { kinds: [10002], authors: [pubkey], limit: 1 },
    { kinds: [10050], authors: [pubkey], limit: 1 },
  ];

  // Per-relay subs so we can attribute events back to a specific relay.
  // SimplePool's main subscribeMany dedups across relays which would
  // hide that fact from us.
  const subs: Array<{ close: () => void }> = [];
  for (const url of RELAYS) {
    for (const filter of filters) {
      const sub = pool.subscribeMany(
        [url],
        filter,
        {
          onevent: (event) => {
            const s = stats.get(url);
            if (!s) return;
            if (event.kind === 4) {
              if (event.pubkey === pubkey) {
                s.nip04Out++;
                const partner = event.tags.find((t) => t[0] === 'p')?.[1];
                if (partner) partners.add(partner);
              } else if (event.tags.some((t) => t[0] === 'p' && t[1] === pubkey)) {
                s.nip04In++;
                partners.add(event.pubkey);
              }
            } else if (event.kind === 1059) {
              if (event.tags.some((t) => t[0] === 'p' && t[1] === pubkey)) s.nip17Wraps++;
            } else if (event.kind === 10002 && event.pubkey === pubkey) {
              s.relayList++;
              const relays = (event.tags as string[][])
                .filter((t) => t[0] === 'r' && typeof t[1] === 'string' && t[1].startsWith('wss://'))
                .map((t) => t[1]);
              if (!foundRelayList || event.created_at > foundRelayList.created_at) {
                foundRelayList = { relays, created_at: event.created_at };
              }
            } else if (event.kind === 10050 && event.pubkey === pubkey) {
              s.inboxList++;
              const relays = (event.tags as string[][])
                .filter((t) => (t[0] === 'relay' || t[0] === 'r') && typeof t[1] === 'string' && t[1].startsWith('wss://'))
                .map((t) => t[1]);
              if (!foundInboxList || event.created_at > foundInboxList.created_at) {
                foundInboxList = { relays, created_at: event.created_at };
              }
            }
          },
          oneose: ((relay: string) => {
            const s = stats.get(relay);
            if (s && s.eoseAt === null) s.eoseAt = Date.now() - start;
          }) as () => void,
        },
      );
      subs.push(sub);
    }
  }

  await new Promise((r) => setTimeout(r, QUERY_TIMEOUT_MS));
  for (const s of subs) { try { s.close(); } catch { /* ignore */ } }
  pool.close(RELAYS);

  console.log(`\n=== probe complete for ${pubkey.slice(0, 16)}... ===`);
  console.log(`elapsed: ${Date.now() - start}ms\n`);
  console.log('per-relay results:');
  console.log('-'.repeat(110));
  console.log(
    'relay'.padEnd(40),
    'nip04In'.padStart(8),
    'nip04Out'.padStart(9),
    'nip17'.padStart(7),
    'k10002'.padStart(7),
    'k10050'.padStart(7),
    'eose@'.padStart(8),
  );
  console.log('-'.repeat(110));
  for (const url of RELAYS) {
    const s = stats.get(url)!;
    console.log(
      url.padEnd(40),
      String(s.nip04In).padStart(8),
      String(s.nip04Out).padStart(9),
      String(s.nip17Wraps).padStart(7),
      String(s.relayList).padStart(7),
      String(s.inboxList).padStart(7),
      (s.eoseAt === null ? '—' : `${s.eoseAt}ms`).padStart(8),
    );
  }
  console.log('-'.repeat(110));
  console.log(`\nunique NIP-04 partners (across all relays): ${partners.size}`);
  if (partners.size > 0) {
    console.log('first 10:');
    for (const p of Array.from(partners).slice(0, 10)) console.log(`  ${p}`);
  }
  console.log(`\nadvertised NIP-65 relays (kind 10002): ${foundRelayList ? (foundRelayList as { relays: string[] }).relays.length : 0}`);
  if (foundRelayList) {
    for (const r of (foundRelayList as { relays: string[] }).relays) console.log(`  ${r}`);
  }
  console.log(`\nadvertised NIP-17 inbox relays (kind 10050): ${foundInboxList ? (foundInboxList as { relays: string[] }).relays.length : 0}`);
  if (foundInboxList) {
    for (const r of (foundInboxList as { relays: string[] }).relays) console.log(`  ${r}`);
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npx tsx scripts/dm-fetch-probe.ts <npub-or-hex>');
  process.exit(1);
}
const pubkey = npubToHex(arg);
console.log(`pubkey hex: ${pubkey}`);
probe(pubkey).then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
