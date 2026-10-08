'use client';

import Text from '@/components/ui/layout/Text';

import Button from '@/components/ui/buttons/Button';
import type { UserHit } from '@/constants/identity/user-search';
import { useIdentitySearchResult } from '@/hooks/identity/useIdentitySearchResult';
import UserAvatar from '@/components/ui/media/UserAvatar';

/** A person in the search results: avatar, name and NIP-05; opens their profile. */
export default function FeedSearchPerson({ hit, onOpen }: { hit: UserHit; onOpen: (pubkey: string) => void }) {
  const row = useIdentitySearchResult(hit);

  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onOpen(hit.pubkey)}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      data-testid="search-person"
    >
      <UserAvatar
        pubkey={hit.pubkey}
        picture={row.picture}
        size={9}
        name={row.name}
        alt=""
      />
      <span className="min-w-0 flex-1">
        <Text size="sm" weight="semibold" tone="default" truncate="truncate" className="block">{row.name}</Text>
        <Text tone={row.verified ? 'accent' : 'muted'} size="11" className="block truncate" data-nip05-state={row.nip05State}>{row.sub}</Text>
      </span>
    </Button>
  );
}
