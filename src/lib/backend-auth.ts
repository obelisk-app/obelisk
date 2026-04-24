import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import { logStatus } from './nostr';
import { KIND_HTTP_AUTH } from './nip-kinds';

/**
 * Performs the full backend challenge-response auth flow.
 * 1. Request challenge from server
 * 2. Sign it as a kind-27235 Nostr event using current NDK signer
 * 3. Send signed event to server for verification
 * 4. Server sets httpOnly session cookie
 *
 * Returns true if auth succeeded.
 */
export async function authenticateWithBackend(ndk: NDK): Promise<boolean> {
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
  const event = new NDKEvent(ndk);
  event.kind = KIND_HTTP_AUTH;
  event.content = challenge;
  event.tags = [];
  try {
    await event.sign();
    logStatus('BackendAuth', 'Event signed successfully', { id: event.id });
  } catch (signErr) {
    logStatus('BackendAuth', 'ERROR: Event signing failed', { error: signErr });
    throw signErr;
  }

  // 3. Verify with backend
  logStatus('BackendAuth', 'Verifying with backend /api/auth/verify...', {
    pubkey: event.pubkey,
    id: event.id,
    sig: event.sig?.slice(0, 10) + '...'
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
