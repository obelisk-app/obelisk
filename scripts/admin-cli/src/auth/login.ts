import { ctxFromBase, request, extractSessionCookie, persistCookie } from '../http';
import { clearSession, loadSession, SessionFile } from '../config';
import { decodeNsec, signChallengeWithNsec, pubkeyFromNsec, SignedChallengeEvent } from './signer-nsec';
import { connectBunker, signChallengeWithBunker } from './signer-bunker';
import { readKeyFile } from './keyfile';

async function fetchChallenge(baseUrl: string): Promise<{ challengeId: string; challenge: string }> {
  const ctx = ctxFromBase(baseUrl);
  const { data } = await request<{ challengeId: string; challenge: string }>(ctx, 'POST', '/api/auth/challenge');
  return data;
}

async function sendVerify(
  baseUrl: string,
  challengeId: string,
  signedEvent: SignedChallengeEvent
): Promise<string> {
  const ctx = ctxFromBase(baseUrl);
  const { setCookie } = await request(
    ctx,
    'POST',
    '/api/auth/verify',
    { challengeId, signedEvent },
    { captureCookie: true }
  );
  const cookie = extractSessionCookie(setCookie);
  if (!cookie) throw new Error('Server did not return a session cookie');
  return cookie;
}

export async function loginWithNsecFile(baseUrl: string, filePath: string): Promise<SessionFile> {
  return loginWithNsec(baseUrl, readKeyFile(filePath));
}

export async function loginWithNsec(baseUrl: string, nsec: string): Promise<SessionFile> {
  const secret = decodeNsec(nsec);
  const pubkey = pubkeyFromNsec(secret);
  const { challengeId, challenge } = await fetchChallenge(baseUrl);
  const signedEvent = signChallengeWithNsec(secret, challenge);
  const cookie = await sendVerify(baseUrl, challengeId, signedEvent);
  return persistCookie(baseUrl, pubkey, cookie);
}

export async function loginWithBunker(baseUrl: string, bunkerUri: string): Promise<SessionFile> {
  const handle = await connectBunker(bunkerUri);
  try {
    const { challengeId, challenge } = await fetchChallenge(baseUrl);
    const signedEvent = await signChallengeWithBunker(handle, challenge);
    const cookie = await sendVerify(baseUrl, challengeId, signedEvent);
    return persistCookie(baseUrl, handle.userPubkey, cookie);
  } finally {
    await handle.disconnect();
  }
}

export function logout(): void {
  clearSession();
}

export function whoami(): { pubkey: string; baseUrl: string; savedAt: number } | null {
  const s = loadSession();
  if (!s) return null;
  return { pubkey: s.pubkey, baseUrl: s.baseUrl, savedAt: s.savedAt };
}
