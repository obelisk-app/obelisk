import NDK, {
  NDKEvent,
  NDKUser,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKRelayAuthPolicies,
} from '@nostr-dev-kit/ndk';
import { nip19, generateSecretKey, getPublicKey, nip04 } from 'nostr-tools';

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
  // Also store in window for easy console access on mobile
  if (typeof window !== 'undefined') {
    const entry = {
      time: new Date().toISOString(),
      stage,
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    (window as any)._obelisk_auth_logs = (window as any)._obelisk_auth_logs || [];
    (window as any)._obelisk_auth_logs.push(entry);

    // Persist to localStorage
    try {
      const stored = localStorage.getItem('obelisk-auth-debug-logs');
      const logs = stored ? JSON.parse(stored) : [];
      logs.push(entry);
      // Keep last 100 logs
      if (logs.length > 100) logs.shift();
      localStorage.setItem('obelisk-auth-debug-logs', JSON.stringify(logs));
    } catch (e) {
      // ignore
    }
  }
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

    // Global NIP-46 sniffing on the pool
    if (typeof window !== 'undefined') {
        const ndk = ndkInstance;
        (ndk.pool as any).on('relay:event', async (relay: any, event: any) => {
            if (event.kind === 24133 && ndk.signer && (ndk.signer as any).localSigner) {
                const signer = ndk.signer as any;
                const localSigner = signer.localSigner;
                const pTags = (event.tags || []).filter((t: any) => t[0] === 'p');
                if (pTags.some((t: any) => t[1] === localSigner.pubkey)) {
                    // This event is for us. If it hasn't been handled, setupManualInterception
                    // usually handles it via its own sub, but this pool listener is a backup
                    // for when subscriptions are flaky.
                    logStatus('PoolSniffer', 'Intercepted event for us', { id: event.id });
                    signer.rpc.handleEvent(event);
                }
            }
        });
    }
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
const SIGNER_LOCAL_KEY = 'obelisk-local-signer-key';
const CONNECTION_SECRET_KEY = 'obelisk-connection-secret';

function getLocalSigner(): NDKPrivateKeySigner {
  const L = (msg: string, data?: any) => logStatus('LocalSigner', msg, data);
  if (typeof localStorage === 'undefined') return NDKPrivateKeySigner.generate();
  
  try {
    const saved = localStorage.getItem(SIGNER_LOCAL_KEY);
    if (saved) {
      const secret = localStorage.getItem(CONNECTION_SECRET_KEY);
      if (secret) {
        L(`Resuming session with secret: ${secret}`);
      } else {
        const newSecret = Math.random().toString(36).substring(2, 15);
        localStorage.setItem(CONNECTION_SECRET_KEY, newSecret);
        L('Restored signer but generated new secret');
      }
      L('Restoring local signer from localStorage');
      return new NDKPrivateKeySigner(saved);
    }
  } catch (err) {
    L('Failed to read local signer key:', err);
  }

  L('Generating and saving NEW local signer');
  const signer = NDKPrivateKeySigner.generate();
  try {
    localStorage.setItem(SIGNER_LOCAL_KEY, signer.privateKey!);
    const secret = Math.random().toString(36).substring(2, 15);
    localStorage.setItem(CONNECTION_SECRET_KEY, secret);
    L('Saved new local signer and secret');
  } catch (err) {
    L('Failed to save local signer key:', err);
  }
  return signer;
}

export function getConnectionSecret(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(CONNECTION_SECRET_KEY);
}

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
    let signer = await ndkSignerFromPayload(payload, ndk);
    signer = makeRobustSigner(signer, ndk);
    if (!signer) return false;
    ndk.signer = signer;
    // Block until the bunker handshake is ready so DM fetches can decrypt
    // immediately. If the bunker is offline this will throw after its own
    // timeout; caller decides whether to log out or wait.
    if (typeof (signer as unknown as { blockUntilReady?: () => Promise<unknown> }).blockUntilReady === 'function') {
      console.log('[nostr] restoreRemoteSigner: awaiting blockUntilReady (30s timeout)...');
      
      // Ensure NDK is connected - if the page was just reloaded, it might still be connecting
      if (ndk.pool.connectedRelays().length === 0) {
        console.log('[nostr] restoreRemoteSigner: no connected relays, triggering connect');
        ndk.connect().catch(() => {});
      }

      // Start manual interception for restored session
      setupManualInterception(ndk, signer, 'RestoreSession');

      await withTimeout((signer as unknown as { blockUntilReady: () => Promise<unknown> }).blockUntilReady(), 30000);
      console.log('[nostr] restoreRemoteSigner: blockUntilReady resolved');
    }
    return true;
  } catch (err) {
    console.warn('[nostr] restoreRemoteSigner failed:', err);
    // Only wipe if it's NOT a timeout. We want to allow retries if the bunker is just slow.
    const isTimeout = String(err).toLowerCase().includes('timeout');
    if (!isTimeout) {
      console.log('[nostr] Wiping signer payload due to non-timeout error');
      clearSignerPayload();
    }
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
  /** Invoked when a kind 24133 RPC event is intercepted manually. */
  onRpcEvent?: (event: any) => void;
}


/**
 * Sets up a manual subscription and interception loop for NIP-46 RPC events.
 * This is critical on mobile where background subscriptions often fail or
 * get suspended. It also adds robust decryption (NIP-04 fallback + NIP-44 support).
 */
function setupManualInterception(ndk: NDK, signer: any, logPrefix: string) {
  const L = (msg: string, ...args: any[]) => logStatus(logPrefix, msg, args);
  const localSigner = signer.localSigner;
  if (!localSigner || !localSigner.pubkey) {
    L('WARN: setupManualInterception called without localSigner');
    return;
  }

  L('Setting up manual NIP-46 interception loop for pubkey:', localSigner.pubkey);
  
  // Use a 'since' filter to catch events that might have been sent while 
  // the browser tab was suspended in the background.
  const since = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
  const manualSub = ndk.subscribe({
    kinds: [24133 as number],
    '#p': [localSigner.pubkey],
    since
  }, { closeOnEose: false });

  manualSub.on('event', async (event: any) => {
    if (event.kind === 24133) {
      const pTags = event.getMatchingTags('p');
      if (pTags.some((t: string[]) => t[1] === localSigner.pubkey)) {
        L('MANUAL INTERCEPTION: Kind 24133 received!', { id: event.id, from: event.pubkey });
        
        const tryDecrypt = async () => {
          L('Attempting decryption of content length:', event.content?.length);
          if (!event.content) throw new Error('Empty event content');
          
          const isNip04 = event.content.includes('?iv=');
          try {
            if (isNip04) {
              const remoteUser = ndk.getUser({ pubkey: event.pubkey });
              return await localSigner.decrypt(remoteUser, event.content);
            } else {
              L('Content is NOT NIP-04, attempting NIP-44 decryption...');
              const { nip44, utils } = await import('nostr-tools');
              const privKeyBytes = typeof localSigner.privateKey === 'string' ? utils.hexToBytes(localSigner.privateKey) : localSigner.privateKey;
              const convKey = nip44.getConversationKey(privKeyBytes, event.pubkey);
              return nip44.decrypt(event.content, convKey);
            }
          } catch (err) {
            L('Decryption failed, trying best-effort fallback...', err);
            if (localSigner.privateKey) {
              try {
                const { nip04 } = await import('nostr-tools');
                if (isNip04) return await nip04.decrypt(localSigner.privateKey, event.pubkey, event.content);
              } catch (e2) { L('Final fallback failed', e2); }
            }
            throw err;
          }
        };

        try {
          const decrypted = await tryDecrypt();
          L('DECRYPTED RPC CONTENT SUCCESS:', decrypted);
          
          const parsed = JSON.parse(decrypted);
          const isConnect = parsed.method === 'connect';
          const isPubkeyResult = typeof parsed.result === 'string' && parsed.result.length === 64;
          const isAck = parsed.result === 'ack';

          if (isConnect || isPubkeyResult || isAck) {
            L('SUCCESSFUL RPC EVENT DETECTED', { method: parsed.method });
            let userPubkey = event.pubkey;
            if (isPubkeyResult) userPubkey = parsed.result;
            else if (isConnect && parsed.params?.[0]?.length === 64) userPubkey = parsed.params[0];

            if (userPubkey && userPubkey.length === 64) {
              L('FORCE SUCCESS: Manually setting userPubkey and emitting ready', { userPubkey });
              signer.userPubkey = userPubkey;
              if (!signer.remoteUser) {
                const { NDKUser } = await import('@nostr-dev-kit/ndk');
                signer.remoteUser = new NDKUser({ pubkey: userPubkey });
                signer.remoteUser.ndk = ndk;
              }
              signer.emit('ready', userPubkey);
            }
          }
        } catch (e) {
          L('Interception error', String(e));
        }

        // Always inject into handleEvent
        L('Injecting event into signer.rpc.handleEvent...');
        signer.rpc.handleEvent(event);
      }
    }
  });

  return manualSub;
}


/**
 * Enhances an NDKNip46Signer with robustness features from nostrito-app:
 * 1. Automatic encryption switching (NIP-44 <-> NIP-04) on timeouts.
 * 2. Manual sign_event request construction (omitting id/pubkey) for picky signers.
 * 3. Extended timeout and retry logic.
 */
function makeRobustSigner(signer: any, ndk: NDK) {
  if (signer._robust) return signer;
  signer._robust = true;

  const L = (msg: string, ...args: any[]) => logStatus('RobustSigner', msg, args);

  // Original methods
  const originalSendRequest = signer.rpc.sendRequest.bind(signer.rpc);
  const originalSign = signer.sign.bind(signer);

  // 1. Wrap sendRequest to support encryption switching
  signer.rpc.sendRequest = async (remotePubkey: string, method: string, params: any[] = [], kind = 24133, cb?: (res: any) => void) => {
    const primaryEncryption = signer.rpc.encryptionType;
    L(`Sending request: ${method} (primary=${primaryEncryption})`);

    try {
      // Try primary with a shorter timeout if it's a critical request
      const res = await Promise.race([
        new Promise((resolve) => originalSendRequest(remotePubkey, method, params, kind, resolve)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000))
      ]);
      if (cb) cb(res);
      return res;
    } catch (err: any) {
      if (err.message === 'TIMEOUT') {
        const fallback = primaryEncryption === 'nip44' ? 'nip04' : 'nip44';
        L(`Request ${method} timed out, retrying with fallback=${fallback}...`);
        signer.rpc.encryptionType = fallback;
        return originalSendRequest(remotePubkey, method, params, kind, cb);
      }
      throw err;
    }
  };

  // 2. Wrap sign to use manual event construction
  signer.sign = async (event: any) => {
    L('Robust sign_event requested for kind:', event.kind);
    
    // Build manual event object per NIP-46 spec (no id/pubkey)
    const unsignedEvent = {
      kind: event.kind,
      content: event.content,
      tags: event.tags,
      created_at: event.created_at
    };

    return new Promise((resolve, reject) => {
      const signTimeout = setTimeout(() => {
        L('sign_event initial attempt timed out, forcing encryption flip...');
        signer.rpc.encryptionType = signer.rpc.encryptionType === 'nip44' ? 'nip04' : 'nip44';
      }, 15000);

      signer.rpc.sendRequest(signer.bunkerPubkey, 'sign_event', [JSON.stringify(unsignedEvent)], 24133, (response: any) => {
        clearTimeout(signTimeout);
        if (response.error) {
          L('sign_event error:', response.error);
          reject(response.error);
        } else {
          try {
            const json = JSON.parse(response.result);
            L('sign_event SUCCESS');
            resolve(json.sig);
          } catch (e) {
            L('Failed to parse sign_event result:', response.result);
            // Some signers return the signature directly as a string
            if (typeof response.result === 'string' && response.result.length >= 128) {
               resolve(response.result);
            } else {
               reject(new Error('Invalid signature format from bunker'));
            }
          }
        }
      });
    });
  };

  return signer;
}

export async function loginWithBunker(bunkerUrl: string, options?: BunkerLoginOptions): Promise<NDKUser | null> {
  const L = (...args: unknown[]) => logStatus('Bunker', args[0] as string, args.slice(1));
  const t0 = performance.now();
  L('=== START V-FORCE-SUCCESS-2 ===');
  L('raw input:', bunkerUrl);

  const ndk = getNDK();
  L('getNDK() called');
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
  // Add redundancy relays for NIP-46 connection
  CONNECT_RELAYS.forEach(url => {
    try {
      ndk.addExplicitRelay(url);
    } catch {}
  });
  
  ndk.connect().then(
    () => L('ndk.connect() resolved'),
    (e) => L('ndk.connect() rejected:', e),
  );

  L('dynamic import NDKNip46Signer...');
  const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk');
  L('NDKNip46Signer imported');

  const localSigner = getLocalSigner();
  L('localSigner obtained, local pubkey =', localSigner.pubkey);

  // Rebuild bunker:// URL manually — URL() mangles non-special schemes on round-trip
  const params = new URLSearchParams();
  for (const r of relayUrls) params.append('relay', r);
  if (secret) params.set('secret', secret);
  if (userPubkeyParam) params.set('pubkey', userPubkeyParam);
  const cleanToken = `bunker://${bunkerPubkey}?${params.toString()}`;
  L('sanitized bunker token:', cleanToken);

  let bunkerSigner = NDKNip46Signer.bunker(ndk, cleanToken, localSigner);
  bunkerSigner = makeRobustSigner(bunkerSigner, ndk);
  L('bunkerSigner constructed. state:', {
    bunkerPubkey: bunkerSigner.bunkerPubkey,
    userPubkey: bunkerSigner.userPubkey,
    relayUrls: bunkerSigner.relayUrls,
    hasSecret: !!bunkerSigner.secret,
  });

  bunkerSigner.on('authUrl', (url: string) => {
    L('>>> authUrl event:', url);
    if (options?.onAuthUrl) {
      L('Calling options.onAuthUrl');
      options.onAuthUrl(url);
      return;
    }
    
    // On mobile, window.open is often blocked. If it's a deep link (nostrconnect://),
    // we should just redirect the current page or use a direct link.
    const isDeepLink = url.startsWith('nostrconnect://') || url.startsWith('bunker://');
    L('Opening authUrl', { url, isDeepLink });

    try {
      if (isDeepLink && typeof window !== 'undefined') {
        // For deep links on mobile, window.open is unreliable.
        // We try window.open first but provide no fallback here as the UI
        // should have a button if options.onAuthUrl was provided.
        // If no options provided, we try window.open.
        const w = window.open(url, '_blank');
        if (!w) {
          L('window.open failed, trying location.href');
          window.location.href = url;
        }
      } else {
        const w = window.open(url, 'nostr-auth', 'width=600,height=700');
        if (!w) L('WARN: window.open returned null (popup blocked?) — URL:', url);
      }
    } catch (e) {
      L('ERROR opening authUrl:', e, 'URL:', url);
    }
  });
  // Forward every RPC event for visibility
  bunkerSigner.rpc.on('response', (r: unknown) => L('rpc response:', JSON.stringify(r)));
  bunkerSigner.rpc.on('request', (r: unknown) => L('rpc request:', JSON.stringify(r)));

  setupManualInterception(ndk, bunkerSigner, 'Bunker');

  L('calling bunkerSigner.blockUntilReady() (60s timeout)...');
  
  // Create a promise that resolves when signer.userPubkey is set
  const forceSuccessPromise = new Promise<string>((resolve) => {
    const check = () => {
      if (bunkerSigner.userPubkey) resolve(bunkerSigner.userPubkey);
      else if (!cancelled_internal_bunker) setTimeout(check, 1000);
    };
    check();
  });
  let cancelled_internal_bunker = false;

  let user: NDKUser;
  try {
    const resolvedPubkey = await Promise.race([
      bunkerSigner.blockUntilReady().then(u => u.pubkey),
      forceSuccessPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))
    ]);
    L('Connection established (manual or NDK)! pubkey:', resolvedPubkey);
    user = ndk.getUser({ pubkey: resolvedPubkey });
  } catch (e) {
    L('ERROR blockUntilReady failed or timed out:', e, 'elapsed ms =', Math.round(performance.now() - t0));
    cancelled_internal_bunker = true;
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

  L('=== DONE. total ms =', Math.round(performance.now() - t0));
  return user;
}

// NostrConnect flow — generates a URI for QR scanning
export interface NostrConnectSession {
  uri: string;
  waitForConnection: () => Promise<NDKUser | null>;
  cancel: () => void;
}

export async function createNostrConnectSession(relay?: string, options?: BunkerLoginOptions): Promise<NostrConnectSession> {
  const L = (...args: unknown[]) => logStatus('NostrConnect', args[0] as string, args.slice(1));
  const t0 = performance.now();
  L('=== START V-FORCE-SUCCESS-2 ===');

  const ndk = getNDK();
  L('getNDK() called');
  L('ndk obtained, adding redundancy relays');
  CONNECT_RELAYS.forEach(r => {
    try {
      ndk.addExplicitRelay(r);
    } catch {
      // already added
    }
  });

  ndk.connect().then(
    () => L('ndk.connect() resolved'),
    (e) => L('ndk.connect() rejected:', e),
  );

  L('dynamic import NDKNip46Signer...');
  const { NDKNip46Signer } = await import('@nostr-dev-kit/ndk');
  L('NDKNip46Signer imported');

  const connectRelay = relay || CONNECT_RELAYS[0];
  L('using primary connect relay:', connectRelay);

  const localSigner = getLocalSigner();
  const secret = getConnectionSecret();
  L('localSigner obtained, local pubkey =', localSigner.pubkey);

  let signer = NDKNip46Signer.nostrconnect(ndk, connectRelay, localSigner, {
    name: 'Obelisk',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar',
  });

  if (secret) {
    (signer as any).secret = secret;
  }

  // NDK built-in URI only has one relay. Let's add the others for redundancy
  // Amber expects: nostrconnect://<pubkey>?relay=<url>&relay=<url>&metadata=...
  const url = new URL(signer.nostrConnectUri!);
  // Remove existing relay param to re-add in order
  url.searchParams.delete('relay');
  CONNECT_RELAYS.forEach(r => url.searchParams.append('relay', r));

  if (secret) {
    url.searchParams.set('secret', secret);
  }

  // Ensure metadata is present if the signer app expects it
  const metadata = {
    name: 'Obelisk',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar',
    description: 'Nostr chat for La Crypta',
    icons: ['https://obelisk.ar/icon.png']
  };
  url.searchParams.set('metadata', JSON.stringify(metadata));

  // Clean up empty params that might confuse some signers
  url.searchParams.delete('image');
  url.searchParams.delete('perms');
  const keysToRemove: string[] = [];
  url.searchParams.forEach((value, key) => {
    if (!value || value === 'undefined' || value === 'null' || value === '') {
      keysToRemove.push(key);
    }
  });
  keysToRemove.forEach(k => url.searchParams.delete(k));

  const uri = url.toString();
  L('COMPLIANT URI generated:', uri);

  signer.on('authUrl', (url: string) => {
    L('>>> authUrl event:', url);
    if (options?.onAuthUrl) {
      L('Calling options.onAuthUrl');
      options.onAuthUrl(url);
      return;
    }
    
    // On mobile, window.open is often blocked. If it's a deep link (nostrconnect://),
    // we should just redirect the current page or use a direct link.
    const isDeepLink = url.startsWith('nostrconnect://') || url.startsWith('bunker://');
    L('Opening authUrl', { url, isDeepLink });

    try {
      if (isDeepLink && typeof window !== 'undefined') {
        // For deep links on mobile, window.open is unreliable.
        // We try window.open first but provide no fallback here as the UI
        // should have a button if options.onAuthUrl was provided.
        // If no options provided, we try window.open.
        const w = window.open(url, '_blank');
        if (!w) {
          L('window.open failed, trying location.href');
          window.location.href = url;
        }
      } else {
        const w = window.open(url, 'nostr-auth', 'width=600,height=700');
        if (!w) L('WARN: window.open returned null (popup blocked?) — URL:', url);
      }
    } catch (e) {
      L('ERROR opening authUrl:', e, 'URL:', url);
    }
  });
  signer.rpc.on('response', (r: unknown) => L('rpc response:', JSON.stringify(r)));
  signer.rpc.on('request', (r: unknown) => L('rpc request:', JSON.stringify(r)));

  L('setup done. elapsed ms =', Math.round(performance.now() - t0));

  let cancelled = false;

  const waitForConnection = async (): Promise<NDKUser | null> => {
    L('waitForConnection: ensuring ndk.connect() is initiated...');
    if (ndk.pool.connectedRelays().length === 0) {
      L('No connected relays, triggering ndk.connect()');
      ndk.connect().catch(e => L('ndk.connect() error:', e));
      // Wait up to 5s for at least one relay to connect before proceeding to blockUntilReady
      let attempts = 0;
      while (ndk.pool.connectedRelays().length === 0 && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }
    }
    L('Relay check done, connected relays:', ndk.pool.connectedRelays().length);

    let manualSub: any = null;
    L('waitForConnection: awaiting blockUntilReady (60s timeout)...');
    
    // Add relay lifecycle logging during handshake
    const onConnect = (r: any) => L(`Relay connected: ${r.url}`);
    const onDisconnect = (r: any) => L(`Relay disconnected: ${r.url}`);
    ndk.pool.on('relay:connect', onConnect);
    ndk.pool.on('relay:disconnect', onDisconnect);

    manualSub = setupManualInterception(ndk, signer, 'NostrConnect');

    const tw = performance.now();
    try {
      L("Signer local pubkey: " + localSigner.pubkey);
      L("Connected relays: " + ndk.pool.connectedRelays().map(r => r.url).join(', '));

      // Reconnection loop for mobile tab suspension
      const reconnectInterval = setInterval(() => {
        if (ndk.pool.connectedRelays().length === 0) {
          L('No connected relays in loop, calling ndk.connect()...');
          ndk.connect().catch(e => L('ndk.connect() error in loop:', e));
        }
      }, 5000);

      // Pre-assign signer to NDK. Some NDK versions need this to handle 
      // responding to the initial 'connect' request correctly.
      ndk.signer = signer;

      L('Calling signer.blockUntilReady()...');
      let user: NDKUser | null = null;
      
      // Create a promise that resolves when signer.userPubkey is set
      const forceSuccessPromise = new Promise<string>((resolve) => {
        const check = () => {
          if (signer.userPubkey) resolve(signer.userPubkey);
          else if (!cancelled) setTimeout(check, 1000);
        };
        check();
      });

      try {
        // Wait for either the official handshake or our manual injection
        const resolvedPubkey = await Promise.race([
          signer.blockUntilReady().then(u => u.pubkey),
          forceSuccessPromise,
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000))
        ]);
        
        L('Connection established (manual or NDK)! pubkey:', resolvedPubkey);
        user = ndk.getUser({ pubkey: resolvedPubkey });
      } catch (e) {
        L('ERROR connection failed or timed out:', e);
        throw e;
      }
      clearInterval(reconnectInterval);
      L('blockUntilReady resolved. user.pubkey =', user?.pubkey, 'wait ms =', Math.round(performance.now() - tw));
      if (cancelled) {
        L('waitForConnection: cancelled after resolve, bailing');
        return null;
      }
      
      L('ndk.signer remains assigned');
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
      L('ERROR blockUntilReady rejected!', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        waitMs: Math.round(performance.now() - tw)
      });
      if (cancelled) return null;
      throw err;
    } finally {
      ndk.pool.off('relay:connect', onConnect);
      ndk.pool.off('relay:disconnect', onDisconnect);
      manualSub.stop();
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
