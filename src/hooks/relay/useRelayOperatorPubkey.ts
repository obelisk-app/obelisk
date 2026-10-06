'use client';

import { useEffect, useState } from 'react';
import { fetchRelayInfo, operatorPubkeyFromRelayInfo } from '@/services/relay-info';

/**
 * Resolve the human operator from NIP-11 contact, falling back to pubkey. Returns
 * `null` until the fetch completes (or if the relay doesn't advertise a
 * usable operator identity).
 *
 * The answer is stamped with the relay it belongs to and compared on read, so
 * right after a relay switch this is `null`, never the previous relay's
 * operator. A stale answer for one render was enough to subscribe the new
 * relay's operator data with the old relay's operator as its trusted author.
 */
export function useRelayOperatorPubkey(relayUrl: string | null): string | null {
  const [resolved, setResolved] = useState<{ relayUrl: string; pubkey: string | null } | null>(null);
  useEffect(() => {
    if (!relayUrl) return;
    let cancelled = false;
    void fetchRelayInfo(relayUrl).then((info) => {
      if (cancelled) return;
      setResolved({ relayUrl, pubkey: operatorPubkeyFromRelayInfo(info) });
    });
    return () => {
      cancelled = true;
    };
  }, [relayUrl]);
  return resolved && resolved.relayUrl === relayUrl ? resolved.pubkey : null;
}
