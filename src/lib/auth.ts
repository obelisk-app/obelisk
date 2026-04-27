import { randomBytes, createHash } from 'crypto';
import { prisma } from './db';

// In-memory challenge store (short-lived, no need to persist)
let challenges = new Map<string, { challenge: string; createdAt: number }>();

const CHALLENGE_TTL = 300_000; // 1 minute
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
// Renew when less than 1 day remains — at most one DB write per 24h per user.
// Note: the browser cookie's maxAge is set only at login and is not re-issued
// here. The sliding window only extends the server-side DB row. If a user's
// cookie has already expired client-side they will be asked to re-login
// regardless of this extension.
const SLIDE_WINDOW_MS = 6 * 24 * 60 * 60 * 1000; // renew when < 1d remains

export function generateChallenge(): { challengeId: string; challenge: string } {
  const challengeId = randomBytes(16).toString('hex');
  const challenge = `obelisk-auth:${randomBytes(32).toString('hex')}:${Date.now()}`;
  challenges.set(challengeId, { challenge, createdAt: Date.now() });
  return { challengeId, challenge };
}

// For testing only
export function __setChallenges(newChallenges: Map<string, { challenge: string; createdAt: number }>) {
  (challenges as any) = newChallenges;
}

// Verify using a signed Nostr event (kind 27235 - NIP-98 style)
// The client signs a kind-27235 event with the challenge as content
export async function verifySignedEvent(
  challengeId: string,
  signedEvent: {
    pubkey: string;
    content: string;
    kind: number;
    created_at: number;
    sig: string;
    id: string;
    tags: string[][];
  }
): Promise<string | null> {
  const entry = challenges.get(challengeId);
  if (!entry) {
    console.log('[auth] challenge not found or already deleted:', challengeId);
    return null;
  }

  if (Date.now() - entry.createdAt > CHALLENGE_TTL) {
    challenges.delete(challengeId);
    return null;
  }

  // Verify the event content matches the challenge
  if (signedEvent.content !== entry.challenge) return null;
  if (signedEvent.kind !== 27235) return null;

  // Verify the event signature using nostr-tools
  const { verifyEvent } = await import('nostr-tools/pure');
  let valid: boolean;
  try {
    valid = verifyEvent(signedEvent);
  } catch {
    return null;
  }

  if (!valid) return null;

  challenges.delete(challengeId);

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL);

  await prisma.session.create({
    data: { pubkey: signedEvent.pubkey.toLowerCase(), token, expiresAt },
  });

  return token;
}

export async function validateSession(token: string): Promise<string | null> {
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  // Sliding expiry: push expiresAt forward when we're inside the renewal
  // window (< 1 day remaining). Fire-and-forget so the request is not
  // blocked; if the write fails the user gets renewed on the next request.
  if (session.expiresAt.getTime() < now + SLIDE_WINDOW_MS) {
    const newExpiresAt = new Date(now + SESSION_TTL);
    void prisma.session
      .update({ where: { token }, data: { expiresAt: newExpiresAt } })
      .catch(() => { /* best-effort */ });
  }

  return session.pubkey;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}
