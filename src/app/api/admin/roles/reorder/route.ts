import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

// PATCH /api/admin/roles/reorder — batch update custom role priorities.
// Body: { roles: [{ id, priority }] }. Derives serverId from the roles and
// rejects cross-server batches.
export async function PATCH(req: NextRequest) {
  const { roles } = await req.json();

  if (!Array.isArray(roles) || roles.length === 0) {
    return NextResponse.json({ error: 'roles array required' }, { status: 400 });
  }

  const ids = roles.map((r: { id: string }) => r.id);
  const existing = await prisma.customRole.findMany({
    where: { id: { in: ids } },
    select: { id: true, serverId: true },
  });

  if (existing.length !== ids.length) {
    return NextResponse.json({ error: 'One or more roles not found' }, { status: 404 });
  }

  const serverIds = new Set(existing.map((r) => r.serverId));
  if (serverIds.size !== 1) {
    return NextResponse.json(
      { error: 'All roles must belong to the same server' },
      { status: 400 }
    );
  }
  const serverId = existing[0].serverId;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  await prisma.$transaction(
    roles.map((r: { id: string; priority: number }) =>
      prisma.customRole.update({
        where: { id: r.id },
        data: { priority: r.priority },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
