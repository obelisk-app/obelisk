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
import { DEFAULT_RELAY, DEFAULT_RELAYS } from '@/constants/nostr-bridge/relay';
import { classifyDeepLinkRelay, normalizeDeepLinkRelay, sameRelay } from './deep-link';

export type RelayInviteDeadReason = (typeof RELAY_INVITE_DEAD_REASONS)[number];

/**
 * What the app keeps between visits. `redeemed` is every pubkey already let
 * in; `steer` records that the app already took (or tried to take) the
 * person to the invite's relay (`offered`) or they said no (`declined`), so a
 * reload does not do it again.
 */
export interface StoredRelayInvite {
  code: string;
  relay: string;
  redeemed: string[];
  steer?: 'offered' | 'declined';
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

/**
 * Whether a claim's answer is worth one more try with a fresh `created_at`:
 * the relay called it `stale` (clock skew), or never answered.
 */
export function isRetryableClaimAnswer(status: string | undefined, reason: string | null | undefined): boolean {
  const word = relayInviteRefusalReason(reason);
  if (word) return word === 'stale';
  return status === 'timeout' || status === 'unreachable' || (status === 'ok' && !!reason);
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

/**
 * The relay a stored invite still has to take the app to, or null: only a
 * fresh invite (no key let in yet), only once (`steer`), and only when the
 * app is not there already.
 */
export function inviteSteerTarget(invite: StoredRelayInvite | null, current: string | null | undefined): string | null {
  if (!invite || invite.redeemed.length > 0 || invite.steer) return null;
  const target = normalizeDeepLinkRelay(invite.relay);
  return sameRelay(current, target) ? null : target;
}

/**
 * Whether the app may switch to `relay` without asking: it is in the
 * person's relay list or one of the built-in defaults. Anything else is a
 * relay they never chose, and an invite link must not point them at it
 * silently (obelisk-relay `docs/relay-invites.md` §6 step 2).
 */
export function isTrustedInviteRelay(relay: string, configured: ReadonlyArray<string>): boolean {
  return classifyDeepLinkRelay(relay, null, [...configured, ...DEFAULT_RELAYS]) !== 'unknown';
}

/** The relay an invite link names in `?relay=`, or the default relay when it names none. */
export function inviteLinkRelay(raw: string | string[] | undefined): string {
  const relay = Array.isArray(raw) ? raw[0] : raw;
  return relay ? normalizeDeepLinkRelay(relay) : DEFAULT_RELAY;
}

/** One person who came in on a link; `removed` when the relay's operator later took them out. */
export interface InviteJoinedPerson {
  pubkey: string;
  at: number;
  removed: boolean;
}

/** What the invite card shows about a code's use: how full it is and how long it has left. */
export function inviteUsage(
  invite: { uses: number; max_uses: number | null; expires_at: number | null; redemptions: { pubkey: string; at: number; evicted_at?: number | null }[] },
  nowMs: number,
): { usedPercent: number | null; daysLeft: number | null; joined: InviteJoinedPerson[] } {
  const usedPercent = invite.max_uses ? Math.min(100, Math.round((invite.uses / invite.max_uses) * 100)) : null;
  const daysLeft = invite.expires_at == null ? null : Math.max(0, Math.ceil((invite.expires_at * 1000 - nowMs) / 86_400_000));
  // Newest first: who just came in is what the inviter wants to see.
  const joined = [...invite.redemptions]
    .sort((a, b) => b.at - a.at)
    .map((r) => ({ pubkey: r.pubkey, at: r.at, removed: r.evicted_at != null }));
  return { usedPercent, daysLeft, joined };
}

