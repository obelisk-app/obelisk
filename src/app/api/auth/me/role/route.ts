import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthMember,
  getDefaultServerId,
  getServerIdFromQuery,
} from '@/lib/auth-roles';

// GET /api/auth/me/role?serverId=... — get current user's effective role on a server.
// If serverId is omitted, falls back to the default (first) server for backwards
// compatibility with single-server callers.
export async function GET(req: NextRequest) {
  const queryServerId = getServerIdFromQuery(req);
  const serverId = queryServerId ?? (await getDefaultServerId());
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const member = await getAuthMember(req, serverId);
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    role: member.role,
    pubkey: member.pubkey,
    serverId: member.serverId,
    instanceOwner: member.instanceOwner,
  });
}
