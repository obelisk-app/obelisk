import { useMemo, useState } from 'react';
import { npubToHex } from '@nostr-wot/data';
import { useDirectMessages } from '@/services/nostr-bridge';
import { useNostrUserSearch } from '@/hooks/identity/useNostrUserSearch';
import { uniqueHits } from '@/utils/shell/mobile/dm-list';

/**
 * The phone new-message screen: recent conversations until two characters
 * are typed, then people search (the direct and NIP-05 hits first, each
 * person once), and Next once the field holds a key.
 */
export function useComposeDmScreen(selectPeer: (peer: string) => void) {
  const [query, setQuery] = useState('');
  const dms = useDirectMessages();
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);
  const recent = useMemo(() => Object.keys(dms).slice(0, 20), [dms]);
  const results = useMemo(() => uniqueHits([directHit, nip05Hit, ...nostrResults]), [directHit, nip05Hit, nostrResults]);
  const decoded = npubToHex(query);
  return {
    query,
    setQuery,
    recent,
    results,
    loading,
    searching: query.trim().length >= 2,
    canNext: !!decoded,
    next: () => {
      if (decoded) selectPeer(decoded);
    },
  };
}
