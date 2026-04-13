import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';

// DELETE /api/channels/:channelId/messages/:messageId
// Soft-delete a message (author, server owner, admin, mod, or instance owner).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId, messageId } = await params;

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      authorPubkey: true,
      channelId: true,
      deletedAt: true,
      channel: { select: { serverId: true } },
    },
  });

  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  let allowed = existing.authorPubkey === pubkey;
  if (!allowed) {
    const server = await prisma.server.findUnique({
      where: { id: existing.channel.serverId },
      select: { ownerPubkey: true },
    });
    allowed = server?.ownerPubkey === pubkey || isInstanceOwner(pubkey);
    if (!allowed) {
      const member = await prisma.member.findUnique({
        where: { serverId_pubkey: { serverId: existing.channel.serverId, pubkey } },
        select: { role: true },
      });
      const role = member?.role as string | undefined;
      allowed = role === 'owner' || role === 'admin' || role === 'mod';
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
