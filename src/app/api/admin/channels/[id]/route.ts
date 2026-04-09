import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

const VALID_TYPES = ['text', 'voice', 'forum'];

// PATCH /api/admin/channels/[id] — edit a channel
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel || channel.serverId !== serverId) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, any> = {};

  if (body.name !== undefined) {
    data.name = String(body.name).toLowerCase().replace(/\s+/g, '-');
  }
  if (body.emoji !== undefined) {
    data.emoji = body.emoji || null;
  }
  if (body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }
    data.type = body.type;
  }
  if (body.categoryId !== undefined) {
    data.categoryId = body.categoryId || null;
  }
  if (body.position !== undefined) {
    data.position = Number(body.position);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const updated = await prisma.channel.update({ where: { id }, data });

  const emitModEvent = (globalThis as any).__emitModEvent;
  if (emitModEvent) emitModEvent('channel-updated', { channelId: id });

  return NextResponse.json(updated);
}

// DELETE /api/admin/channels/[id] — delete a channel
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel || channel.serverId !== serverId) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  await prisma.channel.delete({ where: { id } });

  const emitModEvent = (globalThis as any).__emitModEvent;
  if (emitModEvent) emitModEvent('channel-deleted', { channelId: id });

  return NextResponse.json({ ok: true });
}
