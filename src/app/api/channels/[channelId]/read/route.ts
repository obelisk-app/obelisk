import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// POST /api/channels/:channelId/read — mark channel as read
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  await prisma.channelReadState.upsert({
    where: { channelId_pubkey: { channelId, pubkey } },
    create: {
      channelId,
      pubkey,
      lastReadAt: new Date(),
      lastReadMessageId: body.lastMessageId ?? null,
    },
    update: {
      lastReadAt: new Date(),
      lastReadMessageId: body.lastMessageId ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
