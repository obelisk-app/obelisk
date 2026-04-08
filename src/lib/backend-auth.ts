import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';

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
  if (!ndk.signer) throw new Error('No signer available');

  // 1. Get challenge
  const challengeRes = await fetch('/api/auth/challenge', { method: 'POST' });
  if (!challengeRes.ok) throw new Error('Failed to get challenge');
  const { challengeId, challenge } = await challengeRes.json();

  // 2. Sign as Nostr event
  const event = new NDKEvent(ndk);
  event.kind = 27235;
  event.content = challenge;
  event.tags = [];
  await event.sign();

  // 3. Verify with backend
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

  if (!verifyRes.ok) {
    const data = await verifyRes.json().catch(() => ({}));
    throw new Error(data.error || 'Authentication failed');
  }

  return true;
}
