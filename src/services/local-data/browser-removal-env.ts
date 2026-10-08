/**
 * What "clear the data on this device" does in a real browser: the side
 * effects `removeEverything` and `removeLocalDataCategory` take through `RemovalEnv`.
 */
import { logoutSession } from '@/services/session/actions';
import { nostrActions } from '@/services/nostr-bridge';
import type { RemovalEnv } from '@/services/local-data';
import { unlocalizedPath } from '@/utils/seo/alternates';
import { disconnectNwcWallet } from '@/services/wallet/nwc-wallet';
import { forgetAnalyticsConsent } from '@/services/analytics/consent';

/** The page-level steps a removal needs: log out, reload, reload without the language prefix. */
export function browserRemovalEnv(): RemovalEnv {
  return {
    logout: () => logoutSession(),
    disconnectWallet: () => disconnectNwcWallet(),
    forgetAnalytics: () => forgetAnalyticsConsent(),
    forgetDirectMessages: () => nostrActions.forgetDirectMessages(),
    reload: () => window.location.reload(),
    relocate: () => {
      const { pathname, search, hash } = window.location;
      window.location.replace(`${unlocalizedPath(pathname)}${search}${hash}`);
    },
  };
}
