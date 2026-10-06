'use client';

import { useEffect, useState } from 'react';
import { fetchRelayInfo, type RelayInfo } from '@/services/relay-info';

/**
 * A relay's NIP-11 document, fetched once per url. `loaded` turns true when
 * the fetch settles (with or without a document); a stamp for another url
 * does not count, so a new url starts unloaded with no reset step.
 */
export function useRelayInfo(url: string): { info: RelayInfo | null; loaded: boolean } {
  const [result, setResult] = useState<{ url: string; info: RelayInfo | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRelayInfo(url).then((info) => {
      if (alive) setResult({ url, info });
    });
    return () => {
      alive = false;
    };
  }, [url]);
  const loaded = result?.url === url;
  return { info: loaded ? result.info : null, loaded };
}
