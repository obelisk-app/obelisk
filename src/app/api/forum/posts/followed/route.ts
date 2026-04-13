import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

// GET /api/forum/posts/followed?serverId=<id?>
//
// Returns the viewer's followed forum posts with enough metadata to render
// indented subchannel rows in ChannelSidebar. `serverId` optionally scopes
// the response; omitted = all servers the viewer follows posts in.
export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[api/forum/posts/followed] 500', err);
    return NextResponse.json(
      { error: 'Internal error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function handle(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const serverIdFilter = searchParams.get('serverId') || null;

  const subs = await prisma.postSubscription.findMany({
    where: { pubkey },
    select: { postId: true, lastReadAt: true },
  });
  const postIds = subs.map((s) => s.postId);
  const posts = postIds.length
    ? await prisma.message.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true, title: true, coverImage: true, deletedAt: true,
          channel: {
            select: {
              id: true, name: true, serverId: true,
              readPermission: true, readRoleIds: true,
            },
          },
        },
      })
    : [];
  const postById = new Map(posts.map((p) => [p.id, p]));

  // Note: we used to also filter by Member rows here, but that hides
  // subscriptions for users who follow a post before their Member row
  // is created (e.g. auto-follow on send races membership auto-creation).
  // The POST /follow endpoint already gates on membership, so any row
  // present here was authorized at creation time.
  const accessByServer = new Map<string, Awaited<ReturnType<typeof resolveMemberAccess>>>();
  const result: Array<{
    id: string;
    title: string;
    coverImage: string | null;
    channelId: string;
    channelName: string;
    serverId: string;
    unreadCount: number;
    lastReadAt: string | null;
  }> = [];

  const visibleSubs: Array<{
    id: string;
    title: string;
    coverImage: string | null;
    channelId: string;
    channelName: string;
    serverId: string;
    lastReadAt: Date | null;
  }> = [];

  for (const s of subs) {
    const p = postById.get(s.postId);
    if (!p || p.deletedAt || !p.title) continue;
    if (serverIdFilter && p.channel.serverId !== serverIdFilter) continue;
    if (p.channel.readPermission) {
      let access = accessByServer.get(p.channel.serverId);
      if (!access) {
        access = await resolveMemberAccess(pubkey, p.channel.serverId);
        accessByServer.set(p.channel.serverId, access);
      }
      if (!canReadChannel(access.role, p.channel, access.customRoleIds)) continue;
    }
    visibleSubs.push({
      id: p.id,
      title: p.title,
      coverImage: p.coverImage ?? null,
      channelId: p.channel.id,
      channelName: p.channel.name,
      serverId: p.channel.serverId,
      lastReadAt: s.lastReadAt ?? null,
    });
  }

  // Batch-count unread replies (messages with replyToId === postId and not by
  // the viewer) per followed post, filtered by lastReadAt when present.
  const unreadCounts: Record<string, number> = {};
  for (const sub of visibleSubs) {
    const where: {
      replyToId: string;
      deletedAt: null;
      authorPubkey: { not: string };
      createdAt?: { gt: Date };
    } = {
      replyToId: sub.id,
      deletedAt: null,
      authorPubkey: { not: pubkey },
    };
    if (sub.lastReadAt) where.createdAt = { gt: sub.lastReadAt };
    unreadCounts[sub.id] = await prisma.message.count({ where });
  }

  for (const sub of visibleSubs) {
    result.push({
      id: sub.id,
      title: sub.title,
      coverImage: sub.coverImage,
      channelId: sub.channelId,
      channelName: sub.channelName,
      serverId: sub.serverId,
      unreadCount: unreadCounts[sub.id] ?? 0,
      lastReadAt: sub.lastReadAt ? sub.lastReadAt.toISOString() : null,
    });
  }

  return NextResponse.json({ posts: result });
}
