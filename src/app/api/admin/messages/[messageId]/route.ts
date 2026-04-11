import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { getAuthorProfile, SYSTEM_PUBKEY } from '@/lib/profile-sync';

// Admin edit/delete for system-authored content (welcome messages, forum
// indices, announcements). Both handlers enforce a hard guardrail: the
// target message must already be authored by SYSTEM_PUBKEY. Admins cannot
// use this path to silently rewrite user messages — those still go through
// the existing author-only PATCH in /api/channels/[id]/messages and the
// mod-only soft-delete at /api/moderation/messages/[id].

const MAX_CONTENT = 4000;
const MAX_TITLE = 200;

async function loadTargetOrResponse(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      channelId: true,
      authorPubkey: true,
      deletedAt: true,
      title: true,
      channel: { select: { id: true, serverId: true, type: true } },
    },
  });
  if (!message || message.deletedAt) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }
  if (message.authorPubkey !== SYSTEM_PUBKEY) {
    return NextResponse.json(
      { error: 'Only system-authored messages can be edited from this endpoint' },
      { status: 403 },
    );
  }
  return message;
}

// PATCH /api/admin/messages/[messageId]
//
// Body: { content?: string, title?: string, tagIds?: string[] }
//
// - Only system-authored messages may be edited here.
// - Title + tagIds are ignored unless the parent channel is a forum.
// - tagIds, when provided, *replaces* the existing tag set for the post.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const target = await loadTargetOrResponse(messageId);
  if (target instanceof NextResponse) return target;

  const actor = await requireRole(req, target.channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const hasContent = typeof body?.content === 'string';
  const hasTitle = typeof body?.title === 'string';
  const hasTagIds = Array.isArray(body?.tagIds);

  if (!hasContent && !hasTitle && !hasTagIds) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const data: Record<string, unknown> = { editedAt: new Date() };

  if (hasContent) {
    const content = body.content.trim();
    if (!content) return NextResponse.json({ error: 'Content cannot be empty' }, { status: 400 });
    if (content.length > MAX_CONTENT) {
      return NextResponse.json({ error: `Content too long (max ${MAX_CONTENT})` }, { status: 400 });
    }
    data.content = content;
  }

  if (hasTitle) {
    if (target.channel.type !== 'forum') {
      return NextResponse.json({ error: 'Title only valid on forum posts' }, { status: 400 });
    }
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    if (title.length > MAX_TITLE) {
      return NextResponse.json({ error: `Title too long (max ${MAX_TITLE})` }, { status: 400 });
    }
    data.title = title;
  }

  let tagIds: string[] | null = null;
  if (hasTagIds) {
    if (target.channel.type !== 'forum') {
      return NextResponse.json({ error: 'Tags only valid on forum posts' }, { status: 400 });
    }
    tagIds = (body.tagIds as unknown[]).filter((x): x is string => typeof x === 'string');
    if (tagIds.length > 0) {
      const validTags = await prisma.forumTag.findMany({
        where: { channelId: target.channelId, id: { in: tagIds } },
        select: { id: true },
      });
      if (validTags.length !== tagIds.length) {
        return NextResponse.json(
          { error: 'One or more tagIds do not belong to this channel' },
          { status: 400 },
        );
      }
    }
  }

  // Use a transaction when we also need to replace the tag pivot set so
  // readers never observe the post mid-update (no tags, or old+new mixed).
  const updated = await prisma.$transaction(async (tx) => {
    if (tagIds !== null) {
      await tx.forumTagOnMessage.deleteMany({ where: { messageId } });
      if (tagIds.length > 0) {
        await tx.forumTagOnMessage.createMany({
          data: tagIds.map((tagId) => ({ messageId, tagId })),
        });
      }
    }
    return tx.message.update({
      where: { id: messageId },
      data,
      include: {
        replyTo: { select: { id: true, content: true, authorPubkey: true } },
        reactions: {
          select: { id: true, messageId: true, authorPubkey: true, emoji: true },
        },
        tags: { include: { tag: true } },
      },
    });
  });

  const author = await getAuthorProfile(SYSTEM_PUBKEY, target.channel.serverId);
  const enriched = {
    ...updated,
    author,
    tags: updated.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  };

  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${updated.channelId}`).emit('message-edited', enriched);
  }

  return NextResponse.json(enriched);
}

// DELETE /api/admin/messages/[messageId]
//
// Soft-deletes a system-authored message and broadcasts `message-deleted`
// globally via `__emitModEvent` so every connected client removes it,
// matching the existing moderation delete path.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const target = await loadTargetOrResponse(messageId);
  if (target instanceof NextResponse) return target;

  const actor = await requireRole(req, target.channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  (globalThis as any).__emitModEvent?.('message-deleted', {
    messageId,
    channelId: target.channelId,
  });

  return NextResponse.json({ ok: true });
}
