/**
 * Pure pieces of relay invitation codes: reading a code from a link, the
 * claim event, the relay's refusal reason, and the minter API's URLs.
 */
import { KIND_RELAY_INVITE_CLAIM } from '@/constants/nostr/nip-kinds';
import {
  RELAY_INVITE_API_PATH,
  RELAY_INVITE_CODE_MAX,
  RELAY_INVITE_DEAD_REASONS,
  RELAY_INVITE_REFUSAL_PREFIX,
} from '@/constants/relay/relay-invite';
import { DEFAULT_RELAY } from '@/constants/nostr-bridge/relay';
import { normalizeDeepLinkRelay } from './deep-link';

export type RelayInviteDeadReason = (typeof RELAY_INVITE_DEAD_REASONS)[number];

/** What the app keeps between visits. `redeemed` is every pubkey already let in. */
export interface StoredRelayInvite {
  code: string;
  relay: string;
  redeemed: string[];
}

/** A code from a link, or null when it cannot be one (empty, too long, odd characters). */
export function cleanInviteCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim();
  if (!code || code.length > RELAY_INVITE_CODE_MAX) return null;
  return /^[A-Za-z0-9_-]+$/.test(code) ? code : null;
}

/** The NIP-43 claim template, unsigned. */
export function relayInviteClaimTemplate(code: string, now: number) {
  return { kind: KIND_RELAY_INVITE_CLAIM, created_at: now, content: '', tags: [['claim', code]] };
}

/** The reason word of a relay's refusal (`exhausted`, `stale`, ...), or null when it is not an invite refusal. */
export function relayInviteRefusalReason(message: string | null | undefined): string | null {
  if (!message?.startsWith(RELAY_INVITE_REFUSAL_PREFIX)) return null;
  const word = message.slice(RELAY_INVITE_REFUSAL_PREFIX.length).split(':')[0].trim();
  return word || null;
}

/** Whether a refusal means the code is gone for good. */
export function isDeadInviteReason(reason: string | null): reason is RelayInviteDeadReason {
  return !!reason && (RELAY_INVITE_DEAD_REASONS as readonly string[]).includes(reason);
}

/** `wss://relay.example` -> `https://relay.example`, the origin the minter API is served from. */
export function relayHttpOrigin(relay: string): string {
  return normalizeDeepLinkRelay(relay).replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

/** The minter API URL for `path` (`/me`, `''`, `/<code>`). */
export function relayInviteApiUrl(relay: string, path = ''): string {
  return `${relayHttpOrigin(relay)}${RELAY_INVITE_API_PATH}${path}`;
}

/** The link someone shares: this app's `/invite/<code>` with the relay host. */
export function relayInviteLink(origin: string, code: string, relayHost: string): string {
  return `${origin.replace(/\/+$/, '')}/invite/${encodeURIComponent(code)}?relay=${encodeURIComponent(relayHost)}`;
}

/** Whether `pubkey` still needs the stored invite redeemed on `relay`. */
export function inviteNeedsRedeem(invite: StoredRelayInvite | null, relay: string | null, pubkey: string | null): boolean {
  if (!invite || !relay || !pubkey) return false;
  if (normalizeDeepLinkRelay(invite.relay) !== normalizeDeepLinkRelay(relay)) return false;
  return !invite.redeemed.includes(pubkey);
}

/** The relay an invite link names in `?relay=`, or the default relay when it names none. */
export function inviteLinkRelay(raw: string | string[] | undefined): string {
  const relay = Array.isArray(raw) ? raw[0] : raw;
  return relay ? normalizeDeepLinkRelay(relay) : DEFAULT_RELAY;
}

/** What the invite card shows about a code's use: how full it is and how long it has left. */
export function inviteUsage(
  invite: { uses: number; max_uses: number | null; expires_at: number | null; redemptions: { pubkey: string; at: number }[] },
  nowMs: number,
): { usedPercent: number | null; daysLeft: number | null; joined: { pubkey: string; at: number }[] } {
  const usedPercent = invite.max_uses ? Math.min(100, Math.round((invite.uses / invite.max_uses) * 100)) : null;
  const daysLeft = invite.expires_at == null ? null : Math.max(0, Math.ceil((invite.expires_at * 1000 - nowMs) / 86_400_000));
  // Newest first: who just came in is what the inviter wants to see.
  const joined = [...invite.redemptions].sort((a, b) => b.at - a.at);
  return { usedPercent, daysLeft, joined };
}

