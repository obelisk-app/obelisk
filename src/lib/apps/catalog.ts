/**
 * The app catalog: every kind 32390 manifest on the ACTIVE relay.
 *
 * Single-relay rule (CLAUDE.md): apps are group-shaped — they run in a
 * channel on this relay — so discovery never fans out. Whoever can write to
 * this relay can publish an app to it; the relay's admission rules are the
 * catalog's curation, and its operator's bans are its moderation.
 *
 * A NIP-09 kind 5 from the author naming the app's address hides it.
 * Newest manifest per address wins (manifest.ts `latestPerAddress`).
 * Cached per relay in bridgeCache so the /app picker paints before the relay
 * answers.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { cacheGet, cacheSet } from '@/lib/nostr-bridge/cache';
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';
import { KIND_APP_MANIFEST } from '@/lib/nip-kinds';
import { registerClientResetHook } from '@/lib/reset';

import { latestPerAddress, parseManifest, type AppManifest } from './manifest';

export const CATALOG_LIMIT = 500;
const WATCHDOG_MS = 4000;
const CACHE_ID = 'catalog';
const KIND_DELETION = 5;

type Listener = (apps: AppManifest[]) => void;

interface CatalogState {
  relay: string;
  manifests: Map<string, AppManifest>;
  /** The signed events behind `manifests`, by id — what gets cached. */
  raw: Map<string, NostrEvent>;
  deleted: Set<string>;
  apps: AppManifest[];
  listeners: Set<Listener>;
  unsubs: (() => void)[];
}

let state: CatalogState | null = null;

/** Apply NIP-09 deletions: an `a` tag naming the address, signed by its author. */
export function applyDeletions(manifests: readonly AppManifest[], deletions: readonly NostrEvent[]): Set<string> {
  const byAddress = new Map(manifests.map((m) => [m.address, m]));
  const gone = new Set<string>();
  for (const d of deletions) {
    if (d.kind !== KIND_DELETION) continue;
    for (const t of d.tags) {
      if (t[0] !== 'a' || typeof t[1] !== 'string') continue;
      const m = byAddress.get(t[1]);
      // Only the author can retire an app, and only versions published before the deletion.
      if (m && m.author === d.pubkey && m.createdAt <= d.created_at) gone.add(t[1]);
    }
  }
  return gone;
}

function recompute(s: CatalogState): void {
  s.apps = latestPerAddress([...s.manifests.values()]).filter((m) => !s.deleted.has(m.address));
  for (const fn of s.listeners) fn(s.apps);
}

function persist(s: CatalogState): void {
  // The raw events, not the parsed manifests: whatever comes back out of the
  // cache goes through parseManifest again, the same gate relay events do.
  const live = new Set(s.apps.map((m) => m.eventId));
  cacheSet(s.relay, KIND_APP_MANIFEST, CACHE_ID, [...s.raw.values()].filter((ev) => live.has(ev.id)));
}

function seed(s: CatalogState): void {
  const entry = cacheGet<unknown>(s.relay, KIND_APP_MANIFEST, CACHE_ID);
  if (!entry || !Array.isArray(entry.value)) return;
  for (const ev of entry.value as NostrEvent[]) {
    const m = ev && typeof ev === 'object' ? parseManifest(ev) : null;
    if (!m) continue;
    s.manifests.set(m.eventId, m);
    s.raw.set(m.eventId, ev);
  }
  s.apps = latestPerAddress([...s.manifests.values()]);
}

async function open(relay: string): Promise<CatalogState> {
  const s: CatalogState = { relay, manifests: new Map(), raw: new Map(), deleted: new Set(), apps: [], listeners: new Set(), unsubs: [] };
  seed(s);
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) return s;

  const deletions: NostrEvent[] = [];
  const authorsAsked = new Set<string>();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePersist = () => {
    if (persistTimer) return;
    persistTimer = setTimeout(() => { persistTimer = null; persist(s); }, 500);
  };

  const watchDeletions = (authors: string[]) => {
    const fresh = authors.filter((a) => !authorsAsked.has(a));
    if (fresh.length === 0) return;
    for (const a of fresh) authorsAsked.add(a);
    s.unsubs.push(impl.subscribeFilterWatched(
      { kinds: [KIND_DELETION], authors: fresh, '#k': [String(KIND_APP_MANIFEST)] },
      (ev) => {
        deletions.push(ev as NostrEvent);
        s.deleted = applyDeletions([...s.manifests.values()], deletions);
        recompute(s);
        schedulePersist();
      },
      { watchdogMs: WATCHDOG_MS },
    ));
  };

  s.unsubs.push(impl.subscribeFilterWatched(
    { kinds: [KIND_APP_MANIFEST], limit: CATALOG_LIMIT },
    (ev) => {
      const m = parseManifest(ev as NostrEvent);
      if (!m) return;
      // Drop the cached copy of an older version of the same address.
      for (const [id, old] of s.manifests) {
        if (old.address === m.address && old.eventId !== m.eventId && old.createdAt <= m.createdAt) {
          s.manifests.delete(id);
          s.raw.delete(id);
        }
      }
      s.manifests.set(m.eventId, m);
      s.raw.set(m.eventId, ev as NostrEvent);
      s.deleted = applyDeletions([...s.manifests.values()], deletions);
      watchDeletions([m.author]);
      recompute(s);
      schedulePersist();
    },
    { watchdogMs: WATCHDOG_MS },
  ));
  return s;
}

/**
 * Follow the active relay's catalog. The listener fires immediately with the
 * cached list (possibly empty) and on every change. Switching relays swaps
 * the catalog: apps are per relay.
 */
export async function subscribeCatalog(fn: Listener): Promise<() => void> {
  await getBridge();
  const impl = getBridgeImpl();
  const relay = impl?.currentRelayUrl.get() ?? '';
  if (!relay) {
    fn([]);
    return () => {};
  }
  if (!state || state.relay !== relay) {
    state?.unsubs.forEach((u) => u());
    state = await open(relay);
  }
  const s = state;
  s.listeners.add(fn);
  fn(s.apps);
  return () => { s.listeners.delete(fn); };
}

/** One app by address from the current catalog, if the relay carries it. */
export function catalogApp(address: string): AppManifest | null {
  return state?.apps.find((m) => m.address === address) ?? null;
}

/** Test seam and account-switch teardown. */
export function resetCatalog(): void {
  state?.unsubs.forEach((u) => u());
  state = null;
}

// The catalog is the active relay's, seen as this account.
registerClientResetHook(resetCatalog);
