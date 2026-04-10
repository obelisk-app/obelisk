import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { randomBytes } from 'crypto';

// GET /api/servers/:serverId/invitations — list invitations (admin+).
//
// Each invitation includes the members who actually joined through it
// (resolved via Member.joinedViaInviteId) so the admin UI can show who
// came in via each link.
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
    include: {
      members: {
        select: {
          id: true,
          pubkey: true,
          displayName: true,
          picture: true,
          nip05: true,
          joinedAt: true,
        },
        orderBy: { joinedAt: 'asc' },
      },
    },
  });

  return NextResponse.json({ invitations });
}

// POST /api/servers/:serverId/invitations — create an invitation (admin+ only).
//
// The activity-based invite-credit policy was removed (incomplete feature);
// only admins and above can mint invitations now. They keep full flexibility
// over `maxUses`, `expiresInHours`, and optional `targetPubkey`.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const { targetPubkey } = body as { targetPubkey?: string };

  const maxUses = Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : 1;
  const expiresAt = body.expiresInHours
    ? new Date(Date.now() + Number(body.expiresInHours) * 3600000)
    : null;

  const code = randomBytes(16).toString('hex');
  const invitation = await prisma.invitation.create({
    data: {
      serverId,
      code,
      createdBy: actor.pubkey,
      targetPubkey: targetPubkey || null,
      maxUses,
      expiresAt,
    },
    include: {
      members: {
        select: {
          id: true,
          pubkey: true,
          displayName: true,
          picture: true,
          nip05: true,
          joinedAt: true,
        },
      },
    },
  });

  return NextResponse.json({ invitation }, { status: 201 });
}
