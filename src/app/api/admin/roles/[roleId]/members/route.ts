import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

interface RouteContext {
  params: Promise<{ roleId: string }>;
}

// POST /api/admin/roles/[roleId]/members — assign role to a member (admin+)
// Body: { memberId }
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { roleId } = await ctx.params;

  const role = await prisma.customRole.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ error: 'role not found' }, { status: 404 });
  }

  const result = await requireRole(req, role.serverId, 'admin');
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const { memberId } = body as { memberId?: string };

  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  }

  // Verify member belongs to the same server
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member || member.serverId !== role.serverId) {
    return NextResponse.json({ error: 'member not found in this server' }, { status: 404 });
  }

  // Upsert to avoid duplicate errors
  const assignment = await prisma.memberCustomRole.upsert({
    where: { memberId_roleId: { memberId, roleId } },
    create: { memberId, roleId },
    update: {},
  });

  return NextResponse.json(assignment, { status: 201 });
}

// DELETE /api/admin/roles/[roleId]/members — remove role from a member (admin+)
// Body: { memberId }
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { roleId } = await ctx.params;

  const role = await prisma.customRole.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ error: 'role not found' }, { status: 404 });
  }

  const result = await requireRole(req, role.serverId, 'admin');
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const { memberId } = body as { memberId?: string };

  if (!memberId) {
    return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
  }

  // Delete if exists, ignore if not
  await prisma.memberCustomRole.deleteMany({
    where: { memberId, roleId },
  });

  return NextResponse.json({ ok: true });
}
