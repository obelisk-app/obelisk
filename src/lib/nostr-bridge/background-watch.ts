/**
 * Background relay watch — hear mentions and replies on relays you are not
 * browsing right now.
 *
 * Groups bind to the active relay (CLAUDE.md, "Single-relay rule for
 * groups"): switching relays tears down every kind 9 subscription. Without
 * this module, an `@you` on the relay you left five minutes ago is silent
 * until you go back.
 *
 * What it does, and deliberately nothing more:
 *
 *   • Tracks the relays the user *interacts with* (opens, posts on) in a
 *     per-account MRU list — `obelisk-dex/recent-relays/{pubkey}`.
 *   • On each of the {@link BACKGROUND_RELAY_LIMIT} most recent relays
 *     that are not the active one, keeps two kind 9 REQs open: `#p:[me]`
 *     from the relay's mention cursor (catch-up), and every kind 9 from
 *     "now" with no backfill (live, catches mentions nobody `p`-tagged).
 *     No metadata, no member lists, no history.
 *   • Uses its own `SimplePool`, so `switchRelay` / `resetPoolForSessionChange`
 *     on the main pool never drops it, and its sockets are never mistaken
 *     for the active relay's.
 *
 * Privacy: the watcher answers NIP-42 AUTH only for relays in its current
 * target set, i.e. relays the user themselves opened recently and therefore
 * already authenticated to. It never widens who learns the user's pubkey.
 * The relay does learn "this user is still online" — that's the cost of
 * the feature, and why it can be turned off (`preferences.backgroundRelayWatch`).
 */
import type { Event as NostrEvent, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import { createLocalStore } from '@/lib/local-store';
import { normalizeRelayUrl } from './relay-url';

/** How many non-active relays stay watched. */
export const BACKGROUND_RELAY_LIMIT = 3;
/** MRU length — the active relay plus the watched ones. */
export const RECENT_RELAY_CAP = BACKGROUND_RELAY_LIMIT + 1;
/** How far back a (re)opened watch looks, at most. */
export const BACKGROUND_LOOKBACK_S = 7 * 24 * 3600;
/** Backoff before retrying a relay whose watch subscription closed. */
export const BACKGROUND_RETRY_MS = 30_000;

const KIND_GROUP_MESSAGE = 9;

// -- MRU -----------------------------------------------------------------

function recentStore(pubkey: string) {
  return createLocalStore<string[]>(`obelisk-dex/recent-relays/${pubkey}`, []);
}

export function loadRecentRelays(pubkey: string | null | undefined): string[] {
  if (!pubkey) return [];
  const raw = recentStore(pubkey).load();
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
}

/** Move `relay` to the front of `pubkey`'s MRU. Returns the new list. */
export function touchRecentRelay(pubkey: string | null | undefined, relay: string): string[] {
  const url = normalizeRelayUrl(relay);
  if (!pubkey || !url) return loadRecentRelays(pubkey);
  const prev = loadRecentRelays(pubkey);
  if (prev[0] === url) return prev;
  const next = [url, ...prev.filter((r) => r !== url)].slice(0, RECENT_RELAY_CAP);
  recentStore(pubkey).save(next);
  return next;
}

/**
 * The relays to watch: most-recent first, never the active relay, only
 * relays still in the rail (a removed relay stops being watched).
 */
export function backgroundTargets(
  recent: ReadonlyArray<string>,
  active: string | null,
  configured: ReadonlyArray<string>,
  limit = BACKGROUND_RELAY_LIMIT,
): string[] {
  const activeKey = active ? normalizeRelayUrl(active) : null;
  const allowed = new Set(configured.map(normalizeRelayUrl));
  const out: string[] = [];
  for (const r of recent) {
    const key = normalizeRelayUrl(r);
    if (!key || key === activeKey || !allowed.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

// -- watcher -------------------------------------------------------------

export interface WatchPool {
  subscribe(
    relays: string[],
    filter: Filter,
    params: {
      onevent?: (ev: NostrEvent) => void;
      onclose?: (reasons: string[]) => void;
      onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
      label?: string;
    },
  ): { close: (reason?: string) => void };
  close(relays: string[]): void;
  destroy?(): void;
}

export interface WatcherDeps {
  /**
   * Build the watcher's own pool. `isWatched(url)` is what the pool's
   * `automaticallyAuth` must consult before answering a challenge.
   */
  createPool(isWatched: (url: string) => boolean): WatchPool;
  /**
   * A kind 9 arrived on `relay` — either one that `p`-tags `me`, or any live
   * message (the caller decides whether it pings).
   */
  onEvent(relay: string, ev: NostrEvent): void;
  /**
   * NIP-42 signer, passed as the REQ's `onauth`. Without it a whitelist
   * relay CLOSEs the first REQ with `auth-required:` (it arrives before the
   * AUTH round-trip finishes) and nostr-tools never re-issues it.
   */
  signAuth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
  /** Unix seconds a relay's watch should start from. */
  sinceFor(relay: string): number;
  now?: () => number;
}

type StreamKey = 'tagged' | 'live';

interface WatchStream {
  close: () => void;
  retry: ReturnType<typeof setTimeout> | null;
}

type WatchEntry = Record<StreamKey, WatchStream>;

/** Slack on the live stream's `since`, for clock skew between peers. */
const LIVE_SKEW_S = 30;

export class BackgroundRelayWatcher {
  private pool: WatchPool | null = null;
  private me: string | null = null;
  private entries = new Map<string, WatchEntry>();

  constructor(private readonly deps: WatcherDeps) {}

  /** Relays currently watched. */
  get watched(): string[] {
    return Array.from(this.entries.keys());
  }

  isWatched(url: string): boolean {
    return this.entries.has(normalizeRelayUrl(url));
  }

  /** Converge on exactly `targets` for `me`. Idempotent. */
  sync(me: string | null, targets: ReadonlyArray<string>): void {
    if (!me || targets.length === 0) {
      this.stop();
      return;
    }
    if (this.me && this.me !== me) this.stop();
    this.me = me;
    const want = new Set(targets.map(normalizeRelayUrl).filter(Boolean));
    for (const relay of Array.from(this.entries.keys())) {
      if (!want.has(relay)) this.unwatch(relay, true);
    }
    for (const relay of want) {
      if (!this.entries.has(relay)) this.watch(relay);
    }
  }

  stop(): void {
    for (const relay of Array.from(this.entries.keys())) this.unwatch(relay, false);
    const pool = this.pool;
    this.pool = null;
    this.me = null;
    if (pool) {
      try { pool.destroy?.(); } catch { /* ignore */ }
    }
  }

  private getPool(): WatchPool {
    if (!this.pool) this.pool = this.deps.createPool((url) => this.isWatched(url));
    return this.pool;
  }

  private watch(relay: string): void {
    const me = this.me;
    if (!me) return;
    const entry: WatchEntry = {
      tagged: { close: () => {}, retry: null },
      live: { close: () => {}, retry: null },
    };
    this.entries.set(relay, entry);
    this.open(relay, entry, 'tagged', me);
    this.open(relay, entry, 'live', me);
  }

  /**
   * Two streams per relay:
   *
   *   • `tagged` — `#p:[me]` from the relay's mention cursor: catches what
   *     happened while the app was closed, cheaply.
   *   • `live` — every kind 9 from now on, no backfill. Catches mentions
   *     whose sender didn't `p`-tag them (older Obelisk builds, other
   *     clients). The relay filters visibility per event, so this is only
   *     what the user could read anyway.
   */
  private open(relay: string, entry: WatchEntry, key: StreamKey, me: string): void {
    const stream = entry[key];
    const now = Math.floor((this.deps.now?.() ?? Date.now()) / 1000);
    const filter: Filter = key === 'tagged'
      ? {
        kinds: [KIND_GROUP_MESSAGE],
        '#p': [me],
        since: Math.max(this.deps.sinceFor(relay), now - BACKGROUND_LOOKBACK_S),
        limit: 50,
      }
      : { kinds: [KIND_GROUP_MESSAGE], since: now - LIVE_SKEW_S };
    let closedByUs = false;
    const sub = this.getPool().subscribe([relay], filter, {
      label: `background-${key}`,
      ...(this.deps.signAuth ? { onauth: this.deps.signAuth } : {}),
      onevent: (ev) => {
        if (this.entries.get(relay) !== entry) return;
        this.deps.onEvent(relay, ev);
      },
      onclose: (reasons) => {
        // The pool reconnects dropped sockets by itself; this fires when it
        // gave up (connect failure, relay CLOSED us). Try again later —
        // unless the relay said we may not read here at all; hammering a
        // whitelist every 30s buys nothing.
        if (closedByUs || this.entries.get(relay) !== entry || this.me !== me) return;
        if (reasons.some((r) => /^(restricted|blocked):/.test(r))) return;
        stream.retry = setTimeout(() => {
          stream.retry = null;
          if (this.entries.get(relay) === entry && this.me === me) this.open(relay, entry, key, me);
        }, BACKGROUND_RETRY_MS);
      },
    });
    stream.close = () => {
      closedByUs = true;
      try { sub.close(); } catch { /* ignore */ }
    };
  }

  private unwatch(relay: string, closeSocket: boolean): void {
    const entry = this.entries.get(relay);
    if (!entry) return;
    this.entries.delete(relay);
    for (const stream of [entry.tagged, entry.live]) {
      if (stream.retry) clearTimeout(stream.retry);
      stream.close();
    }
    if (closeSocket && this.pool) {
      try { this.pool.close([relay]); } catch { /* ignore */ }
    }
  }
}
