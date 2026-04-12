import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';

// GET /api/admin/roles?serverId=... — list custom roles for a server (admin+)
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const result = await requireRole(req, serverId, 'admin');
  if (result instanceof NextResponse) return result;

  const roles = await prisma.customRole.findMany({
    where: { serverId },
    orderBy: { priority: 'desc' },
    include: {
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json(roles);
}

// POST /api/admin/roles?serverId=... — create a custom role (admin+)
// Body: { name, color?, icon?, priority? }
export async function POST(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const result = await requireRole(req, serverId, 'admin');
  if (result instanceof NextResponse) return result;

  const body = await req.json();
  const { name, color, icon, priority } = body as {
    name?: string;
    color?: string;
    icon?: string;
    priority?: number;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 32) {
    return NextResponse.json({ error: 'name must be 32 characters or fewer' }, { status: 400 });
  }

  // Validate color is hex
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: 'color must be a valid hex color (#RRGGBB)' }, { status: 400 });
  }

  // Check for duplicate name within server
  const existing = await prisma.customRole.findUnique({
    where: { serverId_name: { serverId, name: trimmedName } },
  });
  if (existing) {
    return NextResponse.json({ error: 'a role with that name already exists' }, { status: 409 });
  }

  const role = await prisma.customRole.create({
    data: {
      serverId,
      name: trimmedName,
      ...(color && { color }),
      ...(icon && { icon }),
      ...(typeof priority === 'number' && { priority }),
    },
    include: {
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json(role, { status: 201 });
}
