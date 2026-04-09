import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// POST /api/servers/:serverId/join — join an open server
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { serverId } = await params;
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, name: true, icon: true, banner: true, joinMode: true },
  });

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  if (server.joinMode !== 'open') {
    return NextResponse.json({ error: 'This server requires an invitation' }, { status: 403 });
  }

  // Check ban
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (ban) {
    return NextResponse.json({ error: 'You are banned from this server' }, { status: 403 });
  }

  // Upsert member (idempotent)
  await prisma.member.upsert({
    where: { serverId_pubkey: { serverId, pubkey } },
    update: {},
    create: { serverId, pubkey, role: 'member' },
  });

  return NextResponse.json({ server: { id: server.id, name: server.name, icon: server.icon, banner: server.banner } });
}
