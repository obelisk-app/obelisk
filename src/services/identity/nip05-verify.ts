'use client';

/**
 * NIP-05 verification: does `<local>@<domain>` really point at this pubkey?
 *
 * A kind-0 `nip05` field is free text. Anyone can publish a profile that
 * says `jack@cash.app`; the string proves nothing until the reader's client
 * fetches `https://cash.app/.well-known/nostr.json?name=jack` and finds the
 * same pubkey under `names.jack`. Until this module existed the app drew a
 * check badge on the bare string, which made the badge an impersonation
 * primitive rather than a trust signal.
 *
 * Three states, so a badge can never appear before the check completes:
 *
 *   - `unchecked`  - nothing known yet (also the server-render snapshot)
 *   - `checking`   - a fetch is in flight
 *   - `verified`   - `names[local]` matched the pubkey
 *   - `unverified` - anything else: mismatch, missing name, bad JSON,
 *                    non-200, timeout, network error, malformed identifier.
 *                    Failure is never read as success.
 *
 * ## Why not `nip05.queryProfile` from nostr-tools
 *
 * It exists in the installed version (2.23.3) and does the same fetch, but
 * it has no timeout (a profile author's domain could hold the connection
 * open and pin the UI in "checking" for as long as it likes), it does not
 * validate that the returned value is a 64-hex pubkey, and it binds `fetch`
 * at import time, which makes it awkward to test. The fetch here is ~20
 * lines and mirrors `resolveNip05` in `services/identity/user-search.ts`. The
 * identifier grammar is still the library's `NIP05_REGEX`.
 *
 * ## Privacy
 *
 * Verifying means the reader's browser contacts a domain the *profile
 * author* chose, which hands that domain the reader's IP and the time they
 * looked. So verification is **lazy**: `useNip05Status` only fetches in
 * `'verify'` mode, which the profile popover uses (the reader explicitly
 * opened that person), and list rows (search results, DM picker, feed
 * cards) use `'peek'`, which reads the cache and never touches the network.
 * A row therefore shows a badge only when a popover (or a NIP-05 lookup the
 * reader typed themselves) already established it.
 *
 * ## Cache
 *
 * In-memory, bounded to `NIP05_CACHE_MAX` entries with least-recently-used
 * eviction (a `Map` keeps insertion order; a hit re-inserts). Positive
 * results live `NIP05_VERIFIED_TTL_MS`, negative ones the shorter
 * `NIP05_UNVERIFIED_TTL_MS` so a transient outage or a freshly configured
 * `nostr.json` is retried soon. Concurrent calls for the same pair share
 * one request.
 */

import { NIP05_REGEX } from 'nostr-tools/nip05';
import {
  NIP05_CACHE_MAX,
  NIP05_VERIFIED_TTL_MS,
  NIP05_UNVERIFIED_TTL_MS,
  NIP05_FETCH_TIMEOUT_MS,
} from '@/constants/identity/nip05-verify';

export type Nip05State = 'unchecked' | 'checking' | 'verified' | 'unverified';

type Settled = Exclude<Nip05State, 'unchecked' | 'checking'>;
type Entry = { state: Settled; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Nip05State>>();
const listeners = new Set<() => void>();

const HEX64 = /^[0-9a-f]{64}$/i;

/** `name@domain` → its parts, or null when it is not a NIP-05 identifier. */
export function parseNip05(value: string | null | undefined): { local: string; domain: string } | null {
  const match = NIP05_REGEX.exec((value ?? '').trim());
  if (!match) return null;
  const [, local = '_', domain] = match;
  return { local, domain: domain.toLowerCase() };
}

function keyFor(pubkey: string, parsed: { local: string; domain: string }): string {
  return `${pubkey.toLowerCase()}|${parsed.local.toLowerCase()}@${parsed.domain}`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function readCache(key: string): Settled | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.state === 'verified' ? NIP05_VERIFIED_TTL_MS : NIP05_UNVERIFIED_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return null;
  }
  // Re-insert so the Map's order is recency, which makes eviction LRU.
  cache.delete(key);
  cache.set(key, entry);
  return entry.state;
}

function writeCache(key: string, state: Settled): void {
  cache.delete(key);
  if (cache.size >= NIP05_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { state, at: Date.now() });
}

/**
 * The one network call. Everything that is not an exact match is
 * `unverified`; nothing in here can throw past the caller.
 */
async function lookup(pubkey: string, parsed: { local: string; domain: string }): Promise<Settled> {
  if (typeof fetch !== 'function') return 'unverified';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NIP05_FETCH_TIMEOUT_MS);
  try {
    const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.local)}`;
    // `redirect: 'manual'`: a redirect would send the reader's IP to a
    // second host of the author's choosing; NIP-05 does not need one.
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) return 'unverified';
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object') return 'unverified';
    const names = (body as { names?: unknown }).names;
    if (!names || typeof names !== 'object') return 'unverified';
    // `hasOwnProperty`, not indexing: `names["constructor"]` would otherwise
    // read from Object.prototype.
    const table = names as Record<string, unknown>;
    const candidates = [parsed.local, parsed.local.toLowerCase()];
    for (const name of candidates) {
      if (!Object.prototype.hasOwnProperty.call(table, name)) continue;
      const found = table[name];
      if (typeof found === 'string' && HEX64.test(found) && found.toLowerCase() === pubkey.toLowerCase()) {
        return 'verified';
      }
    }
    return 'unverified';
  } catch {
    return 'unverified';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What is known right now, without touching the network.
 *
 * `unverified` for inputs that cannot be an identifier at all, so a badge
 * is impossible for `nip05: "verified ✓"` and friends.
 */
export function peekNip05(pubkey: string | null | undefined, nip05: string | null | undefined): Nip05State {
  if (!pubkey || !nip05) return 'unchecked';
  const parsed = parseNip05(nip05);
  if (!parsed || !HEX64.test(pubkey)) return 'unverified';
  const key = keyFor(pubkey, parsed);
  if (inflight.has(key)) return 'checking';
  return readCache(key) ?? 'unchecked';
}

/** Verify, hitting the cache first and sharing an in-flight request. */
export function verifyNip05(pubkey: string, nip05: string): Promise<Nip05State> {
  const parsed = parseNip05(nip05);
  if (!parsed || !HEX64.test(pubkey)) return Promise.resolve('unverified');
  const key = keyFor(pubkey, parsed);
  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;

  const run = lookup(pubkey, parsed).then((state) => {
    writeCache(key, state);
    inflight.delete(key);
    notify();
    return state;
  });
  inflight.set(key, run);
  notify();
  return run;
}

/**
 * Seed a positive result from a lookup that already happened elsewhere.
 *
 * `useNostrUserSearch` resolves a typed `name@domain` to a pubkey through
 * the same `.well-known` document, so when it returns a hit the match is
 * established; recording it lets the row show the badge without a second
 * request.
 */
export function recordNip05Resolution(pubkey: string, nip05: string): void {
  const parsed = parseNip05(nip05);
  if (!parsed || !HEX64.test(pubkey)) return;
  writeCache(keyFor(pubkey, parsed), 'verified');
  notify();
}

export function subscribeNip05(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: forget everything. */
export function resetNip05Cache(): void {
  cache.clear();
  inflight.clear();
}

/** Test seam: how many pairs are cached. */
export function nip05CacheSize(): number {
  return cache.size;
}
