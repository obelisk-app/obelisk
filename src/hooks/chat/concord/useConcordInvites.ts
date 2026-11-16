import { useEffect, useState } from 'react';
import type { ConcordInviteLink } from '@applesauce/concord/client';
import { useConcordClient } from './useConcordClient';

export function useConcordInvites(communityId: string) {
  const { client } = useConcordClient();
  const [invites, setInvites] = useState<ConcordInviteLink[]>([]);
  useEffect(() => {
    if (!client) return;
    const sub = client.invites.live$.subscribe(rows => setInvites(rows.filter(row => row.communityId === communityId)));
    return () => sub.unsubscribe();
  }, [client, communityId]);
  return { invites };
}
