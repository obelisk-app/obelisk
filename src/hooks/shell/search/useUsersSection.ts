'use client';

import { useEffect } from 'react';
import { useNostrUserSearch } from '@/hooks/identity/useNostrUserSearch';
import { recordNip05Resolution } from '@/services/identity/nip05-verify';
import { userSearchRows } from '@/utils/shell/desktop/search-results';

/** The search dropdown's people: one people search for the typed query, as badged rows. */
export function useUsersSection(query: string) {
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);

  // The reader typed this handle and the `.well-known` lookup resolved it to
  // this pubkey: that is a verification, so remember it for the row.
  useEffect(() => {
    if (nip05Hit?.nip05) recordNip05Resolution(nip05Hit.pubkey, nip05Hit.nip05);
  }, [nip05Hit]);

  const rows = userSearchRows(directHit, nip05Hit, nostrResults);
  return { rows, loading, empty: rows.length === 0 && !loading };
}
