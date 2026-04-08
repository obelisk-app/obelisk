import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// PATCH /api/members/me — update own profile in Member table
export async function PATCH(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { displayName, picture, nip05 } = await req.json();

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const member = await prisma.member.update({
    where: { serverId_pubkey: { serverId: server.id, pubkey } },
    data: {
      displayName: displayName || null,
      picture: picture || null,
      nip05: nip05 || null,
    },
  });

  return NextResponse.json({
    pubkey: member.pubkey,
    displayName: member.displayName,
    picture: member.picture,
    nip05: member.nip05,
  });
}
