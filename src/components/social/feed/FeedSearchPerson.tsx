'use client';

import type { UserHit } from '@/constants/identity/user-search';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import UserAvatar from '@/components/ui/media/UserAvatar';

/** A person in the search results: avatar, name and NIP-05; opens their profile. */
export default function FeedSearchPerson({ hit, onOpen }: { hit: UserHit; onOpen: (pubkey: string) => void }) {
  // Merge with our own resolver: NIP-50 hits often carry no picture, and the
  // cached profile usually does.
  const author = useAuthor(hit.pubkey);
  const name = author.displayName || author.name || hit.displayName || shortNpubLabel(hit.pubkey);
  const nip05 = author.nip05 || hit.nip05;

  return (
    <button
      type="button"
      onClick={() => onOpen(hit.pubkey)}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      data-testid="search-person"
    >
      <UserAvatar
        pubkey={hit.pubkey}
        picture={author.picture ?? hit.picture}
        size={9}
        name={name}
        alt=""
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-lc-white">{name}</span>
        {nip05 && <span className="block truncate text-[11px] text-lc-green">{nip05}</span>}
      </span>
    </button>
  );
}
