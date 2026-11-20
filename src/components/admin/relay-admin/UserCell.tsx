'use client';

import { Link } from '@/i18n/navigation';
import UserRow from '@/components/ui/data/UserRow';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { safeNpub, shortNpubLabel } from '@/utils/identity/short-npub';

export default function UserCell({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = displayNameFor(pubkey, author);
  const keyLabel = shortNpubLabel(pubkey);
  return <Link href={`/p/${safeNpub(pubkey)}`} target="_blank" rel="noopener noreferrer"
    className="block rounded-md px-1 hover:bg-lc-card focus-visible:outline-2 focus-visible:outline-lc-green"><UserRow pubkey={pubkey} picture={author.picture} name={name} size="md" className="px-0"
    meta={name !== keyLabel && keyLabel ? <span title={safeNpub(pubkey)}>{keyLabel}</span> : undefined} /></Link>;
}
