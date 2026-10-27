/**
 * Where a relay invite waits between visits (`obelisk-dex/relay-invite`).
 * Bridge-free on purpose: the `/invite/<code>` landing only keeps the code,
 * and must not download the relay client to do it. Redeeming is
 * `./relay-invite.ts`.
 */
import { RELAY_INVITE_KEY } from '@/constants/relay/relay-invite';
import { inviteNeedsRedeem, type StoredRelayInvite } from '@/utils/relay/relay-invite';

export function readStoredInvite(): StoredRelayInvite | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RELAY_INVITE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRelayInvite>;
    if (typeof parsed.code !== 'string' || typeof parsed.relay !== 'string') return null;
    return { code: parsed.code, relay: parsed.relay, redeemed: Array.isArray(parsed.redeemed) ? parsed.redeemed.filter((p) => typeof p === 'string') : [] };
  } catch {
    return null;
  }
}

function writeStoredInvite(invite: StoredRelayInvite | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (invite) window.localStorage.setItem(RELAY_INVITE_KEY, JSON.stringify(invite));
    else window.localStorage.removeItem(RELAY_INVITE_KEY);
  } catch {
    // Private mode or a full quota: the invite lasts this visit only.
  }
}

/** Keep the code from a link. A new code replaces any older one; keys it already let in stay recorded. */
export function storeInvite(code: string, relay: string): void {
  const prev = readStoredInvite();
  const keep = prev && prev.code === code && prev.relay === relay ? prev.redeemed : [];
  writeStoredInvite({ code, relay, redeemed: keep });
}

export function forgetInvite(): void {
  writeStoredInvite(null);
}

export function markRedeemed(pubkey: string): void {
  const invite = readStoredInvite();
  if (!invite || invite.redeemed.includes(pubkey)) return;
  writeStoredInvite({ ...invite, redeemed: [...invite.redeemed, pubkey] });
}

/** Whether the stored invite still has to be redeemed for `pubkey` on `relay`. */
export function pendingInviteFor(relay: string | null, pubkey: string | null): StoredRelayInvite | null {
  const invite = readStoredInvite();
  return inviteNeedsRedeem(invite, relay, pubkey) ? invite : null;
}

/** A pending invite and no account yet: whether to make one silently. */
export function hasInviteWaitingForKey(relay: string | null): boolean {
  const invite = readStoredInvite();
  // Only a fresh invite: once it let any key in, a logged-out person chose
  // to log out and gets the login screen, not a new key.
  return !!invite && invite.redeemed.length === 0 && inviteNeedsRedeem(invite, relay, 'any');
}
