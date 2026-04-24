'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';

export type InitialUrl = { s: string | null; c: string | null; m: string | null; p: string | null };

/**
 * Resolves `/chat?c=<slug>` into a concrete `{ serverId, channelId }` pair
 * before the server/channel auto-select effects kick in. If `c` already looks
 * like a cuid (or is missing) this short-circuits to `done=true` immediately.
 *
 * Writes the resolved ids back into `initialUrlRef.current.s` / `.c` so the
 * downstream loaders land the user on the right server + channel.
 */
export function useSlugResolution(initialUrlRef: MutableRefObject<InitialUrl | null>) {
  // Slug share-links (e.g. /chat?c=plaza-publica&m=<id>) are resolved via
  // /api/channels/resolve-slug before the server/channel auto-select kicks
  // in, so the user lands on the right server + channel. If the incoming
  // `c` is a cuid, this is a no-op.
  // Gated: server auto-select (below) waits until slug resolution finishes
  // so `?c=plaza-publica` lands on the right server instead of the first
  // server in the list.
  const [slugResolutionDone, setSlugResolutionDone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const c = initialUrlRef.current?.c;
    if (!c) return true;
    const looksLikeId = /^[a-z0-9]{20,32}$/i.test(c) && !c.includes('-');
    return looksLikeId;
  });
  const slugResolvedRef = useRef(false);
  useEffect(() => {
    if (slugResolvedRef.current) return;
    const c = initialUrlRef.current?.c;
    const s = initialUrlRef.current?.s;
    if (!c) { setSlugResolutionDone(true); return; }
    const looksLikeId = /^[a-z0-9]{20,32}$/i.test(c) && !c.includes('-');
    if (looksLikeId) { setSlugResolutionDone(true); return; }
    slugResolvedRef.current = true;
    const qs = new URLSearchParams({ c });
    if (s) qs.set('s', s);
    fetch(`/api/channels/resolve-slug?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.serverId && data.channelId) {
          initialUrlRef.current = {
            ...(initialUrlRef.current ?? { s: null, c: null, m: null, p: null }),
            s: data.serverId,
            c: data.channelId,
          };
        }
      })
      .catch(() => {})
      .finally(() => setSlugResolutionDone(true));
  }, []);

  return slugResolutionDone;
}
