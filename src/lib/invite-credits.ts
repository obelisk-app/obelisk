/**
 * Activity-based invite credits.
 *
 * Members earn a fixed pool of invite credits once they pass server-defined
 * activity thresholds (days since join, messages sent). Admins+ bypass this
 * mechanism entirely and keep unlimited invite power.
 *
 * See docs/wot-and-invite-credits.md for full feature documentation.
 */
import { prisma } from './db';

export interface InviteCredits {
  eligible: boolean;
  available: number;
  used: number;
  limit: number;
  messageCount: number;
  daysActive: number;
  minMessages: number;
  minDaysActive: number;
  reasons: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the invite-credit status for a (server, pubkey) pair.
 *
 * Returns eligibility against the server's policy plus the available count
 * after subtracting invitations already created by this user. The caller is
 * responsible for short-circuiting admins (they bypass this entirely).
 */
export async function computeCredits(
  serverId: string,
  pubkey: string
): Promise<InviteCredits | null> {
  const [server, member] = await Promise.all([
    prisma.server.findUnique({
      where: { id: serverId },
      select: {
        minDaysActive: true,
        minMessages: true,
        invitesPerUser: true,
      },
    }),
    prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: { joinedAt: true },
    }),
  ]);

  if (!server || !member) return null;

  const daysActive = Math.floor(
    (Date.now() - member.joinedAt.getTime()) / MS_PER_DAY
  );

  const messageCount = await prisma.message.count({
    where: {
      authorPubkey: pubkey,
      deletedAt: null,
      channel: { serverId },
    },
  });

  const reasons: string[] = [];
  if (daysActive < server.minDaysActive) {
    const remaining = server.minDaysActive - daysActive;
    reasons.push(
      `${remaining} more day${remaining === 1 ? '' : 's'} of activity required`
    );
  }
  if (messageCount < server.minMessages) {
    const remaining = server.minMessages - messageCount;
    reasons.push(
      `${remaining} more message${remaining === 1 ? '' : 's'} required`
    );
  }

  const eligible = reasons.length === 0;

  const used = await prisma.invitation.count({
    where: { serverId, createdBy: pubkey },
  });
  const available = Math.max(0, server.invitesPerUser - used);

  return {
    eligible,
    available,
    used,
    limit: server.invitesPerUser,
    messageCount,
    daysActive,
    minMessages: server.minMessages,
    minDaysActive: server.minDaysActive,
    reasons,
  };
}
