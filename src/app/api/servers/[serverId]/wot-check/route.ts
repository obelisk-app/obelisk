import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInWot, maybeAutoRefreshWot } from '@/lib/wot';
import { prisma } from '@/lib/db';

// GET /api/servers/:serverId/wot-check — check if the authed user is in this server's WoT
export async function GET(
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
    select: { id: true, wotEnabled: true, referentePubkey: true },
  });
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  // Trigger background refresh if cache is stale.
  maybeAutoRefreshWot(serverId).catch(() => {});

  const check = await isInWot(serverId, pubkey);
  return NextResponse.json({
    wotEnabled: server.wotEnabled,
    hasReferente: !!server.referentePubkey,
    ...check,
  });
}
