import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

interface RouteContext {
  params: Promise<{ roleId: string }>;
}

// PATCH /api/admin/roles/[roleId] — update a custom role (admin+)
// Body: { name?, color?, icon?, priority? }
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { roleId } = await ctx.params;

  const role = await prisma.customRole.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ error: 'role not found' }, { status: 404 });
  }

  const result = await requireRole(req, role.serverId, 'admin');
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const { name, color, icon, priority } = body as {
    name?: string;
    color?: string;
    icon?: string | null;
    priority?: number;
  };

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    }
    if (name.trim().length > 32) {
      return NextResponse.json({ error: 'name must be 32 characters or fewer' }, { status: 400 });
    }
    // Check for duplicate name (different role)
    const existing = await prisma.customRole.findUnique({
      where: { serverId_name: { serverId: role.serverId, name: name.trim() } },
    });
    if (existing && existing.id !== roleId) {
      return NextResponse.json({ error: 'a role with that name already exists' }, { status: 409 });
    }
  }

  if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: 'color must be a valid hex color (#RRGGBB)' }, { status: 400 });
  }

  const updated = await prisma.customRole.update({
    where: { id: roleId },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color }),
      ...(icon !== undefined && { icon }),
      ...(typeof priority === 'number' && { priority }),
    },
    include: {
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/admin/roles/[roleId] — delete a custom role (admin+)
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { roleId } = await ctx.params;

  const role = await prisma.customRole.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ error: 'role not found' }, { status: 404 });
  }

  const result = await requireRole(req, role.serverId, 'admin');
  if (result instanceof NextResponse) return result;

  await prisma.customRole.delete({ where: { id: roleId } });

  return NextResponse.json({ ok: true });
}
