'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import TextButton from '@/components/ui/buttons/TextButton';

/** One reposter's name, opening their profile. */
export default function ReposterName({
  pubkey,
  onOpenProfile,
}: {
  pubkey: string;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const author = useAuthor(pubkey);
  const name = displayNameFor(pubkey, author);
  return (
    <TextButton tone="plain" className="font-semibold text-lc-white"
      onClick={() => onOpenProfile?.(pubkey)}
    >
      {name}
    </TextButton>
  );
}
