/**
 * Single React-side surface for identity state. Backed by the
 * `nostr-bridge` (NIP-29 SimplePool wrapper). There is no server-validated
 * cookie or backend session anymore — Obelisk is fully Nostr/relays-only,
 * and identity comes straight from the in-memory bridge session that's
 * persisted to localStorage on login.
 *
 * Consumers should prefer this hook over reading individual bridge
 * subscriptions when they need a snapshot. For single-field reads,
 * use the bridge hooks directly (`useMyPubkey`, `useIsLoggedIn`, etc.)
 * to minimize re-renders.
 */

'use client';

import {
  useMyLoginMethod,
  useSignerReady,
} from '@/lib/nostr-bridge';
import { useProfile, usePubkey, useSession } from '@nostr-wot/data/react';
import type { ProfileEntry } from '@nostr-wot/data';

export interface IdentitySnapshot {
  /** Active session pubkey hex, or `null` when logged out. */
  pubkey: string | null;
  /**
   * Kind:0 metadata (display name, avatar, etc.) for the local user, or
   * `null` if not yet fetched. The SDK resolves this on demand once the
   * session is attached.
   */
  profile: ProfileEntry | null;
  /** Login method used for the active session. */
  loginMethod: 'nsec' | 'nip07' | 'bunker' | null;
  /** The SDK session has a pubkey attached (i.e. user is signed in). */
  isConnected: boolean;
  /**
   * The bridge can sign + publish. Always `true` for nsec/NIP-07 once
   * logged in; for NIP-46 bunker it additionally requires the BunkerSigner
   * to have handshaken with its bunker relay. Stays on the bridge — the SDK
   * has no equivalent gate for the bunker handshake.
   */
  signerReady: boolean;
}

export function useIdentity(): IdentitySnapshot {
  const pubkey = usePubkey();
  const profile = useProfile(pubkey);
  const loginMethod = useMyLoginMethod();
  const isConnected = useSession().pubkey !== null;
  const signerReady = useSignerReady();

  return { pubkey, profile, loginMethod, isConnected, signerReady };
}
