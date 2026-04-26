// server/handlers/reactions.ts
// ToggleReaction handler — adds or removes the viewer's reaction to a
// message and re-emits the full reactions list to the channel room.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ServerToClient, ClientToServer } from '../../src/lib/socket-events';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma } = ctx;

  socket.on(ClientToServer.ToggleReaction, async (data: { messageId: string; channelId: string; emoji: string }) => {
    const { messageId, channelId, emoji } = data;

    if (!messageId || !channelId || !emoji) return;

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { channelId: true, deletedAt: true },
      });

      if (!message || message.deletedAt || message.channelId !== channelId) return;

      const existing = await prisma.reaction.findUnique({
        where: { messageId_authorPubkey_emoji: { messageId, authorPubkey: pubkey, emoji } },
      });

      if (existing) {
        await prisma.reaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.reaction.create({ data: { messageId, authorPubkey: pubkey, emoji } });
      }

      const reactions = await prisma.reaction.findMany({
        where: { messageId },
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      });

      io.to(`channel:${channelId}`).emit(ServerToClient.ReactionUpdated, { messageId, reactions });
    } catch (err) {
      console.error('[socket] Failed to toggle reaction:', err);
    }
  });
}
