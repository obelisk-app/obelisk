/**
 * Obelisk's Nostr pool hub. Built on `@nostr-wot/*` SDK primitives.
 *
 * Key exports:
 *   - `getExplicitRelays()` — imperative relay read for non-React callers
 *   - `restoreRemoteSigner` — restores signer from localStorage payload (returns signer, does NOT set it)
 *   - Profile utilities: `publishProfile`, `fetchFollowers`, `fetchUserNotes`, `fetchCurrentKind0`
 *
 * Signer lifecycle is managed by `@nostr-wot/ui`'s `NostrSessionProvider`.
 * React components should use `useSigner()` from `@nostr-wot/data/react`.
 */

import {
  Nip46Signer,
  PrivateKeySigner,
  type NostrSigner,
} from '@nostr-wot/signers';
import {
  getPool,
  setDefaultRelays,
} from '@nostr-wot/data';
import {
  finalizeEvent,
  getEventHash,
  getPublicKey,
  nip19,
  type Event as NostrEvent,
  type EventTemplate,
} from 'nostr-tools';
import { hexToBytes, bytesToHex } from 'nostr-tools/utils';
import { encryptPayload, decryptPayload, clearWrapKey } from './signer-payload-crypto';
import { getNostrPool } from './nostr-pool';
import {
  fetchKind0,
  fetchFollowers as readFollowers,
  fetchFollowing as readFollowing,
  fetchUserNotes as readUserNotes,
  fetchRelayList,
} from './nostr-read';

const POPULAR_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://relay.nsec.app',
];

setDefaultRelays(POPULAR_RELAYS);

export const logStatus = (stage: string, message: string, data?: any) => {
  const msg = `[AUTH_STATUS] [${stage}] ${message}`;
  console.log(msg, data || '');
};

// ─── Relay pool ────────────────────────────────────────────────────

const explicitRelays = new Set<string>(POPULAR_RELAYS);
let userRelaysAdded = false;

/** Returns all relay URLs currently tracked by the session (popular defaults + user's kind-10002 relays). */
export function getExplicitRelays(): string[] {
  return Array.from(explicitRelays);
}


export function resetUserRelays(): void {
  userRelaysAdded = false;
}

async function addUserRelays(pubkey: string): Promise<void> {
  if (userRelaysAdded) return;
  try {
    const { read, write } = await fetchRelayList(pubkey, { timeoutMs: 5000 });
    for (const url of [...read, ...write]) {
      if (url.startsWith('wss://')) explicitRelays.add(url);
    }
    userRelaysAdded = true;
  } catch {
    /* ignore */
  }
}

// ─── Signer payload persistence ────────────────────────────────────

export type LoginMethod = 'extension' | 'nsec' | 'bunker';

const SIGNER_PAYLOAD_KEY = 'obelisk-signer-payload';

async function saveSignerPayload(payload: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    const blob = await encryptPayload(payload);
    localStorage.setItem(SIGNER_PAYLOAD_KEY, blob);
  } catch (err) {
    console.warn('[nostr] saveSignerPayload encryption failed:', err);
  }
}

async function readSignerPayload(): Promise<string | null> {
  if (typeof localStorage === 'undefined') return null;
  let blob: string | null;
  try {
    blob = localStorage.getItem(SIGNER_PAYLOAD_KEY);
  } catch {
    return null;
  }
  if (!blob) return null;

  if (blob.startsWith('{')) {
    try {
      JSON.parse(blob);
      await saveSignerPayload(blob);
      return blob;
    } catch {
      try {
        localStorage.removeItem(SIGNER_PAYLOAD_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  try {
    return await decryptPayload(blob);
  } catch {
    try {
      localStorage.removeItem(SIGNER_PAYLOAD_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function clearSignerPayload(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(SIGNER_PAYLOAD_KEY);
    } catch {
      /* ignore */
    }
  }
  await clearWrapKey().catch(() => {
    /* best-effort */
  });
}

// ─── Profile + user shape ──────────────────────────────────────────

export interface NostrProfile {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
}

/**
 * Flat user shape. `profile` is populated lazily.
 * Most call sites read `.pubkey` only, which is always present.
 */
export interface NostrUser {
  pubkey: string;
  npub: string;
  profile?: Record<string, unknown>;
}

function makeUser(pubkey: string): NostrUser {
  return { pubkey, npub: nip19.npubEncode(pubkey) };
}

async function fetchAndAttachProfile(user: NostrUser): Promise<void> {
  try {
    const profile = await fetchKind0(user.pubkey, { timeoutMs: 8000 });
    user.profile = profile;
  } catch {
    /* best-effort */
  }
}

export function parseProfile(user: NostrUser | { pubkey: string; profile?: Record<string, unknown> }): NostrProfile {
  const profile = (user.profile ?? {}) as Record<string, unknown>;
  return {
    pubkey: user.pubkey,
    npub: nip19.npubEncode(user.pubkey),
    name: profile.name as string | undefined,
    displayName: ((profile.displayName ?? profile.display_name) as string | undefined),
    about: profile.about as string | undefined,
    picture: ((profile.image ?? profile.picture) as string | undefined),
    banner: profile.banner as string | undefined,
    nip05: profile.nip05 as string | undefined,
    lud16: profile.lud16 as string | undefined,
    website: profile.website as string | undefined,
  };
}

// ─── Signer restore ────────────────────────────────────────────────

/**
 * Read the persisted signer payload from localStorage and reconstruct the
 * signer object. Returns the signer on success, `null` on failure/absence.
 *
 * The caller is responsible for activating the signer via the SDK's
 * `login()` hook (from `@nostr-wot/data/react`). This function intentionally
 * signer lifecycle is owned by
 * `NostrSessionProvider`.
 */
export async function restoreRemoteSigner(): Promise<NostrSigner | null> {
  const payloadStr = await readSignerPayload();
  if (!payloadStr) return null;

  try {
    const payload = JSON.parse(payloadStr) as
      | { type: 'nsec'; privkey: string }
      | { type: 'bunker'; bunkerUrl: string; localPrivkey: string };

    if (payload.type === 'nsec') {
      if (!payload.privkey) return null;
      return new PrivateKeySigner(hexToBytes(payload.privkey));
    }

    if (payload.type !== 'bunker') return null;
    if (!payload.bunkerUrl) return null;

    const localSecret = hexToBytes(payload.localPrivkey);
    return await Nip46Signer.fromBunkerUri(payload.bunkerUrl, {
      clientSecretKey: localSecret,
      pool: getNostrPool() as never,
    });
  } catch (err) {
    console.warn('[nostr] restoreRemoteSigner failed:', err);
    await clearSignerPayload();
    return null;
  }
}

// ─── Read paths (forward to nostr-read) ────────────────────────────

export async function fetchFollowers(pubkey: string): Promise<string[]> {
  await addUserRelays(pubkey);
  return readFollowers(pubkey, { timeoutMs: 10000 });
}

export async function fetchFollowing(pubkey: string): Promise<string[]> {
  await addUserRelays(pubkey);
  return readFollowing(pubkey, { timeoutMs: 10000 });
}

export async function fetchUserNotes(pubkey: string, limit = 20): Promise<NostrEvent[]> {
  await addUserRelays(pubkey);
  return readUserNotes(pubkey, limit, { timeoutMs: 10000 });
}

export async function fetchCurrentKind0(pubkey: string): Promise<Record<string, unknown>> {
  return fetchKind0(pubkey, { timeoutMs: 10000 });
}

// ─── Write paths ───────────────────────────────────────────────────

/**
 * Build, sign, and publish a kind-0 profile event. Merges the new
 * fields into the existing kind-0 to preserve any keys the UI doesn't
 * surface.
 */
export async function publishProfile(
  signer: NostrSigner,
  fields: {
    name?: string;
    display_name?: string;
    picture?: string;
    about?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
  },
): Promise<NostrEvent> {
  const pubkey = await signer.getPublicKey();
  const existing = await fetchCurrentKind0(pubkey);

  const merged = { ...existing };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }

  const template: EventTemplate = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(merged),
  };
  const event = await signer.signEvent(template);

  const pool = getPool();
  await Promise.allSettled(pool.publish(Array.from(explicitRelays), event));

  return event;
}

// ─── Utility helpers ───────────────────────────────────────────────

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function npubToHex(input: string): string | null {
  const trimmed = input.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    /* not a valid nip19 string */
  }
  return null;
}

export function formatPubkey(pubkey: string): string {
  const npub = pubkeyToNpub(pubkey);
  return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString();
}

// Suppress lints for now-unused but exported names.
void getEventHash;
void finalizeEvent;
void getPublicKey;
