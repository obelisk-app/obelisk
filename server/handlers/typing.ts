// server/handlers/typing.ts
// Channel and DM typing indicators. Best-effort fan-out — no persistence.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ServerToClient, ClientToServer } from '../../src/lib/socket-events';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, state } = ctx;

  socket.on(ClientToServer.Typing, (channelId: string) => {
    if (typeof channelId === 'string' && channelId.length > 0) {
      socket.to(`channel:${channelId}`).emit(ServerToClient.UserTyping, { pubkey, channelId });
    }
  });

  // DM typing indicator
  socket.on(ClientToServer.DMTyping, (targetPubkey: string) => {
    if (typeof targetPubkey === 'string') {
      const targetSockets = state.pubkeySockets.get(targetPubkey);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit(ServerToClient.DMUserTyping, { pubkey });
        }
      }
    }
  });
}
