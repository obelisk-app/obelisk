'use client';

import MobileRelayStatus from '@/components/relay/MobileRelayStatus';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useMobileServerBanner } from '@/hooks/shell/mobile/rail/useMobileServerBanner';

/** Combined diagnostics in headers that keep all controls beside back navigation. */
export default function MobileSigningIndicator() {
  const relay = useCurrentRelayUrl();
  const vm = useMobileServerBanner(relay);
  return <MobileRelayStatus relays={vm.socialRelays} activeRelay={relay} onOpenSettings={vm.openRelaySettings} />;
}
