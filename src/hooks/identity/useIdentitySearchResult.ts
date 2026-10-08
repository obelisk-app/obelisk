'use client';

import type { UserHit } from '@/constants/identity/user-search';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useNip05Status } from '@/hooks/identity/useNip05Status';
import { displayNameFor } from '@/utils/identity/display-name';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/**
 * One person in DM or social search results. A pasted npub comes back with no
 * profile, so the row resolves it the way the rest of the DM surface does
 * and shows who it is before you open it.
 */
export function useIdentitySearchResult(hit: UserHit) {
  const author = useAuthor(hit.pubkey);
  const name = hit.displayName || displayNameFor(hit.pubkey, author);
  const picture = hit.picture ?? author.picture;
  const nip05 = hit.nip05 ?? author.nip05;
  // A kind-0 `nip05` is a free-text claim. `peek` never fetches (a row
  // should not leak the reader's IP to a domain the profile author picked);
  // it turns green only when a lookup elsewhere, such as the NIP-05 search
  // above or an opened popover, already confirmed the pair.
  const nip05State = useNip05Status(hit.pubkey, nip05, 'peek');
  return {
    name,
    nip05,
    picture,
    sub: nip05 ?? shortNpubLabel(hit.pubkey),
    verified: nip05State === 'verified',
    /** Only a row with a handle reports its check state. */
    nip05State: nip05 ? nip05State : undefined,
  };
}
