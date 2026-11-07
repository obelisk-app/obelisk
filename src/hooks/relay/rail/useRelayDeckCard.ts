import { useState } from 'react';
import { useRelayInfo } from '@/hooks/relay/info/useRelayInfo';
import { useRelayBranding } from '@/hooks/relay/branding/useRelayBranding';
import { cacheGet } from '@/services/nostr-bridge';
import { operatorPubkeyFromRelayInfo } from '@/services/relay/relay-info';
import type { RelayBranding } from '@/services/relay/relay-branding';
import { KIND_NIP78_APP_DATA } from '@/constants/nostr/nip-kinds';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import { useUnreadMentionCount } from '@/hooks/notifications/useNotificationSelectors';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

export function useRelayDeckCard(url: string, active: boolean) {
  const { info, loaded } = useRelayInfo(url);
  const operator = operatorPubkeyFromRelayInfo(info);
  // Only the active relay gets a live subscription. Other banners use the local cache.
  const live = useRelayBranding(active ? url : null, operator ? [operator] : []);
  const cached = cacheGet<RelayBranding>(url, KIND_NIP78_APP_DATA, `obelisk:branding:${url}`)?.value;
  const branding = active ? live : cached;
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
