'use client';

import { displayNameFor } from '@/utils/identity/display-name';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';

/** A person's display name, for the lists in the hover cards. */
export function PubkeyName({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  return <>{displayNameFor(pubkey, meta)}</>;
}
