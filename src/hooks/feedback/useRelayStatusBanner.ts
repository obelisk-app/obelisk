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

/** The e2e selector for a status: lost sockets and offline are one banner, relay access the other. */
export function relayBannerTestId(state: string): 'connection-loss-banner' | 'relay-access-banner' {
  return state === 'disconnected' || state === 'offline' ? 'connection-loss-banner' : 'relay-access-banner';
}

/**
 * The relay status row's view model: the active relay's status for a
 * signed-in session, or null when there is nothing to say. With
 * `hideAuthenticating` the authentication notices are left to the phone's
 * signer dot (docs/conventions.md#component-files).
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
