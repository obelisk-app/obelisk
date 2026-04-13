import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getAuthorProfile } from '@/lib/profile-sync';
import { canWriteInChannel, getAuthMember } from '@/lib/auth-roles';
import { resolveForumTagIds } from '@/lib/forum-tags';

// GET /api/channels/[channelId]/posts/[postId] — get a forum post with replies
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId, postId } = await params;

  const post = await prisma.message.findUnique({
    where: { id: postId },
    select: {
      id: true, channelId: true, authorPubkey: true, title: true,
      coverImage: true, content: true, createdAt: true, deletedAt: true,
      editedAt: true,
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  if (!post || post.channelId !== channelId || post.deletedAt) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const replies = await prisma.message.findMany({
    where: { replyToId: postId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  const hasMore = replies.length > limit;
  if (hasMore) replies.pop();

  return NextResponse.json({
    post: {
      id: post.id,
      channelId: post.channelId,
      authorPubkey: post.authorPubkey,
      title: post.title,
      coverImage: post.coverImage,
      content: post.content,
      createdAt: post.createdAt,
      editedAt: post.editedAt,
      reactions: post.reactions,
    },
    replies,
    hasMore,
  });
}

// PATCH /api/channels/[channelId]/posts/[postId] — edit title and/or coverImage.
// Allowed for: the post's author, server mods, server admins, server owner,
// and the instance owner. content edits are out of scope for this endpoint
// (replies/chat edits go through the messages route).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId, postId } = await params;

  const post = await prisma.message.findUnique({
    where: { id: postId },
    select: {
      id: true, channelId: true, authorPubkey: true, title: true,
      coverImage: true, deletedAt: true,
    },
  });
  if (!post || post.channelId !== channelId || post.deletedAt) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true, type: true },
  });
  if (!channel || channel.type !== 'forum') {
    return NextResponse.json({ error: 'Not a forum channel' }, { status: 400 });
  }

  const authMember = await getAuthMember(req, channel.serverId);
  const role = authMember?.role ?? 'member';
  const isAuthor = post.authorPubkey === pubkey;
  const isStaff = role === 'owner' || role === 'admin' || role === 'mod';
  if (!isAuthor && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: { title?: string; coverImage?: string | null; editedAt?: Date } = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    updates.title = body.title.trim();
  }
  if (body.coverImage !== undefined) {
    if (body.coverImage === null || body.coverImage === '') {
      updates.coverImage = null;
    } else if (typeof body.coverImage !== 'string') {
      return NextResponse.json({ error: 'Invalid coverImage' }, { status: 400 });
    } else {
      updates.coverImage = body.coverImage.trim();
    }
  }
  const wantsTagUpdate = body.tagIds !== undefined || body.tagNames !== undefined;

  if (Object.keys(updates).length === 0 && !wantsTagUpdate) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 });
  }
  updates.editedAt = new Date();

  if (wantsTagUpdate) {
    const resolvedTagIds = await resolveForumTagIds(channelId, body.tagIds, body.tagNames);
    await prisma.$transaction([
      prisma.forumTagOnMessage.deleteMany({ where: { messageId: postId } }),
      ...(resolvedTagIds.length > 0
        ? [
            prisma.forumTagOnMessage.createMany({
              data: resolvedTagIds.map((tagId) => ({ messageId: postId, tagId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  const updated = await prisma.message.update({
    where: { id: postId },
    data: updates,
    select: {
      id: true, title: true, coverImage: true, content: true,
      editedAt: true, authorPubkey: true, channelId: true, createdAt: true,
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json({
    post: {
      ...updated,
      tags: updated.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    },
  });
}

// POST /api/channels/[channelId]/posts/[postId] — reply to a forum post
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId, postId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true, writePermission: true, writeRoleIds: true },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Verify post exists
  const post = await prisma.message.findUnique({ where: { id: postId }, select: { id: true, channelId: true } });
  if (!post || post.channelId !== channelId) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Ban/mute check
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: channel.serverId, pubkey } },
  });
  if (ban) return NextResponse.json({ error: 'You are banned' }, { status: 403 });

  const mute = await prisma.mute.findFirst({
    where: { serverId: channel.serverId, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
  });
  if (mute) return NextResponse.json({ error: 'You are muted', mutedUntil: mute.expiresAt }, { status: 403 });

  // Channel-level write permission
  if (channel.writePermission) {
    const authMember = await getAuthMember(req, channel.serverId);
    const role = authMember?.role ?? 'member';
    let memberCustomRoleIds: string[] = [];
    if (channel.writePermission === 'roles' && authMember?.id) {
      const links = await prisma.memberCustomRole.findMany({
        where: { memberId: authMember.id },
        select: { roleId: true },
      });
      memberCustomRoleIds = links.map((l) => l.roleId);
    }
    if (
      !canWriteInChannel(
        role,
        { writePermission: channel.writePermission, writeRoleIds: channel.writeRoleIds },
        memberCustomRoleIds
      )
    ) {
      return NextResponse.json({ error: 'channel_write_locked' }, { status: 403 });
    }
  }

  const { content } = await req.json();
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  const reply = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      content: content.trim(),
      replyToId: postId,
    },
  });

  // Attach author profile for real-time clients
  const author = await getAuthorProfile(pubkey, channel.serverId);
  const enriched = { ...reply, author };

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit('new-message', enriched);

    // Notification fan-out: emit `post-reply` to every subscriber of the
    // parent post (excluding the reply's author — they don't need to be
    // notified of their own reply). Rooms are joined per-pubkey on
    // connection (see server.ts), so we can target by pubkey directly.
    try {
      const subs = await prisma.postSubscription.findMany({
        where: { postId, pubkey: { not: pubkey } },
        select: { pubkey: true },
      });
      const payload = {
        postId,
        channelId,
        serverId: channel.serverId,
        replyId: reply.id,
        replyAuthorPubkey: pubkey,
        replyContent: reply.content.slice(0, 200),
        postTitle: null as string | null,
      };
      // Title is useful for notification UX; fetch once.
      const post = await prisma.message.findUnique({
        where: { id: postId },
        select: { title: true },
      });
      if (post) payload.postTitle = post.title;
      for (const s of subs) {
        io.to(`pubkey:${s.pubkey}`).emit('post-reply', payload);
      }
    } catch {
      // Fan-out is best-effort — failure must not block the reply POST.
    }
  }

  return NextResponse.json(enriched, { status: 201 });
}
