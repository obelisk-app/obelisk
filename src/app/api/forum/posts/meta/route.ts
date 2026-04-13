import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

// GET /api/forum/posts/meta?ids=<id1>,<id2>,...
//
// Batch-resolve minimal metadata (title + channelId + serverId + channelName)
// for a set of forum post IDs. Used by the channel sidebar to render followed
// posts as indented rows under their forum channel, without loading the full
// post body or replies.
//
// Access-checked: only posts whose channel the caller can read are returned.
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  if (ids.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  const posts = await prisma.message.findMany({
    where: { id: { in: ids }, deletedAt: null, title: { not: null } },
    select: {
      id: true,
      title: true,
      coverImage: true,
      channelId: true,
      channel: {
        select: {
          id: true,
          name: true,
          serverId: true,
          readPermission: true,
          readRoleIds: true,
        },
      },
    },
  });

  // Require membership in the post's server to avoid leaking titles across
  // servers the caller never joined. Pre-fetch membership for the server set.
  const serverIds = Array.from(new Set(posts.map((p) => p.channel.serverId)));
  const memberships = await prisma.member.findMany({
    where: { pubkey, serverId: { in: serverIds } },
    select: { serverId: true },
  });
  const memberServerIds = new Set(memberships.map((m) => m.serverId));

  const accessByServer = new Map<string, Awaited<ReturnType<typeof resolveMemberAccess>>>();
  const result: Array<{
    id: string;
    title: string;
    coverImage: string | null;
    channelId: string;
    channelName: string;
    serverId: string;
  }> = [];

  for (const p of posts) {
    if (!memberServerIds.has(p.channel.serverId)) continue;
    if (p.channel.readPermission) {
      let access = accessByServer.get(p.channel.serverId);
      if (!access) {
        access = await resolveMemberAccess(pubkey, p.channel.serverId);
        accessByServer.set(p.channel.serverId, access);
      }
      if (!canReadChannel(access.role, p.channel, access.customRoleIds)) continue;
    }
    result.push({
      id: p.id,
      title: p.title!,
      coverImage: p.coverImage ?? null,
      channelId: p.channelId,
      channelName: p.channel.name,
      serverId: p.channel.serverId,
    });
  }

  return NextResponse.json({ posts: result });
}
