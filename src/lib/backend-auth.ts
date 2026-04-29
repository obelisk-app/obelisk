import type { NostrSigner } from '@nostr-wot/signers';
import type { EventTemplate } from 'nostr-tools';
import { logStatus } from './nostr';
import { KIND_HTTP_AUTH } from './nip-kinds';

/**
 * Performs the full backend challenge-response auth flow against obelisk's
 * /api/auth endpoints.
 *
 * 1. POST /api/auth/challenge  — get a one-time challenge string
 * 2. Sign a kind-27235 event containing the challenge
 * 3. POST /api/auth/verify     — server verifies sig and sets httpOnly cookie
 *
 * Throws on any failure so callers can surface the error to the user.
 */
export async function authenticateWithBackend(signer: NostrSigner): Promise<boolean> {
  logStatus('BackendAuth', 'Requesting challenge from /api/auth/challenge...');
  const challengeRes = await fetch('/api/auth/challenge', { method: 'POST' });
  if (!challengeRes.ok) {
    throw new Error('Failed to get challenge');
  }
  const { challengeId, challenge } = await challengeRes.json();

  const template: EventTemplate = {
    kind: KIND_HTTP_AUTH,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: challenge,
  };
  const event = await signer.signEvent(template);
  logStatus('BackendAuth', 'Event signed', { id: event.id });

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

  logStatus('BackendAuth', 'Verification SUCCESS');
  return true;
}
