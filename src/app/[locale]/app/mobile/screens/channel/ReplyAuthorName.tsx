'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useUserMetadata } from '@/services/nostr-bridge';

/** The name of the person being replied to, in the composer's reply bar. */
export function ReplyAuthorName({ pubkey }: { pubkey: string }) {
  const meta = useUserMetadata(pubkey);
  return <span className="composer-reply-author">{displayNameFor(pubkey, meta)}</span>;
}
