import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

// PATCH /api/admin/categories/reorder — batch update category positions.
// Derives serverId from the categories themselves and rejects cross-server batches.
export async function PATCH(req: NextRequest) {
  const { categories } = await req.json();

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: 'categories array required' }, { status: 400 });
  }

  const ids = categories.map((c: { id: string }) => c.id);
  const existing = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, serverId: true },
  });

  if (existing.length !== ids.length) {
    return NextResponse.json({ error: 'One or more categories not found' }, { status: 404 });
  }

  const serverIds = new Set(existing.map((c) => c.serverId));
  if (serverIds.size !== 1) {
    return NextResponse.json(
      { error: 'All categories must belong to the same server' },
      { status: 400 }
    );
  }
  const serverId = existing[0].serverId;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  await prisma.$transaction(
    categories.map((cat: { id: string; position: number }) =>
      prisma.category.update({
        where: { id: cat.id },
        data: { position: cat.position },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
