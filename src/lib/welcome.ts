import { prisma } from './db';

const SYSTEM_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Posts a welcome message in the server's "bienvenida" channel when a new member joins.
 * Returns the created message or null if no bienvenida channel exists.
 */
export async function postWelcomeMessage(serverId: string, memberPubkey: string) {
  // Find the bienvenida channel
  const bienvenida = await prisma.channel.findFirst({
    where: { serverId, name: 'bienvenida' },
  });
  if (!bienvenida) return null;

  // Look up member profile for display name
  const member = await prisma.member.findFirst({
    where: { serverId, pubkey: memberPubkey },
    select: { displayName: true, picture: true },
  });

  const displayName = member?.displayName || memberPubkey.slice(0, 8) + '...';

  // Build dynamic welcome banner URL with member info
  const bannerParams = new URLSearchParams();
  bannerParams.set('name', displayName);
  if (member?.picture) bannerParams.set('picture', member.picture);
  const bannerUrl = `/api/welcome-banner?${bannerParams.toString()}`;

  const message = await prisma.message.create({
    data: {
      channelId: bienvenida.id,
      authorPubkey: SYSTEM_PUBKEY,
      content: `**@${displayName}** bienvenid@ a **La Crypta** 🥳\n\n![Bienvenido/a a La Crypta](${bannerUrl})`,
    },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: { select: { id: true, messageId: true, authorPubkey: true, emoji: true } },
    },
  });

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${bienvenida.id}`).emit('new-message', message);
  }

  return { message, channelId: bienvenida.id };
}
