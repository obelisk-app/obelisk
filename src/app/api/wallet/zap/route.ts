import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { pubkeyToNpub } from '@/lib/nostr';
import { getAuthPubkey } from '@/lib/api-auth';
import {
  withClient,
  classifyNwcError,
  getWalletForPubkey,
} from '@/lib/nwc';
import {
  getAuthorProfile,
  ZAP_BOT_PUBKEY,
} from '@/lib/profile-sync';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';
import { ServerToClient } from '@/lib/socket-events';

/**
 * POST /api/wallet/zap  { channelId, targetPubkey, amountSats }
 *
 * Server-side zap flow: creates an invoice on the target's NWC wallet, pays
 * it from the caller's NWC wallet, and on success posts a public chat
 * message authored by ZAP_BOT_PUBKEY so the Zap Bot appears as the sender
 * instead of the zapper's own npub.
 */
export async function POST(req: NextRequest) {
  const sender = await getAuthPubkey(req);
  if (!sender) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(req);
  const { channelId, targetPubkey, amountSats } = body as {
    channelId?: string;
    targetPubkey?: string;
    amountSats?: number;
  };

  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  if (!targetPubkey || !/^[0-9a-f]{64}$/i.test(targetPubkey)) {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 });
  }
  if (!amountSats || amountSats <= 0) {
    return NextResponse.json({ error: 'amountSats required' }, { status: 400 });
  }
  if (targetPubkey.toLowerCase() === sender.toLowerCase()) {
    return NextResponse.json({ error: 'cannot_zap_self' }, { status: 400 });
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      serverId: true,
      type: true,
      readPermission: true,
      readRoleIds: true,
    },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  if (channel.readPermission) {
    const access = await resolveMemberAccess(sender, channel.serverId);
    if (!canReadChannel(access.role, channel, access.customRoleIds)) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
  }

  const targetHasWallet = await getWalletForPubkey(targetPubkey);
  if (!targetHasWallet) {
    return NextResponse.json({ error: 'target_no_wallet' }, { status: 409 });
  }

  let invoice: string;
  try {
    const result = await withClient(targetPubkey, async (c) =>
      c.makeInvoice({ amount: amountSats * 1000, description: 'Obelisk zap' }),
    );
    if (!result) return NextResponse.json({ error: 'target_no_wallet' }, { status: 409 });
    invoice = result.invoice;
  } catch (err) {
    return NextResponse.json({ error: classifyNwcError(err) }, { status: 502 });
  }

  try {
    const pay = await withClient(sender, async (c) => c.payInvoice({ invoice }));
    if (!pay) return NextResponse.json({ error: 'no_wallet' }, { status: 404 });
  } catch (err) {
    const code = classifyNwcError(err);
    const status = code === 'insufficient_funds' ? 402 : 502;
    return NextResponse.json({ error: code }, { status });
  }

  const senderRef = `nostr:${pubkeyToNpub(sender)}`;
  const targetRef = `nostr:${pubkeyToNpub(targetPubkey)}`;
  const content = `⚡ ${senderRef} zapeó a ${targetRef} ${amountSats} sats`;

  const message = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: ZAP_BOT_PUBKEY,
      content,
    },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: { select: { id: true, messageId: true, authorPubkey: true, emoji: true } },
    },
  });

  const author = await getAuthorProfile(ZAP_BOT_PUBKEY, channel.serverId);
  const enriched = { ...message, author };

  const io = (globalThis as any).__io;
  if (io) io.to(`channel:${channelId}`).emit(ServerToClient.NewMessage, enriched);

  return NextResponse.json({ ok: true, message: enriched });
}
