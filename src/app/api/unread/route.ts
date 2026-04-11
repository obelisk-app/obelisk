import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/unread — bulk fetch all unread counts for the authenticated user
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all servers the user is a member of
  const memberships = await prisma.member.findMany({
    where: { pubkey },
    select: { serverId: true },
  });
  const serverIds = memberships.map(m => m.serverId);

  // Get all channels in those servers
  const channels = await prisma.channel.findMany({
    where: { serverId: { in: serverIds }, type: { in: ['text', 'forum'] } },
    select: { id: true },
  });
  const channelIds = channels.map(c => c.id);

  // Get user's read states
  const readStates = await prisma.channelReadState.findMany({
    where: { pubkey, channelId: { in: channelIds } },
  });
  const readStateMap = new Map(readStates.map(rs => [rs.channelId, rs]));

  // Count unread messages per channel
  const channelUnreads: Record<string, number> = {};
  const mentionChannels: Record<string, boolean> = {};

  await Promise.all(
    channelIds.map(async (channelId) => {
      const readState = readStateMap.get(channelId);
      const lastReadAt = readState?.lastReadAt ?? new Date(0);

      const [unreadCount, mentionCount] = await Promise.all([
        prisma.message.count({
          where: {
            channelId,
            createdAt: { gt: lastReadAt },
            deletedAt: null,
            authorPubkey: { not: pubkey },
          },
        }),
        prisma.mention.count({
          where: {
            channelId,
            pubkey,
            createdAt: { gt: lastReadAt },
          },
        }),
      ]);

      if (unreadCount > 0) {
        channelUnreads[channelId] = unreadCount;
      }
      if (mentionCount > 0) {
        mentionChannels[channelId] = true;
      }
    })
  );

  // DM read state: we never decrypt DM content server-side, so we can't
  // count messages here. Instead we return (a) a per-thread `lastReadAt`
  // timestamp (in unix ms) so the client can compute real unread counts
  // against its local Nostr cache, and (b) a legacy `dms` binary map for
  // any consumer that hasn't migrated yet (thread flagged when server-known
  // activity is newer than lastRead).
  const dmThreads = await prisma.directMessageThread.findMany({
    where: {
      OR: [{ participant1: pubkey }, { participant2: pubkey }],
    },
  });

  const dmReadStates = await prisma.dMReadState.findMany({
    where: { pubkey },
  });
  const dmReadMap = new Map(dmReadStates.map(rs => [rs.threadPubkey, rs.lastReadAt]));

  const dmLastReadAt: Record<string, number> = {};
  const dms: Record<string, number> = {};
  for (const thread of dmThreads) {
    const otherPubkey = thread.participant1 === pubkey ? thread.participant2 : thread.participant1;
    const lastRead = dmReadMap.get(otherPubkey);
    dmLastReadAt[otherPubkey] = lastRead ? lastRead.getTime() : 0;
    if (thread.updatedAt > (lastRead ?? new Date(0))) {
      dms[otherPubkey] = 1;
    }
  }

  return NextResponse.json({ channels: channelUnreads, dms, dmLastReadAt, mentionChannels });
}
