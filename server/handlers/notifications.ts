// server/handlers/notifications.ts
// Notification fan-out helper. Centralizes Notification socket event payload
// construction so all emission paths (mention, reply, everyone, dm) produce
// a consistent shape with scopeChain and senderName resolved.

import type { ServerContext } from '../context';
import { ServerToClient } from '../../src/lib/socket-events';
import { buildScopeChain } from '../../src/lib/server/scope-chain';

export interface BaseNotificationFields {
  type: 'mention' | 'reply' | 'everyone' | 'dm';
  serverId?: string;
  channelId?: string;
  postId?: string;
  messageId?: string;
  senderPubkey: string;
  preview?: string;
  createdAt?: Date | string;
}

async function resolveSenderName(
  ctx: ServerContext,
  serverId: string | undefined,
  pubkey: string,
): Promise<string | undefined> {
  if (!serverId) return undefined;
  try {
    const member = await ctx.prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: { displayName: true },
    });
    return member?.displayName ?? undefined;
  } catch {
    return undefined;
  }
}

export async function emitNotification(
  ctx: ServerContext,
  recipientPubkey: string,
  fields: BaseNotificationFields,
): Promise<void> {
  const sockets = ctx.state.pubkeySockets.get(recipientPubkey);
  if (!sockets || sockets.size === 0) return;

  const scopeChain =
    fields.type === 'dm'
      ? buildScopeChain({ dmCounterparty: fields.senderPubkey })
      : buildScopeChain({ channelId: fields.channelId, serverId: fields.serverId });

  const senderName = await resolveSenderName(ctx, fields.serverId, fields.senderPubkey);

  const createdAt =
    fields.createdAt instanceof Date
      ? fields.createdAt.toISOString()
      : fields.createdAt ?? new Date().toISOString();

  const payload = {
    recipientPubkey,
    ...fields,
    createdAt,
    scopeChain,
    senderName,
  };

  for (const socketId of sockets) {
    ctx.io.to(socketId).emit(ServerToClient.Notification, payload);
  }
}
