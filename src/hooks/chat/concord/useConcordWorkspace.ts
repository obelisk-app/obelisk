'use client';

import { useIsLoggedIn, useMyPubkey } from '@/hooks/session/useSession';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ConcordClient } from '@applesauce/concord/client';
import type { CommunityState } from '@applesauce/concord';
import { getConcordForBridge, useBridge } from '@/services/nostr-bridge';
import { useConcordNavigation } from '@/store/chat/concord';
import { useConcordLocation } from './useConcordLocation';
import { parseConcordLocation } from '@/schemas/chat/concord-location';
import { errorText } from '@/utils/errors/error-text';

export function useConcordWorkspace() {
  const bridge = useBridge();
  const loggedIn = useIsLoggedIn();
  const pubkey = useMyPubkey();
  useConcordLocation(loggedIn);
  const t = useTranslations();
  const nav = useConcordNavigation();
  const [client, setClient] = useState<ConcordClient | null>(null);
  const [communities, setCommunities] = useState<CommunityState[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!bridge || !loggedIn) return;
    let active = true;
    let unsubscribe = () => {};
    let stopNavigation = () => {};
    const initialNavigation = useConcordNavigation.getState();
    const login = bridge.subscribeIsLoggedIn(value => { if (!value) { useConcordNavigation.getState().reset(); setClient(null); setCommunities([]); setError(null); } });
    void getConcordForBridge(bridge).then(async runtime => {
      if (!active) return;
      setClient(runtime.client);
      const subscription = runtime.client.communities$.subscribe(setCommunities);
      unsubscribe = () => subscription.unsubscribe();
      const saved = await runtime.readNavigation();
      if (!active) return;
      if (saved && !parseConcordLocation(window.location.hash) && useConcordNavigation.getState() === initialNavigation) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && 'communityId' in parsed && typeof parsed.communityId === 'string' && 'channelId' in parsed && (parsed.channelId === null || typeof parsed.channelId === 'string') && 'open' in parsed && typeof parsed.open === 'boolean') {
            useConcordNavigation.setState({ communityId: parsed.communityId, channelId: parsed.channelId, open: parsed.open });
          }
        } catch { /* Invalid navigation never changes membership state. */ }
      }
      let saving = Promise.resolve();
      stopNavigation = useConcordNavigation.subscribe(next => {
        if (!next.communityId) return;
        const value = JSON.stringify({ communityId: next.communityId, channelId: next.channelId, open: next.open });
        saving = saving.then(() => runtime.saveNavigation(value)).catch(err => { if (active) setError(errorText(t, err, 'chat.concord.failed')); });
      });
    }).catch(err => {
      if (process.env.NODE_ENV === 'development' && err instanceof Error) console.error('Concord startup:', err.message.replace(/nsec1[a-z0-9]+|\b[0-9a-f]{64}\b/g, '[redacted]'));
      if (active) setError(errorText(t, err, 'chat.concord.failed'));
    });
    return () => { active = false; unsubscribe(); stopNavigation(); login(); };
  }, [bridge, loggedIn, pubkey, t]);
  const currentClient = loggedIn && client?.pubkey === pubkey ? client : null;
  const community = currentClient && nav.communityId ? currentClient.getCommunity(nav.communityId) : undefined;
  return { ...nav, client: currentClient, communities: currentClient ? communities : [], community, error };
}
