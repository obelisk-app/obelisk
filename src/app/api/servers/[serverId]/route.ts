import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

// GET /api/servers/:serverId — server info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true, name: true, icon: true, banner: true, joinMode: true, ownerPubkey: true,
      _count: { select: { members: true } },
    },
  });

  if (!server) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ server });
}

// PATCH /api/servers/:serverId — update server (admin+ only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { name, icon, joinMode } = await req.json();
  const data: Record<string, any> = {};
  if (name !== undefined) data.name = name;
  if (icon !== undefined) data.icon = icon;
  if (joinMode !== undefined) data.joinMode = joinMode;

  const server = await prisma.server.update({
    where: { id: serverId },
    data,
    select: { id: true, name: true, icon: true, banner: true },
  });

  return NextResponse.json({ server });
}

// DELETE /api/servers/:serverId — delete server (owner only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'owner');
  if (actor instanceof NextResponse) return actor;

  await prisma.server.delete({ where: { id: serverId } });
  return NextResponse.json({ ok: true });
}
