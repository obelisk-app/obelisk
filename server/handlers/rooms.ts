// server/handlers/rooms.ts
// Socket room membership for server- and channel-scoped fan-out. Channel
// joins are gated by channel-read permission; server joins by Member.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ClientToServer } from '../../src/lib/socket-events';
import { canReadChannel } from '../../src/lib/roles';
import { resolveMemberAccess } from '../../src/lib/channel-access';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { prisma } = ctx;

  socket.on(ClientToServer.JoinServer, async (serverId: string) => {
    if (typeof serverId !== 'string' || !serverId) return;
    try {
      const member = await prisma.member.findUnique({
        where: { serverId_pubkey: { serverId, pubkey } },
        select: { id: true },
      });
      if (!member) return;
      socket.join(`server:${serverId}`);
    } catch {}
  });

  socket.on(ClientToServer.LeaveServer, (serverId: string) => {
    if (typeof serverId === 'string' && serverId) socket.leave(`server:${serverId}`);
  });

  socket.on(ClientToServer.JoinChannel, async (channelId: string) => {
    if (typeof channelId !== 'string' || channelId.length === 0) {
      console.log(`[socket][join-channel] reject: bad channelId pk=${pubkey.slice(0, 8)}`);
      return;
    }
    try {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { serverId: true, readPermission: true, readRoleIds: true },
      });
      if (!channel) {
        console.log(`[socket][join-channel] reject: channel not found ch=${channelId} pk=${pubkey.slice(0, 8)}`);
        return;
      }
      if (channel.readPermission) {
        const access = await resolveMemberAccess(pubkey, channel.serverId);
        if (!canReadChannel(access.role, channel, access.customRoleIds)) {
          console.log(`[socket][join-channel] reject: readPermission ch=${channelId} pk=${pubkey.slice(0, 8)} role=${access.role} perm=${channel.readPermission}`);
          return;
        }
      }
      socket.join(`channel:${channelId}`);
      console.log(`[socket][join-channel] ok ch=${channelId} pk=${pubkey.slice(0, 8)}`);
    } catch (err) {
      console.error('[socket] join-channel error:', err);
    }
  });

  socket.on(ClientToServer.LeaveChannel, (channelId: string) => {
    if (typeof channelId === 'string' && channelId.length > 0) {
      socket.leave(`channel:${channelId}`);
    }
  });
}
