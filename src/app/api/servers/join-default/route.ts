import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { postWelcomeMessage } from '@/lib/welcome';

export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await prisma.instanceSettings.findUnique({ where: { id: 'global' } });
  if (!settings || !settings.defaultServerId) {
    return NextResponse.json({ error: 'No default server configured' }, { status: 404 });
  }

  const serverId = settings.defaultServerId;

  // Ensure they aren't already a member
  const existingMember = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (existingMember) {
    return NextResponse.json({ alreadyMember: true, message: 'You are already a member' });
  }

  // Check ban
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (ban) {
    return NextResponse.json({ error: 'You are banned from the default server' }, { status: 403 });
  }

  await prisma.member.create({
    data: { serverId, pubkey, role: 'member' },
  });

  // Read state setup
  const existingChannels = await prisma.channel.findMany({
    where: { serverId, type: { in: ['text', 'forum'] } },
    select: { id: true },
  });
  if (existingChannels.length > 0) {
    const now = new Date();
    await prisma.channelReadState.createMany({
      data: existingChannels.map((c) => ({
        channelId: c.id,
        pubkey,
        lastReadAt: now,
      })),
      skipDuplicates: true,
    });
  }

  // Welcome message
  void postWelcomeMessage(serverId, pubkey).catch((err) => {
    console.warn('[join-default] postWelcomeMessage failed:', err);
  });

  return NextResponse.json({ ok: true, serverId });
}
