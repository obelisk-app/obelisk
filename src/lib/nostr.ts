import NDK, { NDKEvent, NDKUser, NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

// Popular relays (high availability)
const POPULAR_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://purplepag.es',
];

// Global NDK instance
let ndkInstance: NDK | null = null;
let userRelaysAdded = false;

export function getNDK(): NDK {
  if (!ndkInstance) {
    ndkInstance = new NDK({
      explicitRelayUrls: [...POPULAR_RELAYS],
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

    // fetchProfile can hang — add a timeout
    try {
      await Promise.race([
        user.fetchProfile(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
    } catch {
      // Profile fetch failed or timed out — continue with basic user info
      console.warn('Profile fetch timed out or failed, continuing with pubkey only');
    }

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
  
  const user = await signer.user();
  await user.fetchProfile();
  
  return user;
}

export async function loginWithBunker(bunkerUrl: string): Promise<NDKUser | null> {
  // bunker://pubkey?relay=wss://relay.nsecbunker.com
  const ndk = getNDK();

  // Parse bunker URL
  const url = new URL(bunkerUrl);
  const remotePubkey = url.hostname;
  const relayUrl = url.searchParams.get('relay');

  if (!remotePubkey || !relayUrl) {
    throw new Error('Invalid bunker URL format');
  }

  // Dynamic import for bunker signer
  const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk');

  const localSigner = NDKPrivateKeySigner.generate();
  const bunkerSigner = new NDKNip46Signer(ndk, remotePubkey, localSigner);

  await bunkerSigner.blockUntilReady();
  ndk.signer = bunkerSigner;

  const user = await bunkerSigner.user();
  try {
    await Promise.race([
      user.fetchProfile(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
  } catch {
    console.warn('Profile fetch timed out or failed');
  }

  return user;
}

// NostrConnect flow — generates a URI for QR scanning
export interface NostrConnectSession {
  uri: string;
  waitForConnection: () => Promise<NDKUser | null>;
  cancel: () => void;
}

export async function createNostrConnectSession(relay?: string): Promise<NostrConnectSession> {
  const ndk = getNDK();
  // Don't await — NDK connects in the background
  ndk.connect();

  const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk');

  const connectRelay = relay || 'wss://relay.nsec.app';

  const signer = NDKNip46Signer.nostrconnect(ndk, connectRelay, undefined, {
    name: 'Nostr Starter Kit',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://nostr-starter.local',
  });

  const uri = signer.nostrConnectUri || '';

  let cancelled = false;

  const waitForConnection = async (): Promise<NDKUser | null> => {
    try {
      const user = await signer.blockUntilReady();
      if (cancelled) return null;
      ndk.signer = signer;
      try {
        await Promise.race([
          user.fetchProfile(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);
      } catch {
        console.warn('Profile fetch timed out or failed');
      }
      return user;
    } catch (err) {
      if (cancelled) return null;
      throw err;
    }
  };

  const cancel = () => {
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
