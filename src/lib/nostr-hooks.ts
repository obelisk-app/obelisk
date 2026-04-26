/**
 * React hooks bound to the keyed observables in profile-cache,
 * relay-list-cache, and follows. Each hook subscribes to the slot for the
 * given key via `useSyncExternalStore`, so components re-render only when
 * THAT key's slot changes.
 *
 * The hooks also kick off the underlying fetch lazily (via `getProfile` /
 * `getRelays` / `hydrateFollows`) the first time they observe a key,
 * routing through the shared coalescer so cross-component requests are
 * batched.
 */

'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { sharedCoalescer } from './nostr-coalescer';
import { _profileStore, getProfile, type ProfileEntry } from './dm/profile-cache';
import { _relayStore, getRelays, entryToRelayListResult, type RelayListResult } from './dm/relay-list-cache';
import { _followsStore, hydrateFollows } from './dm/follows';

/**
 * Subscribe to the cached profile for `partner` viewed from `me`.
 * Returns the latest `ProfileEntry` or `null` if nothing has been fetched
 * yet. Triggers a relay fetch on first observation per (me, partner).
 */
export function useProfile(me: string | null, partner: string | null): ProfileEntry | null {
  const store = _profileStore();
  const k = me && partner ? `${me}|${partner}` : null;

  // Lazy-trigger the cache fetch. Re-runs when the key changes.
  useEffect(() => {
    if (!me || !partner) return;
    getProfile(me, partner);
  }, [me, partner]);

  return useSyncExternalStore(
    (cb) => (k ? store.subscribe(k, () => cb()) : () => {}),
    () => (k ? store.get(k).value ?? null : null),
    () => null,
  );
}

/**
 * Subscribe to the cached relay list (kind-10002 + kind-10050) for
 * `partner` viewed from `me`. Returns the latest `RelayListResult` or a
 * stale-empty default while loading.
 */
export function useRelayList(me: string | null, partner: string | null): RelayListResult {
  const store = _relayStore();
  const k = me && partner ? `${me}|${partner}` : null;

  useEffect(() => {
    if (!me || !partner) return;
    getRelays(me, partner);
  }, [me, partner]);

  // Snapshot is the stable raw entry; useMemo derives the parsed shape so
  // the returned RelayListResult only changes when the entry does.
  const entry = useSyncExternalStore(
    (cb) => (k ? store.subscribe(k, () => cb()) : () => {}),
    () => (k ? store.get(k).value : undefined),
    () => undefined,
  );
  return useMemo(() => entryToRelayListResult(entry), [entry]);
}

/**
 * Subscribe to the current user's follow set. Returns `null` until a
 * kind-3 has been observed (cold-start), then a Set of pubkeys.
 */
export function useFollows(me: string | null): Set<string> | null {
  const store = _followsStore();

  useEffect(() => {
    if (!me) return;
    hydrateFollows(me);
  }, [me]);

  // Snapshot is the raw cached shape (stable across reads). useMemo
  // derives the Set so callers get a fresh Set only when the underlying
  // entry changed. Without this, getSnapshot would build a new Set on
  // every read and useSyncExternalStore would loop.
  const entry = useSyncExternalStore(
    (cb) => (me ? store.subscribe(me, () => cb()) : () => {}),
    () => (me ? store.get(me).value : undefined),
    () => undefined,
  );
  return useMemo(() => (entry ? new Set(entry.pubkeys) : null), [entry]);
}

export interface NostrQueryOptions {
  /** Relay set to query. If omitted, the coalescer's default fallback set
   *  applies (matches `nostr-read.querySigned`'s default). */
  relays?: string[];
  /** Hard ceiling on how long to wait for events. Default 8000ms. */
  timeoutMs?: number;
  /** Skip the fetch entirely (e.g. while inputs are still null). */
  enabled?: boolean;
}

export interface NostrQueryResult {
  events: NostrEvent[];
  loading: boolean;
  error: Error | null;
}

const DEFAULT_QUERY_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://purplepag.es',
  'wss://relay.nostr.band',
];

/**
 * One-shot Nostr query as a React hook. Routes through `sharedCoalescer.
 * querySync` so it batches with concurrent live subscriptions and other
 * one-shot queries within the same 50ms debounce window. Re-fires when
 * `filters` or `relays` change (compared by JSON-stringified value).
 *
 * Use for "fetch this once when X changes" patterns. For live
 * subscriptions, build a thin wrapper around `sharedCoalescer.enqueue`
 * (or use the existing `subscribeLive` / `getProfile` / etc. helpers).
 */
export function useNostrQuery(filters: Filter[], opts: NostrQueryOptions = {}): NostrQueryResult {
  const { enabled = true, timeoutMs } = opts;
  const relays = opts.relays && opts.relays.length > 0 ? opts.relays : DEFAULT_QUERY_RELAYS;

  // Stringified key — `filters` and `relays` are objects, so reference
  // identity isn't useful as a useEffect dep. Stable JSON catches real
  // changes without forcing callers to memoize.
  const key = useMemo(() => JSON.stringify({ filters, relays, timeoutMs }), [filters, relays, timeoutMs]);

  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    sharedCoalescer
      .querySync(filters, { relays, timeoutMs })
      .then((result) => {
        if (cancelled) return;
        setEvents(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => { cancelled = true; };
    // `key` is a JSON string capturing filters + relays + timeoutMs; relying
    // on it keeps the effect stable when callers pass fresh-array literals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { events, loading, error };
}

