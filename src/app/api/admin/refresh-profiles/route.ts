import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';
import { refreshStaleProfiles } from '@/lib/profile-sync';

// POST /api/admin/refresh-profiles — force refresh all member profiles from relays
export async function POST(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updated = await refreshStaleProfiles(0); // force all
  return NextResponse.json({ updated });
}
