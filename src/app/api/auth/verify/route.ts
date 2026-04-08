import { NextRequest, NextResponse } from 'next/server';
import { verifySignedEvent } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { challengeId, signedEvent } = await req.json();

  if (!challengeId || !signedEvent) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const token = await verifySignedEvent(challengeId, signedEvent);
  if (!token) {
    return NextResponse.json({ error: 'Invalid signature or expired challenge' }, { status: 401 });
  }

  // Auto-join the default server as a member (if not banned and server allows it)
  const server = await prisma.server.findFirst();
  if (server) {
    // Check if user is banned
    const ban = await prisma.ban.findUnique({
      where: { serverId_pubkey: { serverId: server.id, pubkey: signedEvent.pubkey } },
    });
    if (ban) {
      return NextResponse.json({ error: 'You are banned from this server' }, { status: 403 });
    }

    // Check join mode — invite-only blocks new members (existing members can still log in)
    const existingMember = await prisma.member.findUnique({
      where: { serverId_pubkey: { serverId: server.id, pubkey: signedEvent.pubkey } },
    });

    if (!existingMember && server.joinMode === 'invite-only') {
      return NextResponse.json({ error: 'This server is invite-only' }, { status: 403 });
    }

    if (!existingMember) {
      await prisma.member.create({
        data: { serverId: server.id, pubkey: signedEvent.pubkey, role: 'member' },
      });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}
