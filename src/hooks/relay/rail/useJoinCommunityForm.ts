import { useCallback, useContext, useEffect, useRef } from 'react';
import { getConcordForBridge, useBridge } from '@/services/nostr-bridge';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordAdded } from '@/hooks/chat/concord/useConcordAdded';
import { useForm } from '@/hooks/common/useForm';
import { joinCommunityForm } from '@/services/relay/join-community-form';

export function useJoinCommunityForm(onClose: () => void, fromInvite: boolean) {
  const { client } = useContext(ConcordContext);
  const bridge = useBridge();
  const onJoined = useConcordAdded(onClose);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const getClient = useCallback(async () => {
    if (client) return client;
    if (!bridge) throw new Error('No active bridge');
    const signal = lifetime.current?.signal;
    const runtime = await getConcordForBridge(bridge);
    signal?.throwIfAborted();
    return runtime.client;
  }, [client, bridge]);
  // The spec stores getClient and invokes it only during submission.
  // eslint-disable-next-line react-hooks/refs
  return useForm(joinCommunityForm(getClient, onClose, onJoined, fromInvite));
}
