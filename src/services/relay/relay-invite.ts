/**
 * Relay invitation codes, client side: keep the code from the link and
 * redeem it for every key the person ends up using on that relay. Protocol: obelisk-relay `docs/relay-invites.md`;
 * flow: `docs/features/relay-invites.md`.
 */
import { nostrActions, pageRelayHub } from '@/services/nostr-bridge';
import { RELAY_INVITE_CLAIM_TIMEOUT_MS, RELAY_INVITE_RETRY_DELAY_MS } from '@/constants/relay/relay-invite';
import { forgetInvite, markInviteSteered, markRedeemed } from './relay-invite-storage';
import {
  inviteSteerTarget,
  isDeadInviteReason,
  isRetryableClaimAnswer,
  isTrustedInviteRelay,
  relayInviteClaimTemplate,
  relayInviteRefusalReason,
  type RelayInviteDeadReason,
  type StoredRelayInvite,
} from '@/utils/relay/relay-invite';
import { shortHost } from '@/utils/relay-url/url-host';

export type RedeemOutcome =
  | { status: 'admitted' }
  | { status: 'dead'; reason: RelayInviteDeadReason }
  | { status: 'retry'; reason: string | null };

/** Sign a fresh claim (a new `created_at` each time) and send it to the invite's relay only. */
async function sendClaim(invite: StoredRelayInvite) {
  const event = await nostrActions.signEventTemplate(relayInviteClaimTemplate(invite.code, Math.floor(Date.now() / 1000)));
  const [row] = await pageRelayHub().publish({
    relays: [invite.relay],
    event,
    authMode: 'never',
    ackTimeoutMs: RELAY_INVITE_CLAIM_TIMEOUT_MS,
  });
  return row;
}

/**
 * Send the NIP-43 claim for the stored code, signed by the session's key,
 * to the one relay it belongs to. The signature is the proof; no AUTH.
 * A `stale` refusal (clock skew) or no answer at all is tried once more,
 * after `retryDelayMs`, with a freshly signed claim.
 */
export async function redeemInvite(
  invite: StoredRelayInvite,
  pubkey: string,
  retryDelayMs = RELAY_INVITE_RETRY_DELAY_MS,
): Promise<RedeemOutcome> {
  let row = await sendClaim(invite);
  if (isRetryableClaimAnswer(row?.status, row?.reason)) {
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    row = await sendClaim(invite);
  }
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

/** Put the app on the invite's relay: into the rail if it is new, then switch. */
export async function enterInviteRelay(relay: string): Promise<void> {
  try {
    await nostrActions.addRelay(relay);
  } catch (e) {
    // Already in the rail is fine; anything else (a bad URL) is not.
    if (!/already/i.test((e as Error).message || '')) throw e;
  }
  await nostrActions.switchRelay(relay);
}


export type InviteSteerOutcome = 'none' | 'switched' | 'declined' | 'failed';

export interface InviteSteerDeps {
  /** The relay in view and the person's relay list. */
  readonly current: string | null | undefined;
  readonly configured: ReadonlyArray<string>;
  /** Ask before a relay the person never chose; resolves false to stay. */
  readonly confirm: (host: string) => Promise<boolean>;
  /** Add the relay and switch to it (`enterInviteRelay`). */
  readonly enter: (relay: string) => Promise<void>;
}

/**
 * Take a logged-out visitor to a fresh invite's relay, once per stored
 * invite. The `?relay=` deep link is only read by the chat shell, which a
 * visitor with no account never mounts, so without this the invite waited
 * on the default relay. The same trust rule as the deep link applies
 * (obelisk-relay `docs/relay-invites.md` §6 step 2): silently only for a
 * relay already in the person's list or a built-in default; any other relay
 * is asked about first, and nothing reaches it before a yes. The answer is
 * kept in the stored invite, so a reload neither asks nor switches again.
 */
export async function steerToInviteRelay(invite: StoredRelayInvite | null, deps: InviteSteerDeps): Promise<InviteSteerOutcome> {
  const target = inviteSteerTarget(invite, deps.current);
  if (!invite || !target) return 'none';
  if (!isTrustedInviteRelay(target, deps.configured) && !(await deps.confirm(shortHost(target)))) {
    markInviteSteered(invite.code, 'declined');
    return 'declined';
  }
  markInviteSteered(invite.code, 'offered');
  try {
    await deps.enter(target);
    return 'switched';
  } catch {
    return 'failed';
  }
}
