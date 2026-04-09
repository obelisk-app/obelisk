import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/channels/:channelId/voice — get current voice participants
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const participants = await prisma.voiceState.findMany({
    where: { channelId },
    select: {
      pubkey: true,
      muted: true,
      deafened: true,
      joinedAt: true,
    },
    orderBy: { joinedAt: 'asc' },
  });

  return NextResponse.json({ participants });
}
