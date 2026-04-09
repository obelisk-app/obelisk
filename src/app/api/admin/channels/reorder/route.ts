import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// PATCH /api/admin/channels/reorder — batch update channel positions
export async function PATCH(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { channels } = await req.json();

  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: 'channels array required' }, { status: 400 });
  }

  await prisma.$transaction(
    channels.map((ch: { id: string; position: number; categoryId?: string | null }) =>
      prisma.channel.update({
        where: { id: ch.id },
        data: {
          position: ch.position,
          ...(ch.categoryId !== undefined ? { categoryId: ch.categoryId || null } : {}),
        },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
