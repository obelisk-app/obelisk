import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const pubkey = await validateSession(token);
  if (!pubkey) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // Return member profile data if available
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
  });
}
