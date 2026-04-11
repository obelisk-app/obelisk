import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getAuthorProfile } from '@/lib/profile-sync';

// GET /api/channels/:channelId/pins — list pinned messages for a channel.
//
// Any authenticated user who can see the channel can read the pins list.
// Messages are returned newest-pinned-first and include the author profile
// so the pinned drawer can render instantly.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null, pinnedAt: { not: null } },
    orderBy: { pinnedAt: 'desc' },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  // Enrich with author profile per message. Usually the pinned list is
  // small (Discord caps at 50), so the extra round-trips are fine. Cache by
  // pubkey inside this request — store the PROMISE, not the resolved value,
  // so parallel calls for the same author share a single DB round-trip.
  const cache = new Map<string, ReturnType<typeof getAuthorProfile>>();
  const enriched = await Promise.all(
    messages.map(async (m) => {
      let authorPromise = cache.get(m.authorPubkey);
      if (!authorPromise) {
        authorPromise = getAuthorProfile(m.authorPubkey, channel.serverId);
        cache.set(m.authorPubkey, authorPromise);
      }
      return { ...m, author: await authorPromise };
    }),
  );

  return NextResponse.json({ messages: enriched });
}
