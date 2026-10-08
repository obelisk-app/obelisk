'use client';

import { useUserMetadata } from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';

/** A live bridge name, optionally styled by its reply bar or other owning surface. */
export default function UserName({ pubkey, className }: { pubkey: string; className?: string }) {
  const metadata = useUserMetadata(pubkey);
  if (className === undefined) return <>{displayNameFor(pubkey, metadata)}</>;
  return <span className={className}>{displayNameFor(pubkey, metadata)}</span>;
}
