import { NextRequest, NextResponse } from 'next/server';
import { verifySignedEvent } from '@/lib/auth';

/**
 * POST /api/auth/verify — verify a signed Nostr challenge and issue a session.
 *
 * Authentication is now decoupled from server membership. Logging in succeeds
 * for any valid signature; the user gets a session cookie but is NOT
 * auto-joined to any server. Server access is gated separately:
 *
 *   - WoT auto-add via `POST /api/servers/:id/join` (when WoT permits)
 *   - Invite redemption via `POST /api/invitations/:code`
 *
 * This means a brand-new user can authenticate and see the empty-state in
 * the chat UI even when no server would let them in. They have an identity;
 * they just don't have a place to chat yet.
 */
export async function POST(req: NextRequest) {
  const { challengeId, signedEvent } = await req.json();

  if (!challengeId || !signedEvent) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const token = await verifySignedEvent(challengeId, signedEvent);
  if (!token) {
    return NextResponse.json({ error: 'Invalid signature or expired challenge' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const forwardedProto = req.headers.get('x-forwarded-proto');
  const isHttps = forwardedProto
    ? forwardedProto.split(',')[0].trim() === 'https'
    : req.nextUrl.protocol === 'https:';
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}
