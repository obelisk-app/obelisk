import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember, hasRole } from '@/lib/auth-roles';
import { computeCredits } from '@/lib/invite-credits';

// GET /api/servers/:serverId/invite-credits — return the authed user's credit status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await getAuthMember(req, serverId);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admins bypass the credit pool entirely.
  if (hasRole(actor.role, 'admin')) {
    return NextResponse.json({
      eligible: true,
      available: Infinity,
      used: 0,
      limit: Infinity,
      messageCount: 0,
      daysActive: 0,
      minMessages: 0,
      minDaysActive: 0,
      reasons: [],
      adminBypass: true,
    });
  }

  const credits = await computeCredits(serverId, actor.pubkey);
  if (!credits) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  return NextResponse.json({ ...credits, adminBypass: false });
}
