import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

// POST /api/forum/posts/[postId]/follow — toggle subscription.
//
// Requires membership in the post's server. If the post's channel has a
// readPermission that excludes the caller, returns 403 — you shouldn't be
// able to subscribe to notifications for a post you can't read.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const post = await prisma.message.findUnique({
    where: { id: postId },
    select: {
      id: true, title: true, deletedAt: true,
      channel: {
        select: {
          id: true, serverId: true, readPermission: true, readRoleIds: true,
        },
      },
    },
  });
  if (!post || post.deletedAt || post.title == null) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Must be a member of the server.
  const member = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId: post.channel.serverId, pubkey } },
    select: { id: true },
  });
  if (!member) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }

  if (post.channel.readPermission) {
    const access = await resolveMemberAccess(pubkey, post.channel.serverId);
    if (!canReadChannel(access.role, post.channel, access.customRoleIds)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const existing = await prisma.postSubscription.findUnique({
    where: { postId_pubkey: { postId, pubkey } },
  });
  if (existing) {
    await prisma.postSubscription.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }
  await prisma.postSubscription.create({ data: { postId, pubkey } });
  return NextResponse.json({ following: true });
}
