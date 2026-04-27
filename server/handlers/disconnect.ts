// server/handlers/disconnect.ts
// On socket disconnect: notify voice peers, drop from sharers/sockets,
// emit PresenceUpdate offline if last tab, and clean up DB voice states.
// Must be registered LAST so the cleanup runs after handler-specific work.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ServerToClient } from '../../src/lib/socket-events';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma, state } = ctx;

  socket.on('disconnect', async () => {
    // Notify voice peers this socket is gone.
    const voiceChannelId = state.voiceSockets.get(socket.id);
    if (voiceChannelId) {
      socket.to(`voice:${voiceChannelId}`).emit(ServerToClient.VoicePeerLeft, {
        socketId: socket.id,
        pubkey,
      });
    }
    if (voiceChannelId) {
      state.screenSharers.get(voiceChannelId)?.delete(pubkey);
      if (state.screenSharers.get(voiceChannelId)?.size === 0) state.screenSharers.delete(voiceChannelId);
      state.cameraSharers.get(voiceChannelId)?.delete(pubkey);
      if (state.cameraSharers.get(voiceChannelId)?.size === 0) state.cameraSharers.delete(voiceChannelId);
    }
    state.voiceSockets.delete(socket.id);
    state.voiceSocketPubkey.delete(socket.id);

    state.pubkeySockets.get(pubkey)?.delete(socket.id);
    if (state.pubkeySockets.get(pubkey)?.size === 0) {
      state.pubkeySockets.delete(pubkey);
      // Presence: announce offline on last socket disconnect (before DB cleanup)
      io.emit(ServerToClient.PresenceUpdate, { pubkey, online: false });
      // Clean up voice states on disconnect
      try {
        const voiceStates = await prisma.voiceState.findMany({ where: { pubkey }, select: { channelId: true } });
        if (voiceStates.length > 0) {
          await prisma.voiceState.deleteMany({ where: { pubkey } });
          for (const vs of voiceStates) {
            const participants = await prisma.voiceState.findMany({
              where: { channelId: vs.channelId },
              select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
            });
            io.to(`voice:${vs.channelId}`).emit(ServerToClient.VoiceStateUpdate, { channelId: vs.channelId, participants });
          }
        }
      } catch {}
    }
    console.log(`[socket] Disconnected: ${pubkey.slice(0, 8)}...`);
  });
}
