/**
 * Obelisk's Nostr signer + pool hub. Built on `@nostr-wot/*` SDK primitives.
 *
 * Key exports:
 *   - `getSigner()` / `getExplicitRelays()` — imperative reads for non-React callers
 *   - `setNDKSigner` / `onSignerChange` — signer lifecycle (used by layout bridge)
 *   - Login flows: `loginWithExtension`, `loginWithPrivkey`, `restoreRemoteSigner`
 */

import {
  Nip07Signer,
  Nip46Signer,
  PrivateKeySigner,
  isNip07Available,
  type NostrSigner,
} from '@nostr-wot/signers';
import {
  getPool,
  setDefaultRelays,
} from '@nostr-wot/data';
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  nip19,
  type Event as NostrEvent,
  type EventTemplate,
} from 'nostr-tools';
import { hexToBytes, bytesToHex } from 'nostr-tools/utils';
import { withTimeout } from './promise';
import { encryptPayload, decryptPayload, clearWrapKey } from './signer-payload-crypto';
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

const CONNECT_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nostr.v0l.io',
  'wss://relay.snort.social',
];

setDefaultRelays(POPULAR_RELAYS);

export const logStatus = (stage: string, message: string, data?: any) => {
  const msg = `[AUTH_STATUS] [${stage}] ${message}`;
  console.log(msg, data || '');
};

// ─── Active signer + pool shim ─────────────────────────────────────

let currentSigner: NostrSigner | null = null;
const signerSubscribers = new Set<(signer: NostrSigner | null) => void>();
const explicitRelays = new Set<string>(POPULAR_RELAYS);
let userRelaysAdded = false;


export function onSignerChange(cb: (signer: NostrSigner | null) => void): () => void {
  signerSubscribers.add(cb);
  return () => {
    signerSubscribers.delete(cb);
  };
}

export function setNDKSigner(signer: NostrSigner | null | undefined): void {
  currentSigner = signer ?? null;
  signerSubscribers.forEach((cb) => cb(currentSigner));
}

/** Imperative read of the active signer. For non-React callers. React components should use `useSigner()` from `@nostr-wot/data/react`. */
export function getSigner(): NostrSigner | null {
  return currentSigner;
}

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
const SIGNER_LOCAL_KEY = 'obelisk-local-signer-key';

function getLocalSecretKey(): Uint8Array {
  if (typeof localStorage === 'undefined') return generateSecretKey();
  try {
    const saved = localStorage.getItem(SIGNER_LOCAL_KEY);
    if (saved) return hexToBytes(saved);
  } catch (err) {
    console.warn('Failed to read local signer key:', err);
  }
  const key = generateSecretKey();
  try {
    localStorage.setItem(SIGNER_LOCAL_KEY, bytesToHex(key));
  } catch (err) {
    console.warn('Failed to save local signer key:', err);
  }
  return key;
}

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
 * Flat user shape — replaces NDKUser. `profile` is populated lazily.
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

// ─── Login flows ───────────────────────────────────────────────────

export async function loginWithExtension(): Promise<NostrUser | null> {
  if (typeof window === 'undefined') {
    throw new Error('NIP-07 login only works in the browser');
  }
  if (!isNip07Available()) {
    throw new Error('No NIP-07 extension found. Install Alby or another Nostr extension.');
  }
  const signer = new Nip07Signer();
  const pubkey = await signer.getPublicKey();
  setNDKSigner(signer);
  const user = makeUser(pubkey);
  void fetchAndAttachProfile(user);
  return user;
}

export async function loginWithNsec(nsec: string): Promise<NostrUser | null> {
  let secretKey: Uint8Array;
  try {
    if (nsec.startsWith('nsec')) {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
      secretKey = decoded.data;
    } else if (/^[0-9a-f]{64}$/i.test(nsec)) {
      secretKey = hexToBytes(nsec);
    } else {
      throw new Error('Invalid nsec format');
    }
  } catch {
    throw new Error('Invalid nsec format');
  }

  const signer = new PrivateKeySigner(secretKey);
  const pubkey = await signer.getPublicKey();
  setNDKSigner(signer);

  await saveSignerPayload(JSON.stringify({ type: 'nsec', privkey: bytesToHex(secretKey) }));

  const user = makeUser(pubkey);
  await fetchAndAttachProfile(user);
  return user;
}

export async function createNewAccount(): Promise<{ user: NostrUser; nsec: string }> {
  const secretKey = generateSecretKey();
  const nsec = nip19.nsecEncode(secretKey);
  const signer = new PrivateKeySigner(secretKey);
  const pubkey = await signer.getPublicKey();
  setNDKSigner(signer);
  await saveSignerPayload(JSON.stringify({ type: 'nsec', privkey: bytesToHex(secretKey) }));
  return { user: makeUser(pubkey), nsec };
}

export interface BunkerLoginOptions {
  onAuthUrl?: (url: string) => void;
}

export async function loginWithBunker(
  bunkerUrl: string,
  options?: BunkerLoginOptions,
): Promise<NostrUser | null> {
  const L = (...args: unknown[]) => logStatus('Bunker', args[0] as string, args.slice(1));
  L('Starting Bunker login:', bunkerUrl);

  const localSecret = getLocalSecretKey();
  const signer = await Nip46Signer.fromBunkerUri(bunkerUrl, {
    clientSecretKey: localSecret,
    onAuthChallenge: options?.onAuthUrl
      ? (url) => options.onAuthUrl!(url)
      : (url) => {
          L('authUrl received:', url);
          if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'width=600,height=700');
          }
        },
  });
  const pubkey = await withTimeout(signer.getPublicKey(), 60000);
  setNDKSigner(signer);

  await saveSignerPayload(
    JSON.stringify({
      type: 'bunker',
      bunkerUrl,
      localPrivkey: bytesToHex(localSecret),
    }),
  );

  const user = makeUser(pubkey);
  void fetchAndAttachProfile(user);
  return user;
}

export interface NostrConnectSession {
  uri: string;
  waitForConnection: () => Promise<NostrUser | null>;
  cancel: () => void;
}

export async function createNostrConnectSession(
  relay?: string,
  options?: BunkerLoginOptions,
): Promise<NostrConnectSession> {
  const L = (...args: unknown[]) => logStatus('NostrConnect', args[0] as string, args.slice(1));
  const connectRelay = relay || CONNECT_RELAYS[0]!;

  const localSecret = getLocalSecretKey();

  const handle = Nip46Signer.startNostrConnect({
    relays: [connectRelay, ...CONNECT_RELAYS],
    clientSecretKey: localSecret,
    metadata: {
      name: 'Obelisk',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar',
    },
    pairTimeoutMs: 60000,
    onAuthChallenge: (url) => {
      L('authUrl received:', url);
      options?.onAuthUrl?.(url);
    },
  });

  L('Generated URI:', handle.uri);

  let cancelled = false;

  const waitForConnection = async (): Promise<NostrUser | null> => {
    L('Waiting for connection...');
    try {
      const signer = await handle.ready;
      if (cancelled) {
        await signer.close?.();
        return null;
      }
      const pubkey = await signer.getPublicKey();
      setNDKSigner(signer);
      await saveSignerPayload(
        JSON.stringify({
          type: 'bunker',
          bunkerUrl: signer.bunkerPubkey
            ? `bunker://${signer.bunkerPubkey}?${signer.relays.map((r) => `relay=${encodeURIComponent(r)}`).join('&')}`
            : '',
          localPrivkey: bytesToHex(localSecret),
        }),
      );
      const user = makeUser(pubkey);
      void fetchAndAttachProfile(user);
      return user;
    } catch (e) {
      L('Connection error:', e);
      throw e;
    }
  };

  return {
    uri: handle.uri,
    waitForConnection,
    cancel: () => {
      cancelled = true;
      handle.cancel();
    },
  };
}

export async function restoreRemoteSigner(): Promise<boolean> {
  const payloadStr = await readSignerPayload();
  if (!payloadStr) return false;

  try {
    const payload = JSON.parse(payloadStr) as
      | { type: 'nsec'; privkey: string }
      | { type: 'bunker'; bunkerUrl: string; localPrivkey: string };

    if (payload.type === 'nsec') {
      if (!payload.privkey) return false;
      const signer = new PrivateKeySigner(hexToBytes(payload.privkey));
      setNDKSigner(signer);
      return true;
    }

    if (payload.type !== 'bunker') return false;
    if (!payload.bunkerUrl) return false;

    const localSecret = hexToBytes(payload.localPrivkey);
    const signer = await Nip46Signer.fromBunkerUri(payload.bunkerUrl, {
      clientSecretKey: localSecret,
    });
    setNDKSigner(signer);
    return true;
  } catch (err) {
    console.warn('[nostr] restoreRemoteSigner failed:', err);
    await clearSignerPayload();
    return false;
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
export async function publishProfile(fields: {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  nip05?: string;
}): Promise<NostrEvent> {
  if (!currentSigner) throw new Error('No signer available');
  const pubkey = await currentSigner.getPublicKey();
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
  const event = await currentSigner.signEvent(template);

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
