import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

// PATCH /api/admin/categories/[id] — edit a category
// (serverId is derived from the resource — no query param needed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  const actor = await requireRole(req, category.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json();
  const data: Record<string, any> = {};

  if (body.name !== undefined) {
    data.name = String(body.name).trim();
  }
  if (body.position !== undefined) {
    data.position = Number(body.position);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const updated = await prisma.category.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/admin/categories/[id] — delete a category (channels become uncategorized)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  const actor = await requireRole(req, category.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  // Channels become uncategorized via onDelete: SetNull on the FK
  await prisma.category.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
