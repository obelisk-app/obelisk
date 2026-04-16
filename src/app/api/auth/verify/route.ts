import { NextRequest, NextResponse } from 'next/server';
import { verifySignedEvent } from '@/lib/auth';
import { prisma } from '@/lib/db';

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
 * However, if an InstanceSettings.defaultServerId is configured, brand-new
 * users (users with 0 server memberships) are automatically joined to that
 * server so they have a place to land immediately.
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

  // Handle auto-join to Default Server for new users
  try {
    const pubkey = signedEvent.pubkey;
    const serverCount = await prisma.member.count({ where: { pubkey } });
    
    if (serverCount === 0) {
      const settings = await prisma.instanceSettings.findUnique({ where: { id: 'global' } });
      if (settings?.defaultServerId) {
        // Double check if they are already in the default server (safety net)
        const alreadyIn = await prisma.member.findUnique({
          where: { serverId_pubkey: { serverId: settings.defaultServerId, pubkey } }
        });
        
        if (!alreadyIn) {
          await prisma.member.create({
            data: {
              serverId: settings.defaultServerId,
              pubkey,
              role: 'member'
            }
          });
          console.log(`[auth] auto-joined new user ${pubkey} to default server ${settings.defaultServerId}`);
        }
      }
    }
  } catch (err) {
    console.error('[auth] error auto-joining default server:', err);
    // don't block login if auto-join fails
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
