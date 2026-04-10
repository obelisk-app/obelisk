import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// PATCH /api/members/me — update own profile in Member table
export async function PATCH(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { displayName, picture, nip05, about, banner, lud16, website, nickname } = await req.json();

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const profileData = {
    displayName: displayName || null,
    picture: picture || null,
    nip05: nip05 || null,
    about: about || null,
    banner: banner || null,
    lud16: lud16 || null,
    website: website || null,
    profileUpdatedAt: new Date(),
  };

  // Only include nickname if explicitly provided (don't overwrite with null)
  const updateData = nickname !== undefined
    ? { ...profileData, nickname: nickname || null }
    : profileData;

  const member = await prisma.member.upsert({
    where: { serverId_pubkey: { serverId: server.id, pubkey } },
    update: updateData,
    create: {
      serverId: server.id,
      pubkey,
      role: 'member',
      ...profileData,
    },
  });

  return NextResponse.json({
    pubkey: member.pubkey,
    displayName: member.displayName,
    picture: member.picture,
    nip05: member.nip05,
    about: member.about,
    banner: member.banner,
    lud16: member.lud16,
    website: member.website,
    nickname: member.nickname,
  });
}
