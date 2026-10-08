import { useTranslations } from 'next-intl';
import {
  useConnectionState,
  useIsLoggedIn,
  useMyLoginMethod,
  useRelayAccess,
  useCurrentRelayUrl,
} from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import { relayStatus } from '@/utils/relay/relay-status';
import { relayBannerTestId } from '@/utils/feedback/relay-banner';

/**
 * The relay status row's view model: the active relay's status for a
 * signed-in session, or null when there is nothing to say. With
 * `hideAuthenticating` the authentication notices are left to the phone's
 * signer dot (docs/ui/conventions.md#component-files).
 */
export function useRelayStatusBanner(hideAuthenticating: boolean) {
  const t = useTranslations();
  const isLoggedIn = useIsLoggedIn();
  const conn = useConnectionState();
  const access = useRelayAccess();
  const loginMethod = useMyLoginMethod();
  const relay = useCurrentRelayUrl();
  if (!isLoggedIn || !relay) return null;
  const status = relayStatus(conn, access, loginMethod, shortHost(relay), t);
  if (!status || (hideAuthenticating && (status.state === 'authenticating' || status.state === 'auth-required'))) return null;
  return { ...status, testId: relayBannerTestId(status.state) };
}
