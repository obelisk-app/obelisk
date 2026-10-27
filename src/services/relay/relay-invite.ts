/**
 * Relay invitation codes, client side: keep the code from the link, make a
 * key when there is none, and redeem the code for every key the person ends
 * up using on that relay. Protocol: obelisk-relay `docs/relay-invites.md`;
 * flow: `docs/features/relay-invites.md`.
 */
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { nostrActions, pageRelayHub } from '@/services/nostr-bridge';
import type { SessionActions } from '@/types/session/session';
import { RELAY_INVITE_CLAIM_TIMEOUT_MS } from '@/constants/relay/relay-invite';
import { forgetInvite, markRedeemed } from './relay-invite-storage';
import {
  isDeadInviteReason,
  relayInviteClaimTemplate,
  relayInviteRefusalReason,
  type RelayInviteDeadReason,
  type StoredRelayInvite,
} from '@/utils/relay/relay-invite';

export type RedeemOutcome =
  | { status: 'admitted' }
  | { status: 'dead'; reason: RelayInviteDeadReason }
  | { status: 'retry'; reason: string | null };

/**
 * Make a key and log in with it, without the widget's backup steps: the
 * person followed an invite and expects to land in the app. Backing up the
 * key is offered later, in settings.
 */
export async function loginWithFreshKey(actions: SessionActions): Promise<void> {
  const sk = generateSecretKey();
  const nsec = nsecEncode(sk);
  await actions.login({ method: 'generate', pubkey: getPublicKey(sk), nsec });
  // Findable under a random name, like any generated account. Best effort.
  void actions.publishGeneratedProfile(nsec, {}).catch(() => undefined);
}

/**
 * Send the NIP-43 claim for the stored code, signed by the session's key,
 * to the one relay it belongs to. The signature is the proof; no AUTH.
 */
export async function redeemInvite(invite: StoredRelayInvite, pubkey: string): Promise<RedeemOutcome> {
  const event = await nostrActions.signEventTemplate(relayInviteClaimTemplate(invite.code, Math.floor(Date.now() / 1000)));
  const [row] = await pageRelayHub().publish({
    relays: [invite.relay],
    event,
    authMode: 'never',
    ackTimeoutMs: RELAY_INVITE_CLAIM_TIMEOUT_MS,
  });
  // An ephemeral publish with no answer reads `ok` with a reason; only a
  // reasonless ok is the relay saying yes.
  if (row?.status === 'ok' && !row.reason) {
    markRedeemed(pubkey);
    return { status: 'admitted' };
  }
  const reason = relayInviteRefusalReason(row?.reason);
  if (isDeadInviteReason(reason)) {
    forgetInvite();
    return { status: 'dead', reason };
  }
  return { status: 'retry', reason: row?.reason ?? null };
}

/**
 * Put the app on the invite's relay: into the rail if it is new, then
 * switch. Following an invite link is the person asking to join that relay,
 * so a fresh invite does this itself; the `?relay=` deep link alone is only
 * read by the chat shell, which a visitor with no account never mounts.
 */
export async function enterInviteRelay(relay: string): Promise<void> {
  try {
    await nostrActions.addRelay(relay);
  } catch (e) {
    // Already in the rail is fine; anything else (a bad URL) is not.
    if (!/already/i.test((e as Error).message || '')) throw e;
  }
  await nostrActions.switchRelay(relay);
}

