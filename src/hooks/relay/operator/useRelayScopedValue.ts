'use client';

import { useEffect, useMemo, useState } from 'react';

/** How an operator-authored, relay-scoped record is subscribed: `channel-layout.ts`, `relay-branding.ts`, `relay-roles.ts`. */
export type RelayScopedSubscribe<T> = (
  relayUrl: string,
  authors: ReadonlyArray<string>,
  onChange: (value: T) => void,
) => () => void;

/** Same record: these are small plain-data values parsed from events or the cache. */
function sameValue<T>(a: T, b: T): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The latest value `subscribe` delivered for `relayUrl`, or `empty`.
 *
 * The value is stamped with the relay it came from and compared on read:
 * - switching relays shows `empty` from the very first render, never the
 *   previous relay's value (the old effect-based reset painted it once);
 * - the author list growing on the same relay (operator data arriving after
 *   the first paint) keeps what is on screen instead of blanking it mid-load.
 *
 * Two guards against a render loop (React error #185, seen on the desktop
 * sidebar): the subscribers paint a cached value synchronously, from inside
 * this effect, so that first delivery is deferred to a microtask instead of
 * being a nested update of the commit that ran the effect; and a value equal
 * to the one already held does not set state at all.
 *
 * `subscribe` is read once, on mount, and is not an effect dependency. The
 * production bundle hands back a new function on every read of a module
 * export that calls itself by name (the subscribers retry themselves once the
 * bridge is up), so depending on its identity resubscribed on every render:
 * that was the loop behind #185 (docs/operations/incident-2026-10-12.md). Authors are compared by content, so a fresh
 * array with the same pubkeys does not resubscribe either.
 */
export function useRelayScopedValue<T>(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
  subscribe: RelayScopedSubscribe<T>,
  empty: T,
): T {
  const authorsKey = [...authors].sort().join(',');
  const authorList = useMemo(() => (authorsKey ? authorsKey.split(',') : []), [authorsKey]);
  const [subscribeOnce] = useState(() => subscribe);
  const [latest, setLatest] = useState<{ relayUrl: string; value: T } | null>(null);
  useEffect(() => {
    if (!relayUrl || authorList.length === 0) return;
    let active = true;
    let subscribing = true;
    const deliver = (value: T) => {
      if (!active) return;
      setLatest((prev) => (prev && prev.relayUrl === relayUrl && sameValue(prev.value, value) ? prev : { relayUrl, value }));
    };
    const unsubscribe = subscribeOnce(relayUrl, authorList, (value) => {
      if (subscribing) queueMicrotask(() => deliver(value));
      else deliver(value);
    });
    subscribing = false;
    return () => {
      active = false;
      unsubscribe();
    };
  }, [relayUrl, authorList, subscribeOnce]);
  return latest && latest.relayUrl === relayUrl ? latest.value : empty;
}
