import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { computeCredits } from '@/lib/invite-credits';
import { hasRole } from '@/lib/auth-roles';

// GET /api/profile/me — full profile snapshot for the authed user
// Returns member rows across every server plus computed invite credits.
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await prisma.member.findMany({
    where: { pubkey },
    include: {
      server: {
        select: {
          id: true,
          name: true,
          icon: true,
          ownerPubkey: true,
          minDaysActive: true,
          minMessages: true,
          invitesPerUser: true,
        },
      },
    },
  });

  const servers = await Promise.all(
    memberships.map(async (m) => {
      const isOwner = m.server.ownerPubkey === pubkey;
      const role = isOwner ? 'owner' : (m.role as 'admin' | 'mod' | 'member');
      const adminBypass = hasRole(role, 'admin');

      const credits = adminBypass
        ? {
            eligible: true,
            available: Infinity,
            used: 0,
            limit: Infinity,
            messageCount: 0,
            daysActive: 0,
            minMessages: 0,
            minDaysActive: 0,
            reasons: [],
          }
        : await computeCredits(m.serverId, pubkey);

      return {
        serverId: m.serverId,
        serverName: m.server.name,
        serverIcon: m.server.icon,
        role,
        joinedAt: m.joinedAt,
        lastActivityAt: m.lastActivityAt,
        displayName: m.displayName,
        nickname: m.nickname,
        picture: m.picture,
        nip05: m.nip05,
        about: m.about,
        adminBypass,
        credits,
      };
    })
  );

  // Also list all invitations this user has minted across servers.
  const invitations = await prisma.invitation.findMany({
    where: { createdBy: pubkey },
    orderBy: { createdAt: 'desc' },
    include: {
      server: { select: { id: true, name: true, icon: true } },
    },
  });

  return NextResponse.json({
    pubkey,
    servers,
    invitations,
  });
}
