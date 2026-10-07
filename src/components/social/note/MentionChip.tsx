'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import TextButton from '@/components/ui/buttons/TextButton';

/** A `nostr:npub` mention: the person's name, opening their profile. */
export default function MentionChip({ pubkey, onOpen }: { pubkey: string; onOpen?: (pubkey: string) => void }) {
  const meta = useAuthor(pubkey);
  const label = displayNameFor(pubkey, meta);

  return (
    <TextButton className="px-1 font-medium"
      onClick={() => onOpen?.(pubkey)}
      data-testid="note-mention"
    >
      @{label}
    </TextButton>
  );
}
