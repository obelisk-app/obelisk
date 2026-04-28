import { prisma } from './db';
import { isInstanceOwner } from './instance-owner';
import { canReadChannel, canWriteInChannel, type Role } from './roles';

export interface MemberAccessContext {
  role: Role;
  customRoleIds: string[];
}

/**
 * Resolve the caller's effective role + custom-role IDs for a server.
 * Owner promotion (instance owner > server owner > member.role) is mirrored
 * from getAuthMember so permission checks stay consistent.
 */
export async function resolveMemberAccess(
  pubkey: string,
  serverId: string
): Promise<MemberAccessContext> {
  if (isInstanceOwner(pubkey)) {
    return { role: 'owner', customRoleIds: [] };
  }
  const [member, server] = await Promise.all([
    prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: { id: true, role: true },
    }),
    prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerPubkey: true },
    }),
  ]);
  if (server?.ownerPubkey === pubkey) {
    return { role: 'owner', customRoleIds: [] };
  }
  if (!member) return { role: 'member', customRoleIds: [] };
  const links = await prisma.memberCustomRole.findMany({
    where: { memberId: member.id },
    select: { roleId: true },
  });
  return {
    role: (member.role as Role) ?? 'member',
    customRoleIds: links.map((l) => l.roleId),
  };
}

export interface ChannelAccessShape {
  readPermission?: string | null;
  readRoleIds?: string[] | null;
  writePermission?: string | null;
  writeRoleIds?: string[] | null;
}

export function canAccessChannel(
  ctx: MemberAccessContext,
  channel: ChannelAccessShape
): { canRead: boolean; canWrite: boolean } {
  const canRead = canReadChannel(ctx.role, channel, ctx.customRoleIds);
  const canWrite =
    canRead && canWriteInChannel(ctx.role, channel, ctx.customRoleIds);
  return { canRead, canWrite };
}
