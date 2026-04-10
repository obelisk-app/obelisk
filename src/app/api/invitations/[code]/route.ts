import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { postWelcomeMessage } from '@/lib/welcome';

// GET /api/invitations/:code — validate an invitation (public info)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { code },
    include: {
      server: {
        select: { id: true, name: true, icon: true, banner: true, _count: { select: { members: true } } },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
  }

  // Check expiry
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  // Check uses
  if (invitation.uses >= invitation.maxUses) {
    return NextResponse.json({ error: 'Invitation fully used' }, { status: 410 });
  }

  return NextResponse.json({
    server: invitation.server,
    targetPubkey: invitation.targetPubkey,
  });
}

// POST /api/invitations/:code — accept/redeem an invitation.
//
// Behavior:
//   - Existing members: returns 200 + alreadyMember=true. No invite use is consumed.
//   - Banned users: 403 with the ban reason (if any). No use consumed.
//   - New members: creates a Member row tagged with joinedViaInviteId so the
//     admin panel can show "joined via <code>". Increments invite uses.
//     Posts the welcome message.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { code },
    include: {
      server: { select: { id: true, name: true, icon: true, banner: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  if (invitation.uses >= invitation.maxUses) {
    return NextResponse.json({ error: 'Invitation fully used' }, { status: 410 });
  }

  // Check target restriction
  if (invitation.targetPubkey && invitation.targetPubkey !== pubkey) {
    return NextResponse.json({ error: 'This invitation is for a different user' }, { status: 403 });
  }

  // Check ban — surface the reason if available
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
  });
  if (ban) {
    return NextResponse.json(
      {
        error: 'You are banned from this server',
        banned: true,
        reason: ban.reason ?? null,
      },
      { status: 403 }
    );
  }

  // Already a member? Don't consume the invite, don't re-post welcome.
  const existingMember = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
  });
  if (existingMember) {
    return NextResponse.json({
      server: invitation.server,
      alreadyMember: true,
      message: 'You are already a member of this server',
    });
  }

  // New member: create + tag with invite source + increment uses atomically.
  await prisma.$transaction([
    prisma.member.create({
      data: {
        serverId: invitation.serverId,
        pubkey,
        role: 'member',
        joinedViaInviteId: invitation.id,
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { uses: { increment: 1 } },
    }),
  ]);

  await postWelcomeMessage(invitation.serverId, pubkey);

  return NextResponse.json({ server: invitation.server });
}
