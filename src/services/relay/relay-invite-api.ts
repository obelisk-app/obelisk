/**
 * The relay's invite minter API (obelisk-relay `/api/invites`, NIP-98
 * authenticated): whether this account may invite people, and the codes it
 * made. Called straight from the browser; the relay's CORS is open and the
 * signature is the only credential, so no server of ours holds anything.
 */
import { KIND_HTTP_AUTH } from '@/constants/nostr/nip-kinds';
import { RELAY_INVITE_DEFAULT_TTL_SECS } from '@/constants/relay/relay-invite';
import { nostrActions } from '@/services/nostr-bridge';
import { CodedError } from '@/utils/errors/codes';
import { relayInviteApiUrl } from '@/utils/relay/relay-invite';

export interface RelayInviteRedemption {
  pubkey: string;
  npub: string;
  at: number;
  evicted_at?: number;
}

export interface RelayInviteCode {
  code: string;
  label: string | null;
  status: 'active' | 'revoked' | 'expired' | 'exhausted';
  created_at: number;
  max_uses: number | null;
  uses: number;
  expires_at: number | null;
  redemptions: RelayInviteRedemption[];
}

export interface RelayInviteMe {
  pubkey: string;
  admitted: boolean;
  can_mint: boolean;
  is_admin: boolean;
  codes_left: number | null;
  admits_left: number | null;
  admits_used: number;
  codes: RelayInviteCode[];
}

async function nip98Header(url: string, method: string): Promise<string> {
  const event = await nostrActions.signEventTemplate({
    kind: KIND_HTTP_AUTH,
    content: '',
    tags: [['u', url], ['method', method]],
    created_at: Math.floor(Date.now() / 1000),
  });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

async function call<T>(relay: string, path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<T> {
  const url = relayInviteApiUrl(relay, path);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: await nip98Header(url, method),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const detail = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new CodedError('relay-invite-failed', detail ?? `HTTP ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// One answer per relay and account for the visit. Each call is a NIP-98
// signature, and with an extension or a bunker a signature can be a prompt:
// the settings nav and the invite panel both ask, and must not ask twice.
const statusCache = new Map<string, Promise<RelayInviteMe | null>>();

/**
 * Where this account stands on `relay`. Null when the relay has no invite
 * API (any relay but obelisk-relay): the settings entry simply stays hidden.
 * `fresh` skips the cache, after this account changed something.
 */
export function fetchInviteStatus(relay: string, pubkey: string, fresh = false): Promise<RelayInviteMe | null> {
  const key = `${relay}|${pubkey}`;
  const cached = statusCache.get(key);
  if (cached && !fresh) return cached;
  const pending = call<RelayInviteMe>(relay, '/me', 'GET').catch(() => null);
  statusCache.set(key, pending);
  return pending;
}

export function createInviteCode(relay: string, label?: string): Promise<RelayInviteCode> {
  return call<RelayInviteCode>(relay, '', 'POST', {
    ...(label ? { label } : {}),
    expires_in: RELAY_INVITE_DEFAULT_TTL_SECS,
  });
}

export function revokeInviteCode(relay: string, code: string): Promise<void> {
  return call<void>(relay, `/${encodeURIComponent(code)}`, 'DELETE');
}
