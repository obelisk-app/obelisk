import { prisma } from './db';
import {
  getAuthorProfile,
  fetchAndSyncProfileDeduped,
  SYSTEM_PUBKEY,
} from './profile-sync';
import { getWelcomeTemplate } from './welcome-templates';
import { shortNpub } from './mentions';
import type { Locale } from '@/i18n';
import { ServerToClient } from '@/lib/socket-events';

/**
 * Posts a welcome message in the server's configured welcome channel when a
 * new member joins. The target channel and language are admin-configurable
 * via Server.welcomeChannelId / Server.welcomeLocale.
 *
 * Returns the created message (or null if the bot is disabled or the channel
 * is missing / not a text channel).
 */
export async function postWelcomeMessage(serverId: string, memberPubkey: string) {
  // Load server config for the welcome bot.
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      name: true,
      welcomeChannelId: true,
      welcomeLocale: true,
    },
  });
  if (!server || !server.welcomeChannelId) return null;

  // Defensive: confirm the channel still exists and is a text channel on this
  // server. onDelete: SetNull already guards against stale FKs, but this also
  // filters out accidental voice/forum picks from older data.
  const channel = await prisma.channel.findFirst({
    where: { id: server.welcomeChannelId, serverId, type: 'text' },
  });
  if (!channel) return null;

  // Look up member profile for display name
  let member = await prisma.member.findFirst({
    where: { serverId, pubkey: memberPubkey },
    select: { displayName: true, picture: true, profileUpdatedAt: true },
  });

  // If the profile has never been synced from Nostr relays (profileUpdatedAt
  // is null), fetch it now before building the welcome banner. Without this
  // wait, freshly-joined users get a welcome card with the Obelisk fallback
  // icon baked into the stored message content — refreshing can't fix it
  // because the banner URL is immutable once the message is created.
  //
  // `fetchAndSyncProfileDeduped` shares in-flight promises with any fetch
  // the join route already kicked off, so this only adds latency in the
  // genuinely-unfetched case. Capped by the 8s `maxWait` inside
  // `fetchProfileFromRelay`.
  if (!member || member.profileUpdatedAt === null) {
    try {
      await fetchAndSyncProfileDeduped(memberPubkey, serverId);
      member = await prisma.member.findFirst({
        where: { serverId, pubkey: memberPubkey },
        select: { displayName: true, picture: true, profileUpdatedAt: true },
      });
    } catch {
      // Relay failure is non-fatal — fall through with whatever we have.
    }
  }

  const displayName = member?.displayName || shortNpub(memberPubkey);

  // Build dynamic welcome banner URL with member info
  const bannerParams = new URLSearchParams();
  bannerParams.set('name', displayName);
  if (member?.picture) bannerParams.set('picture', member.picture);
  const bannerUrl = `/api/welcome-banner?${bannerParams.toString()}`;

  const locale: Locale = server.welcomeLocale === 'en' ? 'en' : 'es';
  const content = getWelcomeTemplate(locale, {
    displayName,
    bannerUrl,
    serverName: server.name,
    pubkey: memberPubkey,
  });

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      authorPubkey: SYSTEM_PUBKEY,
      content,
    },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: { select: { id: true, messageId: true, authorPubkey: true, emoji: true } },
    },
  });

  // Welcome messages are posted by the system bot — no Member row exists
  // for SYSTEM_PUBKEY, so author is null. Clients render the system avatar.
  const author = await getAuthorProfile(SYSTEM_PUBKEY, serverId);
  const enriched = { ...message, author };

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channel.id}`).emit(ServerToClient.NewMessage, enriched);
  }

  return { message: enriched, channelId: channel.id };
}
