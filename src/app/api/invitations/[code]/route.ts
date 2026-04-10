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

// POST /api/invitations/:code — accept/redeem an invitation
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

  // Check ban
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
  });
  if (ban) {
    return NextResponse.json({ error: 'You are banned from this server' }, { status: 403 });
  }

  // Check if already a member (for welcome message)
  const existingMember = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
  });

  // Join server + increment uses in a transaction
  await prisma.$transaction([
    prisma.member.upsert({
      where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
      update: {},
      create: { serverId: invitation.serverId, pubkey, role: 'member' },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { uses: { increment: 1 } },
    }),
  ]);

  // Post welcome message for new members
  if (!existingMember) {
    await postWelcomeMessage(invitation.serverId, pubkey);
  }

  return NextResponse.json({ server: invitation.server });
}
