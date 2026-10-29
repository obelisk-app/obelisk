/**
 * The relay's invite minter API (obelisk-relay `/api/invites`, NIP-98
 * authenticated): whether this account may invite people on a relay, and the
 * codes it made there. Called straight from the browser; the relay's CORS is
 * open and the signature is the only credential, so no server of ours holds
 * anything. Each request is signed for its own URL (the `u` tag), so a
 * signature for one relay is worthless on another.
 */
import { KIND_HTTP_AUTH } from '@/constants/nostr/nip-kinds';
import {
  RELAY_INVITE_API_TIMEOUT_MS,
  RELAY_INVITE_DEFAULT_TTL_SECS,
  RELAY_INVITE_NO_API_STATUSES,
} from '@/constants/relay/relay-invite';
import { nostrActions } from '@/services/nostr-bridge';
import type { RelayInviteCode, RelayInviteCreateOptions, RelayInviteMe } from '@/types/relay/relay-invite';
import { CodedError } from '@/utils/errors/codes';
import { relayInviteApiUrl } from '@/utils/relay/relay-invite';
import { inviteMeFromJson } from '@/utils/relay/relay-invite-panel';
import { normalizeDeepLinkRelay } from '@/utils/relay/deep-link';

/** The NIP-98 `Authorization` value for one request: a kind 27235 naming the exact URL and method. */
async function nip98Header(url: string, method: string): Promise<string> {
  const event = await nostrActions.signEventTemplate({
    kind: KIND_HTTP_AUTH,
    content: '',
    tags: [['u', url], ['method', method]],
    created_at: Math.floor(Date.now() / 1000),
  });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

/** A relay that answered "no such API": not a failure, there is nothing to ask. */
class NoInviteApi extends Error {}

async function call(relay: string, path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<unknown> {
  const url = relayInviteApiUrl(relay, path);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: await nip98Header(url, method),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(RELAY_INVITE_API_TIMEOUT_MS) } : {}),
  });
  if (!res.ok) {
    if (RELAY_INVITE_NO_API_STATUSES.includes(res.status)) throw new NoInviteApi(`HTTP ${res.status}`);
    const detail = await res.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    throw new CodedError('relay-invite-failed', detail ?? `HTTP ${res.status}`);
  }
  return res.status === 204 ? undefined : res.json();
}

// Answers per relay and account. Each request is a NIP-98 signature, and
// with an extension or a bunker a signature can be a prompt, so the settings
// nav, the relay menu and the invite panel share one answer. Only answers
// are kept (a status, or "this relay has no invite API"); a failed request
// (network, timeout, 5xx) is forgotten at once, so the next look asks again.
const settled = new Map<string, RelayInviteMe | null>();
const inFlight = new Map<string, Promise<RelayInviteMe | null>>();
const listeners = new Set<() => void>();

function statusKey(relay: string, pubkey: string): string {
  return `${normalizeDeepLinkRelay(relay)}|${pubkey}`;
}

/**
 * Where this account stands on `relay`. Null when the relay has no invite
 * API (any relay but obelisk-relay). Rejects when the relay could not be
 * asked; that is not remembered. `fresh` skips the remembered answer, after
 * this account changed something.
 */
export function fetchInviteStatus(relay: string, pubkey: string, fresh = false): Promise<RelayInviteMe | null> {
  const key = statusKey(relay, pubkey);
  if (!fresh && settled.has(key)) return Promise.resolve(settled.get(key) ?? null);
  const pending = inFlight.get(key);
  if (pending && !fresh) return pending;
  const request = call(relay, '/me', 'GET')
    .then((raw) => inviteMeFromJson(raw), (err: unknown) => {
      if (err instanceof NoInviteApi) return null;
      throw err;
    })
    .then((me) => {
      settled.set(key, me);
      for (const l of listeners) l();
      return me;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

/**
 * The remembered answer for `relay`, without asking: the status, null for a
 * relay with no invite API, undefined when it was never answered.
 */
export function peekInviteStatus(relay: string, pubkey: string): RelayInviteMe | null | undefined {
  const key = statusKey(relay, pubkey);
  return settled.has(key) ? settled.get(key) ?? null : undefined;
}

/** Called whenever a new answer is remembered. Returns an unsubscribe. */
export function subscribeInviteStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Make a link. The relay clamps the uses and lifetime to what this account is allowed. */
export async function createInviteCode(relay: string, options: RelayInviteCreateOptions = {}): Promise<RelayInviteCode> {
  return (await call(relay, '', 'POST', {
    ...(options.label ? { label: options.label } : {}),
    ...(options.maxUses ? { max_uses: options.maxUses } : {}),
    expires_in: options.expiresInSecs ?? RELAY_INVITE_DEFAULT_TTL_SECS,
  })) as RelayInviteCode;
}

/** Turn a link off. People who already came in on it stay. */
export async function revokeInviteCode(relay: string, code: string): Promise<void> {
  await call(relay, `/${encodeURIComponent(code)}`, 'DELETE');
}
