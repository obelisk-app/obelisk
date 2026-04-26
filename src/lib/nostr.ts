import NDK, {
  NDKEvent,
  NDKUser,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelayAuthPolicies,
  NDKSigner,
} from '@nostr-dev-kit/ndk';
import { nip19, generateSecretKey, getPublicKey, nip04 } from 'nostr-tools';
import { hexToBytes, bytesToHex } from 'nostr-tools/utils';
import { BunkerSigner, parseBunkerInput, createNostrConnectURI } from 'nostr-tools/nip46';
import { EventEmitter } from 'events';
import { withTimeout } from './promise';
import { KIND_RELAY_LIST } from './nip-kinds';

// Popular relays (high availability)
const POPULAR_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://relay.nsec.app',
  'wss://theforest.nostr1.com',
  'wss://nostr.otxr.dev',
];

const CONNECT_RELAYS = [
  'wss://relay.nsec.app',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nostr.v0l.io',
  'wss://relay.snort.social',
];

/**
 * STATUS Logging system for mobile debugging
 */
export const logStatus = (stage: string, message: string, data?: any) => {
  const msg = `[AUTH_STATUS] [${stage}] ${message}`;
  console.log(msg, data || '');
};

// Global NDK instance
let ndkInstance: NDK | null = null;
let userRelaysAdded = false;

export function getNDK(): NDK {
  if (!ndkInstance) {
    ndkInstance = new NDK({
      explicitRelayUrls: [...POPULAR_RELAYS],
    });
    ndkInstance.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({
      ndk: ndkInstance,
    });
  }
  return ndkInstance;
}

export async function connectNDK(): Promise<NDK> {
  const ndk = getNDK();
  await ndk.connect();
  return ndk;
}

export function resetUserRelays(): void {
  userRelaysAdded = false;
}

async function addUserRelays(pubkey: string): Promise<void> {
  if (userRelaysAdded) return;
  const ndk = getNDK();

  try {
    const relayListEvents = await withTimeout(
      ndk.fetchEvents({ kinds: [KIND_RELAY_LIST], authors: [pubkey], limit: 1 }),
      5000
    );
    const relayEvent = Array.from(relayListEvents)[0];
    if (relayEvent) {
      const relayTags = relayEvent.tags.filter(t => t[0] === 'r');
      for (const tag of relayTags) {
        const url = tag[1];
        if (url && url.startsWith('wss://')) {
          try {
            ndk.addExplicitRelay(url);
          } catch { /* ignore */ }
        }
      }
    }
    userRelaysAdded = true;
  } catch { /* ignore */ }
}

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

function saveSignerPayload(payload: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SIGNER_PAYLOAD_KEY, payload);
  } catch { /* ignore */ }
}

function readSignerPayload(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(SIGNER_PAYLOAD_KEY);
  } catch {
    return null;
  }
}

export function clearSignerPayload(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SIGNER_PAYLOAD_KEY);
  } catch { /* ignore */ }
}

/**
 * NDK Signer wrapper for nostr-tools BunkerSigner
 */
class NDKBunkerSigner extends EventEmitter implements NDKSigner {
  public bunker: BunkerSigner;
  public _clientSecretKey: Uint8Array;
  public _userPubkey?: string;

  constructor(bunker: BunkerSigner, clientSecretKey: Uint8Array) {
    super();
    this.bunker = bunker;
    this._clientSecretKey = clientSecretKey;
  }

  get pubkey(): string {
    if (!this._userPubkey) throw new Error('Not ready');
    return this._userPubkey;
  }

  get userSync(): NDKUser {
    if (!this._userPubkey) throw new Error('Not ready');
    return new NDKUser({ pubkey: this._userPubkey });
  }

  async blockUntilReady(): Promise<NDKUser> {
    await this.bunker.connect();
    const pubkey = await this.bunker.getPublicKey();
    this._userPubkey = pubkey;
    return new NDKUser({ pubkey });
  }

  async user(): Promise<NDKUser> {
    const pubkey = await this.bunker.getPublicKey();
    this._userPubkey = pubkey;
    return new NDKUser({ pubkey });
  }

  async sign(event: any): Promise<string> {
    const rawEvent = typeof event.rawEvent === 'function' ? event.rawEvent() : event;
    const signed = await this.bunker.signEvent(rawEvent);
    return signed.sig;
  }

  async encrypt(recipient: NDKUser, value: string): Promise<string> {
    return this.bunker.nip04Encrypt(recipient.pubkey, value);
  }

  async decrypt(sender: NDKUser, value: string): Promise<string> {
    return this.bunker.nip04Decrypt(sender.pubkey, value);
  }

  toPayload(): string {
    return JSON.stringify({
      type: 'bunker',
      bunkerUrl: toBunkerURL((this.bunker as any).bp),
      localPrivkey: bytesToHex(this._clientSecretKey)
    });
  }
}

function toBunkerURL(bp: any): string {
  if (!bp) return '';
  const params = new URLSearchParams();
  (bp.relays || []).forEach((r: string) => params.append('relay', r));
  if (bp.secret) params.set('secret', bp.secret);
  return `bunker://${bp.pubkey}?${params.toString()}`;
}

export async function restoreRemoteSigner(): Promise<boolean> {
  const payloadStr = readSignerPayload();
  if (!payloadStr) return false;

  try {
    const payload = JSON.parse(payloadStr);

    if (payload.type === 'nsec') {
      if (!payload.privkey) return false;
      const ndk = getNDK();
      const signer = new NDKPrivateKeySigner(payload.privkey);
      ndk.signer = signer;
      await signer.user();
      return true;
    }

    if (payload.type !== 'bunker') return false;

    const bp = await parseBunkerInput(payload.bunkerUrl);
    if (!bp) return false;

    const localSecret = hexToBytes(payload.localPrivkey);
    const bunker = BunkerSigner.fromBunker(localSecret, bp);
    const signer = new NDKBunkerSigner(bunker, localSecret);
    
    const ndk = getNDK();
    ndk.signer = signer;
    
    await withTimeout(signer.blockUntilReady(), 30000);
    return true;
  } catch (err) {
    console.warn('[nostr] restoreRemoteSigner failed:', err);
    clearSignerPayload();
    return false;
  }
}

export async function loginWithExtension(): Promise<NDKUser | null> {
  if (typeof window === 'undefined') {
    throw new Error('NIP-07 login only works in the browser');
  }

  const ndk = getNDK();
  const signer = new NDKNip07Signer(4000, ndk);
  ndk.signer = signer;

  try {
    const user = await signer.blockUntilReady();
    user.fetchProfile().catch(() => {});
    return user;
  } catch (error) {
    if (!window.nostr) {
      throw new Error('No NIP-07 extension found. Install Alby or another Nostr extension.');
    }
    throw error;
  }
}

export async function loginWithNsec(nsec: string): Promise<NDKUser | null> {
  let privateKey: string;
  try {
    if (nsec.startsWith('nsec')) {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
      privateKey = bytesToHex(decoded.data as Uint8Array);
    } else {
      privateKey = nsec;
    }
  } catch {
    throw new Error('Invalid nsec format');
  }
  
  const ndk = getNDK();
  const signer = new NDKPrivateKeySigner(privateKey);
  ndk.signer = signer;

  const user = await signer.user();
  await user.fetchProfile();

  saveSignerPayload(JSON.stringify({ type: 'nsec', privkey: privateKey }));

  return user;
}

export async function createNewAccount(): Promise<{ user: NDKUser; nsec: string }> {
  const secretKey = generateSecretKey();
  const nsec = nip19.nsecEncode(secretKey);
  const privateKeyHex = bytesToHex(secretKey);

  const ndk = getNDK();
  const signer = new NDKPrivateKeySigner(privateKeyHex);
  ndk.signer = signer;

  const user = await signer.user();
  saveSignerPayload(JSON.stringify({ type: 'nsec', privkey: privateKeyHex }));
  return { user, nsec };
}

export interface BunkerLoginOptions {
  onAuthUrl?: (url: string) => void;
}

export async function loginWithBunker(bunkerUrl: string, options?: BunkerLoginOptions): Promise<NDKUser | null> {
  const L = (...args: unknown[]) => logStatus('Bunker', args[0] as string, args.slice(1));
  L('Starting Bunker login:', bunkerUrl);

  const bp = await parseBunkerInput(bunkerUrl);
  if (!bp) throw new Error('Invalid bunker URL');

  const localSecret = getLocalSecretKey();
  const bunker = BunkerSigner.fromBunker(localSecret, bp, {
    onauth(url) {
      L('authUrl received:', url);
      if (options?.onAuthUrl) options.onAuthUrl(url);
      else window.open(url, '_blank', 'width=600,height=700');
    }
  });

  const signer = new NDKBunkerSigner(bunker, localSecret);
  const user = await withTimeout(signer.blockUntilReady(), 60000);
  
  const ndk = getNDK();
  ndk.signer = signer;
  saveSignerPayload(signer.toPayload());

  await user.fetchProfile().catch(() => {});
  return user;
}

export interface NostrConnectSession {
  uri: string;
  waitForConnection: () => Promise<NDKUser | null>;
  cancel: () => void;
}

export async function createNostrConnectSession(relay?: string, options?: BunkerLoginOptions): Promise<NostrConnectSession> {
  const L = (...args: unknown[]) => logStatus('NostrConnect', args[0] as string, args.slice(1));
  const connectRelay = relay || CONNECT_RELAYS[0];
  
  const localSecret = getLocalSecretKey();
  const localPubkey = getPublicKey(localSecret);

  const uri = createNostrConnectURI({
    clientPubkey: localPubkey,
    relays: [connectRelay, ...CONNECT_RELAYS],
    secret: Math.random().toString(36).substring(2, 15),
    name: 'Obelisk',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar'
  });

  L('Generated URI:', uri);

  let cancelled = false;
  const waitForConnection = async (): Promise<NDKUser | null> => {
    L('Waiting for connection...');
    try {
      const bunker = await BunkerSigner.fromURI(localSecret, uri, {
        onauth(url) {
          L('authUrl received:', url);
          if (options?.onAuthUrl) options.onAuthUrl(url);
        }
      }, 60000);

      if (cancelled) {
        bunker.close();
        return null;
      }

      const signer = new NDKBunkerSigner(bunker, localSecret);
      const ndk = getNDK();
      ndk.signer = signer;
      saveSignerPayload(signer.toPayload());

      const user = await signer.user();
      await user.fetchProfile().catch(() => {});
      return user;
    } catch (e) {
      L('Connection error:', e);
      throw e;
    }
  };

  return { 
    uri, 
    waitForConnection, 
    cancel: () => { cancelled = true; } 
  };
}

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

export function parseProfile(user: NDKUser): NostrProfile {
  const profile = user.profile || {};
  return {
    pubkey: user.pubkey,
    npub: user.npub,
    name: profile.name,
    displayName: (profile.displayName || profile.display_name) as string | undefined,
    about: profile.about as string | undefined,
    picture: (profile.image || profile.picture) as string | undefined,
    banner: profile.banner,
    nip05: profile.nip05,
    lud16: profile.lud16,
    website: profile.website,
  };
}

export async function fetchFollowers(pubkey: string): Promise<string[]> {
  const ndk = getNDK();
  await addUserRelays(pubkey);

  try {
    const events = await withTimeout(
      ndk.fetchEvents({ kinds: [3], '#p': [pubkey] }),
      10000
    );
    const followers = new Set<string>();
    events.forEach((event) => followers.add(event.pubkey));
    return Array.from(followers);
  } catch {
    console.warn('fetchFollowers timed out');
    return [];
  }
}

export async function fetchFollowing(pubkey: string): Promise<string[]> {
  const ndk = getNDK();
  await addUserRelays(pubkey);

  try {
    const user = ndk.getUser({ pubkey });
    const followSet = await withTimeout(user.follows(), 10000);
    return Array.from(followSet).map((u) => u.pubkey);
  } catch {
    console.warn('fetchFollowing timed out');
    return [];
  }
}

export async function fetchUserNotes(pubkey: string, limit = 20): Promise<NDKEvent[]> {
  const ndk = getNDK();
  await addUserRelays(pubkey);

  try {
    const events = await withTimeout(
      ndk.fetchEvents({ kinds: [1], authors: [pubkey], limit }),
      10000
    );
    return Array.from(events).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  } catch {
    console.warn('fetchUserNotes timed out');
    return [];
  }
}

export async function fetchCurrentKind0(pubkey: string): Promise<Record<string, unknown>> {
  const ndk = getNDK();
  try {
    const event = await withTimeout(
      ndk.fetchEvent({ kinds: [0], authors: [pubkey] }),
      10000
    );
    if (event?.content) {
      return JSON.parse(event.content);
    }
  } catch {
    console.warn('fetchCurrentKind0 failed or timed out');
  }
  return {};
}

export async function publishProfile(fields: {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  nip05?: string;
}): Promise<NDKEvent> {
  const ndk = getNDK();
  if (!ndk.signer) throw new Error('No signer available');

  const user = await ndk.signer.user();
  const existing = await fetchCurrentKind0(user.pubkey);

  const merged = { ...existing };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }

  const event = new NDKEvent(ndk);
  event.kind = 0;
  event.content = JSON.stringify(merged);
  await event.publish();

  user.profile = merged as Record<string, string>;
  return event;
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

/**
 * Accept a hex pubkey, an `npub1…` bech32, or an `nprofile1…` bech32 and
 * return the 64-char hex pubkey. Returns `null` if the input isn't a
 * recognized Nostr identity encoding.
 */
export function npubToHex(input: string): string | null {
  const trimmed = input.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch { /* not a valid nip19 string */ }
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
