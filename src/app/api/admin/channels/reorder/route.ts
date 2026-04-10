import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

// PATCH /api/admin/channels/reorder — batch update channel positions.
// Derives serverId from the channels themselves and rejects cross-server batches.
export async function PATCH(req: NextRequest) {
  const { channels } = await req.json();

  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: 'channels array required' }, { status: 400 });
  }

  const ids = channels.map((c: { id: string }) => c.id);
  const existing = await prisma.channel.findMany({
    where: { id: { in: ids } },
    select: { id: true, serverId: true },
  });

  if (existing.length !== ids.length) {
    return NextResponse.json({ error: 'One or more channels not found' }, { status: 404 });
  }

  const serverIds = new Set(existing.map((c) => c.serverId));
  if (serverIds.size !== 1) {
    return NextResponse.json(
      { error: 'All channels must belong to the same server' },
      { status: 400 }
    );
  }
  const serverId = existing[0].serverId;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

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
