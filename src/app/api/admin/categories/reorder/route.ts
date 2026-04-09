import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// PATCH /api/admin/categories/reorder — batch update category positions
export async function PATCH(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { categories } = await req.json();

  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: 'categories array required' }, { status: 400 });
  }

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
