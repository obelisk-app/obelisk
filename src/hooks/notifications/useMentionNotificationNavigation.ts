import { useEffect } from 'react';
import { useAwaitBridge } from '@/services/nostr-bridge';
import { useRelayDeepLink } from '@/hooks/relay/deep-link/useRelayDeepLink';
import { watchMentionNavigation } from '@/services/notifications/navigation';

/** Mounted by either shell; browser and in-app clicks share the same retained target. */
export function useMentionNotificationNavigation() {
  const awaitBridge = useAwaitBridge();
  const switchRelay = useRelayDeepLink();
  useEffect(() => watchMentionNavigation({ awaitBridge, switchRelay }), [awaitBridge, switchRelay]);
}
