import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// POST /api/servers/:serverId/leave — leave a server
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { serverId } = await params;

  // Owner cannot leave their own server
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerPubkey: true },
  });

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  if (server.ownerPubkey === pubkey) {
    return NextResponse.json({ error: 'Owner cannot leave. Transfer ownership or delete the server.' }, { status: 400 });
  }

  await prisma.member.deleteMany({
    where: { serverId, pubkey },
  });

  return NextResponse.json({ ok: true });
}
