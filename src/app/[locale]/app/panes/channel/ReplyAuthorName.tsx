'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';

/** The name of the person being replied to, in the composer's reply bar. */
export function ReplyAuthorName({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  return <span className="font-semibold text-lc-white">{displayNameFor(pubkey, meta)}</span>;
}
