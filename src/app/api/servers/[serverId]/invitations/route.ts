import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, hasRole } from '@/lib/auth-roles';
import { randomBytes } from 'crypto';
import { isEligibleForCredits } from '@/lib/invite-credits';

const INVITE_MEMBER_SELECT = {
  id: true,
  pubkey: true,
  displayName: true,
  picture: true,
  nip05: true,
  joinedAt: true,
} as const;

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
        select: INVITE_MEMBER_SELECT,
        orderBy: { joinedAt: 'asc' },
      },
    },
  });

  return NextResponse.json({ invitations });
}

// POST /api/servers/:serverId/invitations — create an invitation.
//
// Admins+ have full flexibility over maxUses, expiresInHours, targetPubkey.
// Regular members can create invites if they have credits (tenure-based):
//   - Must be a member for >= server.minDaysActive days
//   - Cannot exceed server.invitesPerUser total invites
//   - Member invites are forced: maxUses=1, auto-expire, no targetPubkey
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'member');
  if (actor instanceof NextResponse) return actor;

  const body = await parseJsonBody(req);
  // `asMember: true` lets an admin explicitly request the member-credit flow
  // (used by the sidebar "Invite Friends" card so admins can test/use the
  // member path without their admin role bypassing credits).
  const isAdmin = hasRole(actor.role, 'admin') && body.asMember !== true;

  let maxUses: number;
  let expiresAt: Date | null;
  let targetPubkey: string | null;

  if (isAdmin) {
    // Admin: full flexibility
    const rawTarget = body.targetPubkey?.trim();
    if (rawTarget) {
      if (rawTarget.startsWith('npub1')) {
        try {
          const { nip19 } = await import('nostr-tools');
          const decoded = nip19.decode(rawTarget) as any;
          if (decoded.type === 'npub') {
            targetPubkey = decoded.data as string;
          } else {
            return NextResponse.json({ error: 'Invalid npub format' }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ error: 'Invalid npub format' }, { status: 400 });
        }
      } else if (/^[0-9a-fA-F]{64}$/.test(rawTarget)) {
        targetPubkey = rawTarget.toLowerCase();
      } else {
        return NextResponse.json({ error: 'targetPubkey must be a valid npub or 64-character hex string' }, { status: 400 });
      }
    } else {
      targetPubkey = null;
    }
    
    maxUses = Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : 1;
    expiresAt = body.expiresInHours
      ? new Date(Date.now() + Number(body.expiresInHours) * 3600000)
      : null;
  } else {
    // Member: enforce invite credit constraints
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { minDaysActive: true, invitesPerUser: true, inviteExpiryHours: true },
    });
    if (!server || server.invitesPerUser <= 0) {
      return NextResponse.json(
        { error: 'Member invites are disabled on this server' },
        { status: 403 }
      );
    }

    const member = await prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey: actor.pubkey } },
      select: { joinedAt: true },
    });
    if (!member || !isEligibleForCredits(member, server)) {
      return NextResponse.json(
        { error: `You must be a member for at least ${server.minDaysActive} days to create invites` },
        { status: 403 }
      );
    }

    const usedCredits = await prisma.invitation.count({
      where: { serverId, createdBy: actor.pubkey, memberCreated: true },
    });
    if (usedCredits >= server.invitesPerUser) {
      return NextResponse.json(
        { error: `You have used all ${server.invitesPerUser} invite credits` },
        { status: 403 }
      );
    }

    maxUses = 1;
    expiresAt = new Date(Date.now() + server.inviteExpiryHours * 3600000);
    targetPubkey = null;
  }

  const code = randomBytes(16).toString('hex');
  const invitation = await prisma.invitation.create({
    data: {
      serverId,
      code,
      createdBy: actor.pubkey,
      targetPubkey,
      maxUses,
      expiresAt,
      memberCreated: !isAdmin,
    },
    include: {
      members: { select: INVITE_MEMBER_SELECT },
    },
  });

  return NextResponse.json({ invitation }, { status: 201 });
}
