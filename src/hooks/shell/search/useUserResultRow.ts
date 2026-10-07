'use client';

import { formatPubkey } from '@nostr-wot/data';
import type { UserHit } from '@/hooks/identity/useNostrUserSearch';
import { useNip05Status } from '@/hooks/identity/useNip05Status';
import { nameInitial } from '@/utils/shell/desktop/search-results';

/**
 * One person in the search dropdown. `peek`: a result list must not make the
 * reader's browser call a domain each profile author chose. The handle stays
 * a muted claim unless a lookup the reader initiated (the NIP-05 row, an
 * opened popover) already confirmed it.
 */
export function useUserResultRow(hit: UserHit) {
  const name = hit.displayName ?? formatPubkey(hit.pubkey);
  const nip05State = useNip05Status(hit.pubkey, hit.nip05, 'peek');
  return {
    name,
    initial: nameInitial(name),
    sub: hit.nip05 ?? formatPubkey(hit.pubkey),
    verified: nip05State === 'verified',
    /** Only a row with a handle reports its check state. */
    nip05State: hit.nip05 ? nip05State : undefined,
  };
}
