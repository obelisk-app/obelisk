'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConcordClient } from '@applesauce/concord/client';
import type { CommunityState } from '@applesauce/concord';
import { getConcordForBridge, useBridge } from '@/services/nostr-bridge';
import { useConcordNavigation } from '@/store/chat/concord';
import { errorText } from '@/utils/errors/error-text';

export function useConcordWorkspace() {
  const bridge = useBridge();
  const t = useTranslations();
  const nav = useConcordNavigation();
  const [client, setClient] = useState<ConcordClient | null>(null);
  const [communities, setCommunities] = useState<CommunityState[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    let unsubscribe = () => {};
    const login = bridge.subscribeIsLoggedIn(value => { if (!value) useConcordNavigation.getState().reset(); });
    void getConcordForBridge(bridge).then(runtime => {
      if (!active) return;
      setClient(runtime.client);
      const subscription = runtime.client.communities$.subscribe(setCommunities);
      unsubscribe = () => subscription.unsubscribe();
    }).catch(err => {
      if (process.env.NODE_ENV === 'development' && err instanceof Error) console.error('Concord startup:', err.message.replace(/nsec1[a-z0-9]+|\b[0-9a-f]{64}\b/g, '[redacted]'));
      if (active) setError(errorText(t, err, 'chat.concord.failed'));
    });
    return () => { active = false; unsubscribe(); login(); };
  }, [bridge, t]);
  const community = client && nav.communityId ? client.getCommunity(nav.communityId) : undefined;
  return { ...nav, client, communities, community, error };
}
