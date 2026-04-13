import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

const VALID_TYPES = ['text', 'voice', 'forum'];
const VALID_WRITE_PERMISSIONS = ['everyone', 'mod', 'admin', 'roles'];
const VALID_READ_PERMISSIONS = ['everyone', 'mod', 'admin', 'roles'];

// PATCH /api/admin/channels/[id] — edit a channel
// (serverId is derived from the resource)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const actor = await requireRole(req, channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json();
  const data: Record<string, any> = {};

  if (body.name !== undefined) {
    data.name = String(body.name).toLowerCase().replace(/\s+/g, '-');
  }
  if (body.emoji !== undefined) {
    data.emoji = body.emoji || null;
  }
  if (body.description !== undefined) {
    if (body.description === null || body.description === '') {
      data.description = null;
    } else if (typeof body.description === 'string') {
      const trimmed = body.description.trim();
      if (trimmed.length > 1024) {
        return NextResponse.json({ error: 'Description too long (max 1024 chars)' }, { status: 400 });
      }
      data.description = trimmed || null;
    } else {
      return NextResponse.json({ error: 'Invalid description' }, { status: 400 });
    }
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
  if (body.writePermission !== undefined) {
    if (body.writePermission === null) {
      data.writePermission = null;
    } else if (typeof body.writePermission === 'string' && VALID_WRITE_PERMISSIONS.includes(body.writePermission)) {
      // Normalize "everyone" → null so the default has a single canonical form.
      data.writePermission = body.writePermission === 'everyone' ? null : body.writePermission;
    } else {
      return NextResponse.json(
        { error: `Invalid writePermission. Must be one of: ${VALID_WRITE_PERMISSIONS.join(', ')}` },
        { status: 400 }
      );
    }
  }
  if (body.writeRoleIds !== undefined) {
    if (!Array.isArray(body.writeRoleIds) || !body.writeRoleIds.every((x: unknown) => typeof x === 'string')) {
      return NextResponse.json({ error: 'writeRoleIds must be an array of strings' }, { status: 400 });
    }
    const unique = Array.from(new Set(body.writeRoleIds as string[]));
    if (unique.length > 0) {
      const valid = await prisma.customRole.findMany({
        where: { id: { in: unique }, serverId: channel.serverId },
        select: { id: true },
      });
      if (valid.length !== unique.length) {
        return NextResponse.json({ error: 'One or more writeRoleIds invalid for this server' }, { status: 400 });
      }
    }
    data.writeRoleIds = unique;
  }
  if (body.readPermission !== undefined) {
    if (body.readPermission === null) {
      data.readPermission = null;
    } else if (typeof body.readPermission === 'string' && VALID_READ_PERMISSIONS.includes(body.readPermission)) {
      data.readPermission = body.readPermission === 'everyone' ? null : body.readPermission;
    } else {
      return NextResponse.json(
        { error: `Invalid readPermission. Must be one of: ${VALID_READ_PERMISSIONS.join(', ')}` },
        { status: 400 }
      );
    }
  }
  if (body.readRoleIds !== undefined) {
    if (!Array.isArray(body.readRoleIds) || !body.readRoleIds.every((x: unknown) => typeof x === 'string')) {
      return NextResponse.json({ error: 'readRoleIds must be an array of strings' }, { status: 400 });
    }
    const unique = Array.from(new Set(body.readRoleIds as string[]));
    if (unique.length > 0) {
      const valid = await prisma.customRole.findMany({
        where: { id: { in: unique }, serverId: channel.serverId },
        select: { id: true },
      });
      if (valid.length !== unique.length) {
        return NextResponse.json({ error: 'One or more readRoleIds invalid for this server' }, { status: 400 });
      }
    }
    data.readRoleIds = unique;
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
  const { id } = await params;

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const actor = await requireRole(req, channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  await prisma.channel.delete({ where: { id } });

  const emitModEvent = (globalThis as any).__emitModEvent;
  if (emitModEvent) emitModEvent('channel-deleted', { channelId: id });

  return NextResponse.json({ ok: true });
}
