import { SESSION_IDENTITY_ID } from '@nostr-wot/relay/hub';
import { ANONYMOUS_IDENTITY } from '@/constants/nostr-bridge/session';
import type { LifecycleTargets } from './lifecycle';

/** Login and reload must install the signer before any relay can challenge it. */
export function installSessionIdentity(t: LifecycleTargets): void {
  const session = t.state.session;
  t.hub.setIdentity(session ? {
    id: SESSION_IDENTITY_ID,
    pubkey: session.pubKeyHex,
    signer: (event) => t.signSessionAuth(event),
    authPolicy: 'auth-when-challenged',
    localSigner: session.loginMethod === 'nsec',
  } : ANONYMOUS_IDENTITY);
}
