import NDK, {
  NDKEvent,
  NDKUser,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelayAuthPolicies,
} from '@nostr-dev-kit/ndk';
import { nip19, generateSecretKey, getPublicKey } from 'nostr-tools';

// Popular relays (high availability)
const POPULAR_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://relay.nsec.app',
  'wss://theforest.nostr1.com',
  'wss://nostr.otxr.dev',
];

/**
 * NIP-17 inbox relays — used as a fallback when a user has no kind 10050
 * advertised. Several of these require NIP-42 AUTH to read, which is why
 * `relayAuthDefaultPolicy` must be set below before adding them.
 */
const NIP17_INBOX_FALLBACK_RELAYS = [
  'wss://auth.nostr1.com',
  'wss://relay.0xchat.com',
  'wss://inbox.nostr.wine',
];

// Global NDK instance
let ndkInstance: NDK | null = null;
let userRelaysAdded = false;

export function getNDK(): NDK {
  if (!ndkInstance) {
    ndkInstance = new NDK({
      explicitRelayUrls: [...POPULAR_RELAYS],
    });
    // NIP-42: sign AUTH challenges whenever a relay demands them. Required
    // for NIP-17 gift-wrap inbox relays (auth.nostr1.com, 0xchat, etc.),
    // which reject DM reads otherwise. Uses whichever signer was set by
    // the login flow — works identically for NIP-07, nsec, and NIP-46.
    ndkInstance.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({
      ndk: ndkInstance,
    });
  }
  return ndkInstance;
}

/**
 * Add NIP-17 inbox relays so gift-wrapped DMs addressed to the user can
 * be fetched. Looks up the user's kind 10050 list first; falls back to a
 * curated AUTH-required relay set if none is advertised. NDK's AUTH policy
 * (set in `getNDK`) handles the NIP-42 handshake transparently.
 */
export async function addDMInboxRelays(pubkey: string): Promise<void> {
  const ndk = getNDK();
  const added = new Set<string>();

  try {
    const events = await withTimeout(
      ndk.fetchEvents({ kinds: [10050], authors: [pubkey], limit: 1 }),
      5000,
    );
    const ev = Array.from(events)[0];
    if (ev) {
      for (const tag of ev.tags) {
        // NIP-17 uses either 'relay' or 'r' tags in the wild; accept both.
        if ((tag[0] === 'relay' || tag[0] === 'r') && typeof tag[1] === 'string' && tag[1].startsWith('wss://')) {
          try {
            ndk.addExplicitRelay(tag[1]);
            added.add(tag[1]);
          } catch {
            /* already added */
          }
        }
      }
    }
  } catch (err) {
    console.warn('[dm] kind-10050 lookup failed:', err);
  }

  if (added.size === 0) {
    for (const url of NIP17_INBOX_FALLBACK_RELAYS) {
      try {
        ndk.addExplicitRelay(url);
        added.add(url);
      } catch {
        /* ignore */
      }
    }
  }

  console.log('[dm] inbox relays added', Array.from(added));
  // New explicit relays need an explicit connect cycle; NDK's pool will
  // negotiate NIP-42 AUTH using the policy set in getNDK().
  try {
    await ndk.connect();
  } catch (err) {
    console.warn('[dm] ndk.connect after inbox-relay add failed:', err);
  }
}

export async function connectNDK(): Promise<NDK> {
  const ndk = getNDK();
  await ndk.connect();
  return ndk;
}

export function resetUserRelays(): void {
  userRelaysAdded = false;
}

// Fetch user's preferred relays (NIP-65 kind 10002) and add them to NDK
async function addUserRelays(pubkey: string): Promise<void> {
  if (userRelaysAdded) return;
  const ndk = getNDK();

  try {
    const relayListEvents = await withTimeout(
      ndk.fetchEvents({ kinds: [10002], authors: [pubkey], limit: 1 }),
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
          } catch {
            // relay already added or invalid
          }
        }
      }
    }
    userRelaysAdded = true;
  } catch {
    // timeout or error — continue with default relays
  }
}

// Helper: race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// Login methods
export type LoginMethod = 'extension' | 'nsec' | 'bunker';

// ─── Signer persistence (bunker / NostrConnect only) ─────────────────────────
// NDK's built-in signer serialization. We persist the payload on login so
// bunker sessions survive page reloads — without this, the signer dies on
// refresh and DMs/NIP-42 AUTH stop working until the user re-scans the QR.
// nsec is intentionally NOT persisted (the key would end up in localStorage);
// NIP-07 needs no persistence (the extension keeps the key).
const SIGNER_PAYLOAD_KEY = 'obelisk-signer-payload';

function saveSignerPayload(payload: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SIGNER_PAYLOAD_KEY, payload);
  } catch {
    /* quota / disabled storage */
  }
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
  } catch {
    /* ignore */
  }
}

/**
 * Rebuild the remote signer (bunker / NostrConnect) from the payload saved
 * at login time. Returns true if a signer was restored. Safe to call with
 * no saved payload — returns false without side effects.
 */
export async function restoreRemoteSigner(): Promise<boolean> {
  const payload = readSignerPayload();
  if (!payload) return false;

  const ndk = getNDK();
  try {
    const { ndkSignerFromPayload } = await import('@nostr-dev-kit/ndk');
    const signer = await ndkSignerFromPayload(payload, ndk);
    if (!signer) return false;
    ndk.signer = signer;
    // Block until the bunker handshake is ready so DM fetches can decrypt
    // immediately. If the bunker is offline this will throw after its own
    // timeout; caller decides whether to log out or wait.
    if (typeof (signer as unknown as { blockUntilReady?: () => Promise<unknown> }).blockUntilReady === 'function') {
      await (signer as unknown as { blockUntilReady: () => Promise<unknown> }).blockUntilReady();
    }
    return true;
  } catch (err) {
    console.warn('[nostr] restoreRemoteSigner failed:', err);
    // Wipe broken payload so we don't keep retrying forever.
    clearSignerPayload();
    return false;
  }
}

export async function loginWithExtension(): Promise<NDKUser | null> {
  if (typeof window === 'undefined') {
    throw new Error('NIP-07 login only works in the browser');
  }

  const ndk = getNDK();

  // Pass NDK to the signer so the returned user is bound to the same instance.
  const signer = new NDKNip07Signer(4000, ndk);
  ndk.signer = signer;

  try {
    // Explicitly request access and wait for the extension to be ready.
    const user = await signer.blockUntilReady();

    // Fetch profile in background — never block login
    user.fetchProfile().catch(() => {
      console.warn('Profile fetch failed, continuing with pubkey only');
    });

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
      // Convert Uint8Array to hex string
      const bytes = decoded.data as Uint8Array;
      privateKey = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      privateKey = nsec;
    }
  } catch {
    throw new Error('Invalid nsec format');
  }
  
  const ndk = getNDK();
  const signer = new NDKPrivateKeySigner(privateKey);
  ndk.signer = signer;

  try {
    saveSignerPayload(signer.toPayload());
  } catch (err) {
    console.warn('[nostr] failed to persist nsec signer payload:', err);
  }

  const user = await signer.user();
  await user.fetchProfile();

  return user;
}

export async function createNewAccount(): Promise<{ user: NDKUser; nsec: string }> {
  const secretKey = generateSecretKey();
  const nsec = nip19.nsecEncode(secretKey);
  const privateKeyHex = Array.from(secretKey).map(b => b.toString(16).padStart(2, '0')).join('');

  const ndk = getNDK();
  const signer = new NDKPrivateKeySigner(privateKeyHex);
  ndk.signer = signer;

  try {
    saveSignerPayload(signer.toPayload());
  } catch (err) {
    console.warn('[nostr] failed to persist nsec signer payload:', err);
  }

  const user = await signer.user();

  return { user, nsec };
}

export interface BunkerLoginOptions {
  /** Invoked when signer emits auth_url. Use this to render a tap-to-open
   *  link in the UI (mobile-safe) instead of relying on window.open. */
  onAuthUrl?: (url: string) => void;
}

export async function loginWithBunker(bunkerUrl: string, options?: BunkerLoginOptions): Promise<NDKUser | null> {
  const L = (...args: unknown[]) => console.log('[bunker]', ...args);
  const t0 = performance.now();
  L('=== loginWithBunker START ===');
  L('raw input:', bunkerUrl);

  const ndk = getNDK();
  const token = bunkerUrl.trim();
  L('trimmed token:', token);

  if (!token.startsWith('bunker://')) {
    L('ERROR: token does not start with bunker://');
    throw new Error('Invalid bunker URL — must start with bunker://');
  }

  let parsed: URL;
  try {
    parsed = new URL(token);
  } catch (e) {
    L('ERROR: URL() parse failed:', e);
    throw new Error('Invalid bunker URL — malformed');
  }
  const bunkerPubkey = parsed.hostname || parsed.pathname.replace(/^\/\//, '');
  const rawRelays = parsed.searchParams.getAll('relay');
  // Sanitize: drop malformed relays (e.g. "wss://was//relay.damus.io")
  const relayUrls = rawRelays.filter((r) => {
    try {
      const u = new URL(r);
      const ok = (u.protocol === 'wss:' || u.protocol === 'ws:') && !!u.host && !u.pathname.startsWith('//');
      if (!ok) L('WARN dropping malformed relay from bunker URL:', r);
      return ok;
    } catch {
      L('WARN dropping unparseable relay from bunker URL:', r);
      return false;
    }
  });
  if (rawRelays.length !== relayUrls.length) {
    L('WARN raw relays:', rawRelays, '-> sanitized:', relayUrls);
  }
  const secret = parsed.searchParams.get('secret');
  const userPubkeyParam = parsed.searchParams.get('pubkey');
  L('parsed bunker URL:', {
    bunkerPubkey,
    bunkerPubkeyLen: bunkerPubkey.length,
    relayUrls,
    hasSecret: !!secret,
    secretLen: secret?.length,
    userPubkeyParam,
  });
  if (!bunkerPubkey || relayUrls.length === 0) {
    L('ERROR: missing pubkey or relay');
    throw new Error('Invalid bunker URL — missing pubkey or relay');
  }

  L('kicking off ndk.connect() in background');
  ndk.connect().then(
    () => L('ndk.connect() resolved'),
    (e) => L('ndk.connect() rejected:', e),
  );

  L('dynamic import NDKNip46Signer...');
  const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk');
  L('NDKNip46Signer imported');

  const localSigner = NDKPrivateKeySigner.generate();
  L('localSigner generated, local pubkey =', localSigner.pubkey);

  // Rebuild bunker:// URL manually — URL() mangles non-special schemes on round-trip
  const params = new URLSearchParams();
  for (const r of relayUrls) params.append('relay', r);
  if (secret) params.set('secret', secret);
  if (userPubkeyParam) params.set('pubkey', userPubkeyParam);
  const cleanToken = `bunker://${bunkerPubkey}?${params.toString()}`;
  L('sanitized bunker token:', cleanToken);

  const bunkerSigner = NDKNip46Signer.bunker(ndk, cleanToken, localSigner);
  L('bunkerSigner constructed. state:', {
    bunkerPubkey: bunkerSigner.bunkerPubkey,
    userPubkey: bunkerSigner.userPubkey,
    relayUrls: bunkerSigner.relayUrls,
    hasSecret: !!bunkerSigner.secret,
  });

  bunkerSigner.on('authUrl', (url: string) => {
    L('>>> authUrl event:', url);
    if (options?.onAuthUrl) {
      options.onAuthUrl(url);
      return;
    }
    try {
      const w = window.open(url, 'nostr-auth', 'width=600,height=700');
      if (!w) L('WARN: window.open returned null (popup blocked?) — URL:', url);
    } catch (e) {
      L('ERROR opening authUrl popup:', e, 'URL:', url);
    }
  });
  // Forward every RPC event for visibility
  bunkerSigner.rpc.on('response', (r: unknown) => L('rpc response:', r));
  bunkerSigner.rpc.on('request', (r: unknown) => L('rpc request:', r));

  L('calling bunkerSigner.blockUntilReady() — awaiting signer handshake...');
  let user: NDKUser;
  try {
    user = await bunkerSigner.blockUntilReady();
    L('blockUntilReady resolved. user.pubkey =', user.pubkey, 'elapsed ms =', Math.round(performance.now() - t0));
  } catch (e) {
    L('ERROR blockUntilReady failed:', e, 'elapsed ms =', Math.round(performance.now() - t0));
    throw e;
  }

  ndk.signer = bunkerSigner;
  L('ndk.signer assigned');

  try {
    saveSignerPayload(bunkerSigner.toPayload());
    L('signer payload persisted');
  } catch (err) {
    L('WARN failed to persist bunker signer payload:', err);
  }

  L('fetching profile (8s timeout)...');
  try {
    await Promise.race([
      user.fetchProfile(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    L('profile fetched');
  } catch (e) {
    L('WARN profile fetch failed/timeout:', e);
  }

  L('=== loginWithBunker DONE. total ms =', Math.round(performance.now() - t0));
  return user;
}

// NostrConnect flow — generates a URI for QR scanning
export interface NostrConnectSession {
  uri: string;
  waitForConnection: () => Promise<NDKUser | null>;
  cancel: () => void;
}

export async function createNostrConnectSession(relay?: string, options?: BunkerLoginOptions): Promise<NostrConnectSession> {
  const L = (...args: unknown[]) => console.log('[nostrconnect]', ...args);
  const t0 = performance.now();
  L('=== createNostrConnectSession START ===');

  const ndk = getNDK();
  L('ndk obtained, kicking off ndk.connect()');
  ndk.connect().then(
    () => L('ndk.connect() resolved'),
    (e) => L('ndk.connect() rejected:', e),
  );

  L('dynamic import NDKNip46Signer...');
  const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk');
  L('NDKNip46Signer imported');

  const connectRelay = relay || 'wss://relay.nsec.app';
  L('using connect relay:', connectRelay);

  const signer = NDKNip46Signer.nostrconnect(ndk, connectRelay, undefined, {
    name: 'Obelisk',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar',
  });
  L('signer constructed. state:', {
    localPubkey: signer.localSigner.pubkey,
    relayUrls: signer.relayUrls,
    hasUri: !!signer.nostrConnectUri,
  });
  L('nostrConnectUri:', signer.nostrConnectUri);

  signer.on('authUrl', (url: string) => {
    L('>>> authUrl event:', url);
    if (options?.onAuthUrl) {
      options.onAuthUrl(url);
      return;
    }
    try {
      const w = window.open(url, 'nostr-auth', 'width=600,height=700');
      if (!w) L('WARN: window.open returned null (popup blocked?) — URL:', url);
    } catch (e) {
      L('ERROR opening authUrl popup:', e, 'URL:', url);
    }
  });
  signer.rpc.on('response', (r: unknown) => L('rpc response:', r));
  signer.rpc.on('request', (r: unknown) => L('rpc request:', r));

  const uri = signer.nostrConnectUri || '';
  L('setup done. elapsed ms =', Math.round(performance.now() - t0));

  let cancelled = false;

  const waitForConnection = async (): Promise<NDKUser | null> => {
    L('waitForConnection: awaiting blockUntilReady...');
    const tw = performance.now();
    try {
      const user = await signer.blockUntilReady();
      L('blockUntilReady resolved. user.pubkey =', user.pubkey, 'wait ms =', Math.round(performance.now() - tw));
      if (cancelled) {
        L('waitForConnection: cancelled after resolve, bailing');
        return null;
      }
      ndk.signer = signer;
      L('ndk.signer assigned');
      try {
        saveSignerPayload(signer.toPayload());
        L('signer payload persisted');
      } catch (err) {
        L('WARN persist signer payload failed:', err);
      }
      L('fetching profile (8s timeout)...');
      try {
        await Promise.race([
          user.fetchProfile(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);
        L('profile fetched');
      } catch (e) {
        L('WARN profile fetch failed/timeout:', e);
      }
      return user;
    } catch (err) {
      L('ERROR blockUntilReady rejected:', err, 'wait ms =', Math.round(performance.now() - tw));
      if (cancelled) return null;
      throw err;
    }
  };

  const cancel = () => {
    L('cancel() called');
    cancelled = true;
  };

  return { uri, waitForConnection, cancel };
}

// Profile types
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

// Fetch followers and following
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

// Fetch user's notes
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

// Fetch current kind 0 metadata from relays
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

// Publish kind 0 profile metadata to Nostr relays
// SAFETY: merges with existing metadata — never overwrites unedited fields
export async function publishProfile(fields: {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
}): Promise<NDKEvent> {
  const ndk = getNDK();
  if (!ndk.signer) throw new Error('No signer available');

  const user = await ndk.signer.user();
  const existing = await fetchCurrentKind0(user.pubkey);

  // Merge: only overwrite fields that are explicitly provided and non-empty
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

  // Re-fetch profile into NDK user cache
  user.profile = merged as Record<string, string>;

  return event;
}

// Format pubkey for display
export function formatPubkey(pubkey: string): string {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
}

// Format timestamp
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
