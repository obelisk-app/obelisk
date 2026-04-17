import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { resolveMemberAccess } from '@/lib/channel-access';
import { canReadChannel } from '@/lib/roles';

/**
 * Mint a LiveKit access token for the authenticated pubkey to join a voice
 * channel configured in SFU mode. We enforce channel read permission here
 * — the existing Socket.io `join-voice` handler historically had no
 * membership check, which is why this endpoint is stricter.
 *
 * Returns 503 if LiveKit isn't configured on this deployment so the
 * client can surface a clear "ask an admin to enable the SFU" error
 * rather than appearing to hang.
 */
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelId = req.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }

  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'sfu_not_configured' }, { status: 503 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      serverId: true,
      type: true,
      voiceMode: true,
      readPermission: true,
      readRoleIds: true,
    },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }
  if (channel.type !== 'voice') {
    return NextResponse.json({ error: 'Not a voice channel' }, { status: 400 });
  }
  if (channel.voiceMode !== 'sfu') {
    return NextResponse.json({ error: 'Channel is not in SFU mode' }, { status: 400 });
  }

  const access = await resolveMemberAccess(pubkey, channel.serverId);
  if (!canReadChannel(access.role, channel, access.customRoleIds)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // LiveKit rooms are identified by a string — we use the channel id
  // directly so there's no separate mapping to maintain.
  const at = new AccessToken(apiKey, apiSecret, {
    identity: pubkey,
    // Token TTL — just needs to cover the join handshake; LiveKit then
    // maintains its own session. Short TTLs reduce the window for a stolen
    // token to be replayed elsewhere.
    ttl: '10m',
  });
  at.addGrant({
    roomJoin: true,
    room: channelId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ url, token });
}
