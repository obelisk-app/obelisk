import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/members — list all members of the current server
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const members = await prisma.member.findMany({
    where: { serverId: server.id },
    select: {
      pubkey: true,
      role: true,
      displayName: true,
      picture: true,
      nip05: true,
      joinedAt: true,
    },
    orderBy: { joinedAt: 'asc' },
  });

  return NextResponse.json({ members });
}
