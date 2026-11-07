'use client';

import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { shortNpub } from '@/utils/message-text/mentions';

/** `@name` for a mentioned key: display name, else name, else a short npub. */
export function MentionName({ pubkey }: { pubkey: string }) {
  const meta = useAuthor(pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(pubkey);
  return <>@{name}</>;
}
