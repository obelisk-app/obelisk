'use client';

import { useUserMetadata } from '@/services/nostr-bridge';
import { profileNameOr } from '@/utils/identity/profile-labels';

/** The person: their profile name over the full key. */
export default function UserCell({ pubkey }: { pubkey: string }) {
  const meta = useUserMetadata(pubkey);
  return (
    <>
      <div className="truncate text-lc-white">{profileNameOr(meta, pubkey.slice(0, 12))}</div>
      <div className="truncate font-mono text-[10px] text-lc-muted">{pubkey}</div>
    </>
  );
}
