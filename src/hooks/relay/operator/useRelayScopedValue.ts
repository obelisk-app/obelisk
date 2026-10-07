'use client';

import { useEffect, useMemo, useState } from 'react';

/** How an operator-authored, relay-scoped record is subscribed: `channel-layout.ts`, `relay-branding.ts`, `relay-roles.ts`. */
export type RelayScopedSubscribe<T> = (
  relayUrl: string,
  authors: ReadonlyArray<string>,
  onChange: (value: T) => void,
) => () => void;

/**
 * The latest value `subscribe` delivered for `relayUrl`, or `empty`.
 *
 * The value is stamped with the relay it came from and compared on read:
 * - switching relays shows `empty` from the very first render, never the
 *   previous relay's value (the old effect-based reset painted it once);
 * - the author list growing on the same relay (operator data arriving after
 *   the first paint) keeps what is on screen instead of blanking it mid-load.
 *
 * `subscribe` must be a stable module function. Authors are compared by
 * content, so a fresh array with the same pubkeys does not resubscribe.
 */
export function useRelayScopedValue<T>(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
  subscribe: RelayScopedSubscribe<T>,
  empty: T,
): T {
  const authorsKey = [...authors].sort().join(',');
  const authorList = useMemo(() => (authorsKey ? authorsKey.split(',') : []), [authorsKey]);
  const [latest, setLatest] = useState<{ relayUrl: string; value: T } | null>(null);
  useEffect(() => {
    if (!relayUrl || authorList.length === 0) return;
    return subscribe(relayUrl, authorList, (value) => setLatest({ relayUrl, value }));
  }, [relayUrl, authorList, subscribe]);
  return latest && latest.relayUrl === relayUrl ? latest.value : empty;
}
