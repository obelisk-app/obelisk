import type { NostrSigner } from '@nostr-wot/signers';
import type { EventTemplate } from 'nostr-tools';
import { logStatus, type NdkShim } from './nostr';
import { KIND_HTTP_AUTH } from './nip-kinds';
import type { LoginMethod } from '@/lib/nostr';

/**
 * Performs the full backend challenge-response auth flow.
 * 1. Request challenge from server
 * 2. Sign it as a kind-27235 Nostr event using current signer
 * 3. Send signed event to server for verification
 * 4. Server sets httpOnly session cookie
 *
 * Returns true if auth succeeded.
 *
 * Accepts the legacy `NdkShim` shape (from `getNDK()`) so call sites
 * don't have to change. The `ndk.signer` is now a `NostrSigner` from
 * `@nostr-wot/signers`, signing happens via `signer.signEvent` directly.
 */
export async function authenticateWithBackend(ndk: NdkShim): Promise<boolean> {
  if (!ndk.signer) {
    logStatus('BackendAuth', 'ERROR: No signer available');
    throw new Error('No signer available');
  }

  // 1. Get challenge
  logStatus('BackendAuth', 'Requesting challenge from /api/auth/challenge...');
  const challengeRes = await fetch('/api/auth/challenge', { method: 'POST' });
  if (!challengeRes.ok) {
    logStatus('BackendAuth', 'ERROR: Failed to get challenge', { status: challengeRes.status });
    throw new Error('Failed to get challenge');
  }
  const { challengeId, challenge } = await challengeRes.json();
  logStatus('BackendAuth', 'Challenge received', { challengeId });

  // 2. Sign as Nostr event
  logStatus('BackendAuth', 'Signing kind-27235 event...');
  const template: EventTemplate = {
    kind: KIND_HTTP_AUTH,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: challenge,
  };
  let event;
  try {
    event = await (ndk.signer as NostrSigner).signEvent(template);
    logStatus('BackendAuth', 'Event signed successfully', { id: event.id });
  } catch (signErr) {
    logStatus('BackendAuth', 'ERROR: Event signing failed', { error: signErr });
    throw signErr;
  }

  // 3. Verify with backend
  logStatus('BackendAuth', 'Verifying with backend /api/auth/verify...', {
    pubkey: event.pubkey,
    id: event.id,
    sig: event.sig?.slice(0, 10) + '...',
  });

  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId,
      signedEvent: {
        pubkey: event.pubkey,
        content: event.content,
        kind: event.kind,
        created_at: event.created_at,
        sig: event.sig,
        id: event.id,
        tags: event.tags,
      },
    }),
  });

  logStatus('BackendAuth', 'Verify request completed', { ok: verifyRes.ok, status: verifyRes.status });

  if (!verifyRes.ok) {
    const data = await verifyRes.json().catch(() => ({}));
    logStatus('BackendAuth', 'ERROR: Verification failed', { status: verifyRes.status, error: data.error });
    throw new Error(data.error || 'Authentication failed');
  }

  logStatus('BackendAuth', 'Verification SUCCESS');
  return true;
}

export interface PerformBackendAuthOptions {
  ndk: NdkShim;
  loginMethod: LoginMethod;
  /** Optional progress callback (called between phases). */
  onProgress?: (phase: 'challenge' | 'signing' | 'verifying' | 'syncing') => void;
}

export interface PerformBackendAuthResult {
  pubkey: string;
}

/**
 * Run the full backend authentication flow: challenge → sign → verify →
 * install user in the auth store → kick a profile sync. Throws on any
 * failure (signer missing, signature rejected, network error, etc.).
 */
export async function performBackendAuth(opts: PerformBackendAuthOptions): Promise<PerformBackendAuthResult> {
  const { ndk, loginMethod, onProgress } = opts;
  if (!ndk.signer) throw new Error('No signer attached');

  onProgress?.('challenge');
  const pubkey = await ndk.signer.getPublicKey();

  onProgress?.('signing');
  // authenticateWithBackend handles challenge fetch + event signing + verify POST
  await authenticateWithBackend(ndk);

  onProgress?.('verifying');
  // The backend verify endpoint sets the session cookie. Now install the
  // user into the auth store so React consumers see them as logged in.
  const { useAuthStore } = await import('@/store/auth');
  const { nip19 } = await import('nostr-tools');
  useAuthStore.getState().setUser(
    { pubkey, npub: nip19.npubEncode(pubkey) },
    loginMethod,
  );

  onProgress?.('syncing');
  // Best-effort profile sync — don't block the caller on slow relays.
  void useAuthStore.getState().syncProfile();

  return { pubkey };
}
