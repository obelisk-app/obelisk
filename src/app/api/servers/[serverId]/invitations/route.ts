import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { randomBytes } from 'crypto';

// GET /api/servers/:serverId/invitations — list invitations (admin+ only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const invitations = await prisma.invitation.findMany({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ invitations });
}

// POST /api/servers/:serverId/invitations — create an invitation (admin+ only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const { targetPubkey, maxUses = 1, expiresInHours } = body;

  const code = randomBytes(16).toString('hex');
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600000)
    : null;

  const invitation = await prisma.invitation.create({
    data: {
      serverId,
      code,
      createdBy: actor.pubkey,
      targetPubkey: targetPubkey || null,
      maxUses,
      expiresAt,
    },
  });

  return NextResponse.json({ invitation }, { status: 201 });
}
