/**
 * Ad-hoc Nostr query hook routed through the shared coalescer. Components
 * needing profile / relay-list / follows lookups should use the SDK's
 * `@nostr-wot/data/react` hooks (`useProfile`, `useRelayList`, `useFollows`)
 * — this hook stays for one-shot filter queries that don't have a dedicated
 * SDK fetcher (e.g. NIP-50 search).
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { sharedCoalescer } from '@nostr-wot/data';

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
