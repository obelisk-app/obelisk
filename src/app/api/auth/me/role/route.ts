import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/auth/me/role — get current user's role
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const member = await getAuthMember(req, serverId);
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ role: member.role, pubkey: member.pubkey });
}
