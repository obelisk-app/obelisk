import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getAuthorProfile } from '@/lib/profile-sync';
import { canWriteInChannel, getAuthMember } from '@/lib/auth-roles';
import { resolveForumTagIds } from '@/lib/forum-tags';
import { fanOutMentions, fanOutChannelUnread } from '@/lib/mention-fanout';
import { ServerToClient } from '@/lib/socket-events';

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

  // Collect every message in the thread via BFS so that nested replies
  // (reply-to-reply) are included, not only direct children of the OP.
  const threadIds: string[] = [];
  let frontier: string[] = [postId];
  while (frontier.length > 0) {
    const next = await prisma.message.findMany({
      where: { replyToId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    const newIds = next.map((n) => n.id).filter((id) => !threadIds.includes(id));
    if (newIds.length === 0) break;
    threadIds.push(...newIds);
    frontier = newIds;
  }

  const replies = await prisma.message.findMany({
    where: { id: { in: threadIds }, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
      replyTo: {
        select: { id: true, content: true, authorPubkey: true },
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

  const body = await parseJsonBody(req);
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
    select: {
      id: true, name: true, serverId: true, writePermission: true, writeRoleIds: true,
      readPermission: true, readRoleIds: true,
    },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Verify post exists
  const post = await prisma.message.findUnique({ where: { id: postId }, select: { id: true, channelId: true, title: true } });
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

  const { content, replyToId: rawReplyToId } = await req.json();
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  // Resolve the reply target. Defaults to the post itself (top-level reply).
  // If the client supplies a replyToId, it must belong to this thread:
  // either it's the post, or its own replyToId chains back to the post.
  let finalReplyToId = postId;
  if (rawReplyToId && typeof rawReplyToId === 'string' && rawReplyToId !== postId) {
    const target = await prisma.message.findUnique({
      where: { id: rawReplyToId },
      select: { id: true, channelId: true, deletedAt: true, replyToId: true },
    });
    if (!target || target.channelId !== channelId || target.deletedAt) {
      return NextResponse.json({ error: 'Invalid replyToId' }, { status: 400 });
    }
    // Walk up to ensure target is rooted at this post (bounded walk).
    let cursor: { replyToId: string | null } | null = target;
    let inThread = false;
    for (let i = 0; i < 50 && cursor; i++) {
      if (cursor.replyToId === postId) { inThread = true; break; }
      if (!cursor.replyToId) break;
      cursor = await prisma.message.findUnique({
        where: { id: cursor.replyToId },
        select: { replyToId: true },
      });
    }
    if (!inThread) {
      return NextResponse.json({ error: 'Reply target not in this thread' }, { status: 400 });
    }
    finalReplyToId = rawReplyToId;
  }

  const reply = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      content: content.trim(),
      replyToId: finalReplyToId,
    },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
    },
  });

  // Attach author profile for real-time clients
  const author = await getAuthorProfile(pubkey, channel.serverId);
  const enriched = { ...reply, author };

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit(ServerToClient.NewMessage, enriched);

    // Mention fan-out (unconditional — not gated by subscription).
    let mentionedPubkeys = new Set<string>();
    try {
      const result = await fanOutMentions({
        prisma,
        io,
        messageId: reply.id,
        channelId,
        serverId: channel.serverId,
        authorPubkey: pubkey,
        content: reply.content,
        postId,
        postMeta: {
          title: post.title ?? '',
          channelName: channel.name,
        },
        replyToAuthorPubkey: reply.replyTo?.authorPubkey ?? null,
        channel: {
          readPermission: channel.readPermission,
          readRoleIds: channel.readRoleIds,
        },
        createdAt: reply.createdAt,
      });
      mentionedPubkeys = new Set(result.mentionedPubkeys);
    } catch (err) {
      console.error('[posts/postId POST] mention fan-out failed', err);
    }

    // Channel-level unread fan-out: bumps parent forum channel count for
    // users not currently in the channel room.
    try {
      await fanOutChannelUnread({
        prisma,
        io,
        channelId,
        serverId: channel.serverId,
        authorPubkey: pubkey,
        content: reply.content,
        mentionedPubkeys,
        channel: {
          readPermission: channel.readPermission,
          readRoleIds: channel.readRoleIds,
        },
      });
    } catch (err) {
      console.error('[posts/postId POST] channel unread fan-out failed', err);
    }

    // Subscriber fan-out for non-mentioned subscribers: emit `post-unread`
    // so their thread row bumps even if they weren't @-mentioned. Already-
    // mentioned subscribers got a `post-unread` (with hasMention: true) from
    // fanOutMentions above, so we skip them here to avoid a double-bump.
    try {
      const subs = await prisma.postSubscription.findMany({
        where: { postId, pubkey: { not: pubkey } },
        select: { pubkey: true },
      });
      for (const s of subs) {
        if (mentionedPubkeys.has(s.pubkey)) continue;
        io.to(`pubkey:${s.pubkey}`).emit(ServerToClient.PostUnread, {
          recipientPubkey: s.pubkey,
          postId,
          messageId: reply.id,
          authorPubkey: pubkey,
          hasMention: false,
        });
      }
    } catch (err) {
      console.error('[posts/postId POST] subscriber fan-out failed', err);
    }
  }

  return NextResponse.json(enriched, { status: 201 });
}
