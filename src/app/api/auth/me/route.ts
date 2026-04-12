import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mobile Safari / Chrome will occasionally serve a cached 401 from an earlier
// unauthenticated hit of this endpoint, which makes a freshly logged-in user
// look logged out on refresh. Forbid caching on every response.
const NO_STORE = { 'Cache-Control': 'no-store, must-revalidate' };

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE });
  }

  const pubkey = await validateSession(token);
  if (!pubkey) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401, headers: NO_STORE });
  }

  const member = await prisma.member.findFirst({
    where: { pubkey },
    select: { displayName: true, picture: true, nip05: true, role: true },
  });

  return NextResponse.json({
    pubkey,
    displayName: member?.displayName || null,
    picture: member?.picture || null,
    nip05: member?.nip05 || null,
    role: member?.role || 'member',
  }, { headers: NO_STORE });
}
