import { prisma } from './db';

/**
 * Check if a member has been in the server long enough to earn invite credits.
 */
export function isEligibleForCredits(
  member: { joinedAt: Date },
  server: { minDaysActive: number }
): boolean {
  const days = (Date.now() - member.joinedAt.getTime()) / 86_400_000;
  return days >= server.minDaysActive;
}

/**
 * Get how many invite credits a member has remaining.
 */
export async function getRemainingCredits(
  serverId: string,
  pubkey: string
): Promise<{
  eligible: boolean;
  used: number;
  total: number;
  remaining: number;
  minDaysActive: number;
  memberSince: Date | null;
}> {
  const [member, server] = await Promise.all([
    prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: { joinedAt: true },
    }),
    prisma.server.findUnique({
      where: { id: serverId },
      select: { minDaysActive: true, invitesPerUser: true },
    }),
  ]);

  if (!member || !server) {
    return { eligible: false, used: 0, total: 0, remaining: 0, minDaysActive: 7, memberSince: null };
  }

  const eligible = isEligibleForCredits(member, server);
  const total = server.invitesPerUser;

  if (total <= 0) {
    return { eligible: false, used: 0, total: 0, remaining: 0, minDaysActive: server.minDaysActive, memberSince: member.joinedAt };
  }

  // Only count invites minted against the member credit pool. Admin-minted
  // invites (memberCreated=false) bypass the pool even when the same pubkey
  // also holds an admin role.
  const used = await prisma.invitation.count({
    where: { serverId, createdBy: pubkey, memberCreated: true },
  });

  return {
    eligible,
    used,
    total,
    remaining: Math.max(0, total - used),
    minDaysActive: server.minDaysActive,
    memberSince: member.joinedAt,
  };
}
