import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';
import { refreshStaleProfiles } from '@/lib/profile-sync';

// POST /api/admin/refresh-profiles?serverId=... — force refresh member profiles for one server
export async function POST(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const updated = await refreshStaleProfiles(0, serverId); // force all in this server
  return NextResponse.json({ updated });
}
