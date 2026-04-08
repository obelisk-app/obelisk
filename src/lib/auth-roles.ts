import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from './api-auth';
import { prisma } from './db';

export type Role = 'owner' | 'admin' | 'mod' | 'member';

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  mod: 2,
  member: 1,
};

export function hasRole(memberRole: Role, minimumRole: Role): boolean {
  return (ROLE_HIERARCHY[memberRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

export interface AuthMember {
  id: string;
  serverId: string;
  pubkey: string;
  role: Role;
  displayName: string | null;
  picture: string | null;
}

/**
 * Get the authenticated member for a server.
 * Resolves owner role from Server.ownerPubkey (authoritative).
 */
export async function getAuthMember(
  req: NextRequest,
  serverId: string
): Promise<AuthMember | null> {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return null;

  const [member, server] = await Promise.all([
    prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
    }),
    prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerPubkey: true },
    }),
  ]);

  if (!member) return null;

  // Owner role is authoritative from Server.ownerPubkey
  const role: Role = server?.ownerPubkey === pubkey ? 'owner' : (member.role as Role);

  return {
    id: member.id,
    serverId: member.serverId,
    pubkey: member.pubkey,
    role,
    displayName: member.displayName,
    picture: member.picture,
  };
}

/**
 * Require a minimum role. Returns the member if authorized, or a 401/403 response.
 */
export async function requireRole(
  req: NextRequest,
  serverId: string,
  minimumRole: Role
): Promise<AuthMember | NextResponse> {
  const member = await getAuthMember(req, serverId);

  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasRole(member.role, minimumRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return member;
}

/**
 * Get the default (first) server ID. Used by routes that don't take serverId as param.
 */
export async function getDefaultServerId(): Promise<string | null> {
  const server = await prisma.server.findFirst({ select: { id: true } });
  return server?.id ?? null;
}
