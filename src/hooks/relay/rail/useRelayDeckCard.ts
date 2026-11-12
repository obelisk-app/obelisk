import { useState } from 'react';
import { useRelayInfo } from '@/hooks/relay/info/useRelayInfo';
import { useRelayBranding } from '@/hooks/relay/branding/useRelayBranding';
import { operatorPubkeyFromRelayInfo } from '@/services/relay/relay-info';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { useUnreadMentionCount } from '@/hooks/notifications/useNotificationSelectors';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

export function useRelayDeckCard(url: string, active: boolean) {
  const { info, loaded } = useRelayInfo(url);
  const operator = operatorPubkeyFromRelayInfo(info);
  // Cards are mounted only while the picker is open; load operator branding for every visible relay.
  const branding = useRelayBranding(url, operator ? [operator] : []);
  const [failedBanner, setFailedBanner] = useState('');
  const unread = useUnreadMentionCount(active ? null : normalizeRelayUrl(url));
  return {
    loaded, unread,
    name: branding?.name || info?.name || relayHostLabel(url),
    banner: branding?.banner && branding.banner !== failedBanner ? branding.banner : null,
    description: branding?.description || info?.description,
    onBannerError: () => setFailedBanner(branding?.banner ?? ''),
  };
}
