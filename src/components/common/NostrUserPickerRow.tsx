'use client';

import type { UserHit } from '@/constants/identity/user-search';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import UserRow from '@/components/ui/data/UserRow';

export default function NostrUserPickerRow({ hit, selected, onPick }: {
  hit: UserHit;
  selected: boolean;
  onPick: (pubkey: string) => void;
}) {
  const author = useAuthor(hit.pubkey);
  return (
    <UserRow
      pubkey={hit.pubkey}
      name={author.displayName || author.name || hit.displayName || shortNpubLabel(hit.pubkey)}
      picture={author.picture || hit.picture}
      meta={hit.nip05 || shortNpubLabel(hit.pubkey)}
      size="sm"
      state={selected ? 'selected' : 'idle'}
      onClick={() => onPick(hit.pubkey)}
    />
  );
}
