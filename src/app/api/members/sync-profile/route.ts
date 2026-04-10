import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// POST /api/members/sync-profile — save a Nostr profile fetched client-side
export async function POST(req: NextRequest) {
  const authPubkey = await getAuthPubkey(req);
  if (!authPubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const { pubkey, name, picture } = await req.json();
  if (!pubkey || typeof pubkey !== 'string') {
    return NextResponse.json({ error: 'Missing pubkey' }, { status: 400 });
  }

  await prisma.member.updateMany({
    where: { serverId: server.id, pubkey },
    data: {
      ...(name ? { displayName: name } : {}),
      ...(picture ? { picture } : {}),
      profileUpdatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
