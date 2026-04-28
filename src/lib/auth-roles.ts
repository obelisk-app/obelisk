import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from './api-auth';
import { prisma } from './db';
import { isInstanceOwner } from './instance-owner';
import { hasRole, canWriteInChannel, type Role } from './roles';

// Re-export pure helpers so existing server-side imports keep working.
export { hasRole, canWriteInChannel };
export type { Role };

export interface AuthMember {
  id: string;
  serverId: string;
  pubkey: string;
  role: Role;
  displayName: string | null;
  picture: string | null;
  /** True if this caller is the global instance owner (env-configured). */
  instanceOwner: boolean;
}

/**
 * Get the authenticated member for a server.
 *
 * Owner role precedence:
 *   1. INSTANCE_OWNER_PUBKEY (global, beats everything — no Member row required)
 *   2. Server.ownerPubkey (per-server)
 *   3. Member.role
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

  if (!server) return null;

  const instanceOwner = isInstanceOwner(pubkey);

  // Instance owner gets owner-level access on every server, even without
  // a Member row. Synthesize a virtual member if missing.
  if (!member) {
    if (!instanceOwner) return null;
    return {
      id: 'instance-owner',
      serverId,
      pubkey,
      role: 'owner',
      displayName: null,
      picture: null,
      instanceOwner: true,
    };
  }

  // Resolve effective role: instance owner > server owner > member.role
  const role: Role =
    instanceOwner || server.ownerPubkey === pubkey
      ? 'owner'
      : (member.role as Role);

  return {
    id: member.id,
    serverId: member.serverId,
    pubkey: member.pubkey,
    role,
    displayName: member.displayName,
    picture: member.picture,
    instanceOwner,
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
 * Get the default (first) server ID.
 *
 * @deprecated Multi-server admin: prefer reading serverId from the request query
 *   (`getServerIdFromQuery`) or deriving it from the target resource. This helper
 *   silently picks an arbitrary server and is only kept for narrow legacy paths
 *   (e.g. `/api/members/me` until that route is migrated).
 */
export async function getDefaultServerId(): Promise<string | null> {
  const server = await prisma.server.findFirst({ select: { id: true } });
  return server?.id ?? null;
}

/**
 * Read `?serverId=...` from the request URL. Returns null if missing/empty.
 * Routes that scope to a server should call this and 400 on null.
 */
export function getServerIdFromQuery(req: NextRequest): string | null {
  const sid = new URL(req.url).searchParams.get('serverId');
  return sid && sid.trim().length > 0 ? sid.trim() : null;
}

/**
 * Convenience: read `?serverId=...` and return a 400 NextResponse if absent.
 * Used at the top of admin route handlers that take serverId via query.
 */
export function requireServerIdFromQuery(
  req: NextRequest
): string | NextResponse {
  const serverId = getServerIdFromQuery(req);
  if (!serverId) {
    return NextResponse.json(
      { error: 'serverId query parameter is required' },
      { status: 400 }
    );
  }
  return serverId;
}
