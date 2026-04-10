import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthMember, hasRole } from '@/lib/auth-roles';
import { computeCredits } from '@/lib/invite-credits';
import { randomBytes } from 'crypto';

// GET /api/servers/:serverId/invitations — list invitations
// Admins+ see all; regular members see only their own.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await getAuthMember(req, serverId);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = hasRole(actor.role, 'admin');
  const invitations = await prisma.invitation.findMany({
    where: isAdmin ? { serverId } : { serverId, createdBy: actor.pubkey },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ invitations });
}

// POST /api/servers/:serverId/invitations — create an invitation
// Admins+ have unlimited power. Regular members must be eligible (activity
// thresholds met) and have credits available; their invites are forced to
// maxUses=1 with the server's configured expiry.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await getAuthMember(req, serverId);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { targetPubkey } = body as { targetPubkey?: string };
  const isAdmin = hasRole(actor.role, 'admin');

  let maxUses: number;
  let expiresAt: Date | null;

  if (isAdmin) {
    // Admins keep current flexibility.
    maxUses = Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : 1;
    expiresAt = body.expiresInHours
      ? new Date(Date.now() + Number(body.expiresInHours) * 3600000)
      : null;
  } else {
    // Members are subject to the credit pool.
    const credits = await computeCredits(serverId, actor.pubkey);
    if (!credits) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }
    if (!credits.eligible) {
      return NextResponse.json(
        {
          error: 'Not eligible to mint invites yet',
          reasons: credits.reasons,
        },
        { status: 403 }
      );
    }
    if (credits.available <= 0) {
      return NextResponse.json(
        { error: 'No invite credits remaining', credits },
        { status: 403 }
      );
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { inviteExpiryHours: true },
    });
    maxUses = 1;
    expiresAt = new Date(
      Date.now() + (server?.inviteExpiryHours ?? 168) * 3600000
    );
  }

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
  });

  return NextResponse.json({ invitation }, { status: 201 });
}
