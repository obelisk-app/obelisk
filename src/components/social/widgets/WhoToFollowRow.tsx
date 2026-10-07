'use client';

import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import UserAvatar from '@/components/ui/media/UserAvatar';
import FollowButton from '@/app/[locale]/notes/[id]/FollowButton';

/** One suggested person: avatar, name and NIP-05 (opens their profile), and a follow button. */
export default function WhoToFollowRow({
  pubkey,
  onOpenProfile,
}: {
  pubkey: string;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const meta = useAuthor(pubkey);
  const name = meta?.displayName || meta?.name || shortNpubLabel(pubkey);

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5" data-testid="who-to-follow-row">
      <button
        type="button"
        onClick={() => onOpenProfile?.(pubkey)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <UserAvatar pubkey={pubkey} picture={meta?.picture} size={8} name={name} alt={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-lc-white">{name}</span>
          {meta?.nip05 && (
            <span className="block truncate text-[10px] text-lc-muted">{meta.nip05}</span>
          )}
        </span>
      </button>
      <FollowButton pubkey={pubkey} />
    </li>
  );
}
