'use client';

import Button from '@/components/ui/buttons/Button';
import { displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import UserAvatar from '@/components/ui/media/UserAvatar';

/** One member of a pack: a small avatar and name that open their profile. */
export default function StarterPackFace({
  pubkey,
  onOpen,
}: {
  pubkey: string;
  onOpen?: (pubkey: string) => void;
}) {
  const author = useAuthor(pubkey);
  // Not `pubkey.slice(0, 8)`: every chip in every pack read as an 8-char hex
  // prefix, so a newcomer could not tell who they were about to follow.
  const name = displayNameFor(pubkey, author);
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onOpen?.(pubkey)}
      className="flex items-center gap-1.5 rounded-full border border-lc-border bg-lc-black py-0.5 pl-0.5 pr-2.5 transition-colors hover:border-lc-green/40"
      data-testid="starter-pack-face"
      title={name}
    >
      <UserAvatar pubkey={pubkey} picture={author.picture} size={6} name={name} alt="" />
      <span className="max-w-[7rem] truncate text-[11px] text-lc-white">{name}</span>
    </Button>
  );
}
