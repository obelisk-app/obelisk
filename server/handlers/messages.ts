// server/handlers/messages.ts
// Send / Edit / Delete message handlers. Owns the mention fan-out pipeline:
// extract mentions → write Mention rows → enqueue InboxItem (later) → emit
// Notification socket events (via notifications.ts helper).

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ServerToClient, ClientToServer } from '../../src/lib/socket-events';
import { extractMentionPubkeys, hasEveryoneMention } from '../../src/lib/mentions';
import { isServerMember } from '../../src/lib/mention-fanout';
import { canReadChannel, hasRole } from '../../src/lib/roles';
import { resolveMemberAccess } from '../../src/lib/channel-access';
import { getAuthorProfile } from '../../src/lib/profile-sync';
import { emitNotification } from './notifications';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma } = ctx;

  socket.on(ClientToServer.SendMessage, async (data: { channelId: string; content: string; replyToId?: string }) => {
      const { channelId, content, replyToId } = data;

      // Validate input
      if (!channelId || typeof channelId !== 'string') return;
      if (!content || typeof content !== 'string' || !content.trim()) return;
      if (content.length > 4000) {
        socket.emit(ServerToClient.MessageError, { error: 'Message too long (max 4000 chars)' });
        return;
      }

      try {
        // Resolve serverId from the channel
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true, readPermission: true, readRoleIds: true },
        });
        if (!channel) {
          socket.emit(ServerToClient.MessageError, { error: 'Channel not found' });
          return;
        }
        const serverId = channel.serverId;

        // Sender must also be allowed to read (can't post where you can't see).
        if (channel.readPermission) {
          const access = await resolveMemberAccess(pubkey, serverId);
          if (!canReadChannel(access.role, channel, access.customRoleIds)) {
            socket.emit(ServerToClient.MessageError, { error: 'Channel not found' });
            return;
          }
        }

        // Check ban/mute before allowing message
        const ban = await prisma.ban.findUnique({
          where: { serverId_pubkey: { serverId, pubkey } },
        });
        if (ban) {
          socket.emit(ServerToClient.MessageError, { error: 'You are banned from this server' });
          return;
        }

        const activeMute = await prisma.mute.findFirst({
          where: { serverId, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
        });
        if (activeMute) {
          socket.emit(ServerToClient.MessageError, {
            error: 'You are muted',
            mutedUntil: activeMute.expiresAt,
          });
          return;
        }

        const message = await prisma.message.create({
          data: {
            channelId,
            authorPubkey: pubkey,
            content: content.trim(),
            replyToId: replyToId || null,
          },
          include: {
            replyTo: {
              select: { id: true, content: true, authorPubkey: true },
            },
            reactions: {
              select: { id: true, messageId: true, authorPubkey: true, emoji: true },
            },
          },
        });

        // Bump activity timestamp for invite-credit eligibility (best-effort).
        prisma.member
          .updateMany({
            where: { serverId, pubkey },
            data: { lastActivityAt: new Date() },
          })
          .catch(() => {});

        // Attach author profile so real-time clients render immediately
        // without a separate fetch round-trip.
        const author = await getAuthorProfile(pubkey, serverId);
        const enriched = { ...message, author };

        const roomSize = io.sockets.adapter.rooms.get(`channel:${channelId}`)?.size ?? 0;
        console.log(`[socket][new-message] emit ch=${channelId} roomSize=${roomSize} msgId=${message.id}`);
        io.to(`channel:${channelId}`).emit(ServerToClient.NewMessage, enriched);

        // Forum post thread fan-out: if the new message is a reply to a forum
        // post (parent message has a title), notify every subscriber of that
        // post (except the author) with a `post-unread` event so their
        // sidebar shows the post in white + unread count — same pattern as
        // channel unreads.
        if (replyToId && message.replyTo) {
          const parent = await prisma.message.findUnique({
            where: { id: replyToId },
            select: { title: true },
          });
          if (parent?.title) {
            const subs = await prisma.postSubscription.findMany({
              where: { postId: replyToId, pubkey: { not: pubkey } },
              select: { pubkey: true },
            });
            for (const s of subs) {
              io.to(`pubkey:${s.pubkey}`).emit(ServerToClient.PostUnread, {
                recipientPubkey: s.pubkey,
                postId: replyToId,
                messageId: message.id,
                authorPubkey: pubkey,
                hasMention: false,
              });
            }
          }
        }

        // Extract mentions (hex + bech32) and create Mention records.
        // Also treat a reply to someone else's message as an implicit mention
        // of the original author — that's how Discord surfaces replies.
        const mentionedPubkeys = extractMentionPubkeys(content);
        const notifiedPubkeys = new Set<string>(); // pubkey → already emitted
        const mentionedSet = new Set(mentionedPubkeys);

        // Resolve reply-target author (if any) and fold into the mention set.
        let replyTargetPubkey: string | null = null;
        if (replyToId && message.replyTo?.authorPubkey) {
          if (message.replyTo.authorPubkey !== pubkey) {
            replyTargetPubkey = message.replyTo.authorPubkey;
            mentionedSet.add(replyTargetPubkey);
          }
        }

        // `@everyone` broadcast: admin+ fans out a Mention row to every
        // member of the server who can read this channel. Below that role,
        // the token renders as a pill but triggers no notification — the
        // gate here is the spam protection.
        let everyoneBroadcast = false;
        if (hasEveryoneMention(content)) {
          const authorAccess = await resolveMemberAccess(pubkey, serverId);
          if (hasRole(authorAccess.role, 'mod')) {
            everyoneBroadcast = true;
            const serverMembers = await prisma.member.findMany({
              where: { serverId },
              select: { pubkey: true },
            });
            for (const m of serverMembers) {
              if (m.pubkey === pubkey) continue;
              if (channel.readPermission) {
                const access = await resolveMemberAccess(m.pubkey, serverId);
                if (!canReadChannel(access.role, channel, access.customRoleIds)) continue;
              }
              mentionedSet.add(m.pubkey);
            }
          }
        }

        if (mentionedSet.size > 0) {
          // Bulk-create Mention rows (skip duplicates)
          await prisma.mention.createMany({
            data: [...mentionedSet].map(pk => ({
              messageId: message.id,
              pubkey: pk,
              channelId,
            })),
            skipDuplicates: true,
          });

          // Notify mentioned users via their sockets
          const preview = content.slice(0, 100);
          for (const mentionedPubkey of mentionedSet) {
            if (mentionedPubkey === pubkey) continue; // don't notify self
            // Hard server-membership + read-permission gate for every mention
            // (direct, reply, @everyone). Stops mentions from leaking to
            // non-members or users without channel read access.
            if (!(await isServerMember(prisma as any, mentionedPubkey, serverId))) continue;
            {
              const access = await resolveMemberAccess(mentionedPubkey, serverId);
              if (!canReadChannel(access.role, channel, access.customRoleIds)) continue;
            }
            // 'reply' vs 'mention' vs 'everyone' gives the client room to
            // tailor copy/sound. Priority: a direct per-user mention wins
            // over a broadcast, and a reply-only notification only kicks in
            // when the target wasn't otherwise mentioned.
            const isDirectMention = mentionedPubkeys.includes(mentionedPubkey);
            const notifType =
              mentionedPubkey === replyTargetPubkey && !isDirectMention
                ? 'reply'
                : isDirectMention
                  ? 'mention'
                  : everyoneBroadcast
                    ? 'everyone'
                    : 'mention';
            await emitNotification(ctx, mentionedPubkey, {
              type: notifType,
              channelId,
              serverId,
              messageId: message.id,
              senderPubkey: pubkey,
              preview,
              createdAt: message.createdAt,
            });
            notifiedPubkeys.add(mentionedPubkey);
          }
        }

        // Emit unread-update to server members not in the channel room
        const channelRoom = io.sockets.adapter.rooms.get(`channel:${channelId}`);
        const channelSocketIds = channelRoom ? [...channelRoom] : [];
        const channelPubkeys = new Set<string>();
        for (const sid of channelSocketIds) {
          const s = io.sockets.sockets.get(sid);
          if (s?.data.pubkey) channelPubkeys.add(s.data.pubkey);
        }

        // Find all server members who are online but NOT in this channel.
        // For read-gated channels, filter out users who can't see the channel
        // so hidden channels don't leak via unread badges.
        for (const [memberPubkey, memberSocketIds] of ctx.state.pubkeySockets) {
          if (memberPubkey === pubkey) continue; // don't notify sender
          if (channelPubkeys.has(memberPubkey)) continue; // already in channel
          // ctx.state.pubkeySockets spans every connected socket across every server —
          // without this gate we unread-badge users in servers they never
          // joined. Apply membership + read-permission filter.
          if (!(await isServerMember(prisma as any, memberPubkey, serverId))) continue;
          if (channel.readPermission) {
            const access = await resolveMemberAccess(memberPubkey, serverId);
            if (!canReadChannel(access.role, channel, access.customRoleIds)) continue;
          }
          for (const sid of memberSocketIds) {
            io.to(sid).emit(ServerToClient.UnreadUpdate, {
              recipientPubkey: memberPubkey,
              channelId,
              serverId,
              hasMention: mentionedSet.has(memberPubkey),
              preview: content.slice(0, 100),
            });
          }
        }
      } catch (err) {
        console.error('[socket] Failed to create message:', err);
        socket.emit(ServerToClient.MessageError, { error: 'Failed to send message' });
      }
    });

    socket.on(ClientToServer.EditMessage, async (data: { messageId: string; channelId: string; content: string }) => {
      const { messageId, channelId, content } = data;

      if (!messageId || !channelId || !content?.trim()) return;
      if (content.length > 4000) {
        socket.emit(ServerToClient.MessageError, { error: 'Message too long (max 4000 chars)' });
        return;
      }

      try {
        const existing = await prisma.message.findUnique({
          where: { id: messageId },
          select: { authorPubkey: true, channelId: true, deletedAt: true },
        });

        if (!existing || existing.deletedAt || existing.channelId !== channelId || existing.authorPubkey !== pubkey) {
          socket.emit(ServerToClient.MessageError, { error: 'Cannot edit this message' });
          return;
        }

        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content: content.trim(), editedAt: new Date() },
          include: {
            replyTo: { select: { id: true, content: true, authorPubkey: true } },
            reactions: { select: { id: true, messageId: true, authorPubkey: true, emoji: true } },
          },
        });

        io.to(`channel:${channelId}`).emit(ServerToClient.MessageEdited, updated);
      } catch (err) {
        console.error('[socket] Failed to edit message:', err);
        socket.emit(ServerToClient.MessageError, { error: 'Failed to edit message' });
      }
    });

    socket.on(ClientToServer.DeleteMessage, async (data: { messageId: string; channelId: string }) => {
      const { messageId, channelId } = data;
      if (!messageId || !channelId) return;

      try {
        const existing = await prisma.message.findUnique({
          where: { id: messageId },
          select: {
            authorPubkey: true,
            channelId: true,
            deletedAt: true,
            channel: { select: { serverId: true } },
          },
        });

        if (!existing || existing.deletedAt || existing.channelId !== channelId) {
          socket.emit(ServerToClient.MessageError, { error: 'Cannot delete this message' });
          return;
        }

        let allowed = existing.authorPubkey === pubkey;
        if (!allowed) {
          const server = await prisma.server.findUnique({
            where: { id: existing.channel.serverId },
            select: { ownerPubkey: true },
          });
          const isOwner = server?.ownerPubkey === pubkey;
          const { isInstanceOwner } = await import('../../src/lib/instance-owner');
          allowed = isOwner || isInstanceOwner(pubkey);
          if (!allowed) {
            const caller = await prisma.member.findUnique({
              where: { serverId_pubkey: { serverId: existing.channel.serverId, pubkey } },
              select: { role: true },
            });
            const role = caller?.role as any;
            allowed = role === 'owner' || role === 'admin' || role === 'mod';
          }
        }

        if (!allowed) {
          socket.emit(ServerToClient.MessageError, { error: 'Cannot delete this message' });
          return;
        }

        await prisma.message.update({
          where: { id: messageId },
          data: { deletedAt: new Date() },
        });

        io.to(`channel:${channelId}`).emit(ServerToClient.MessageDeleted, { messageId });
      } catch (err) {
        console.error('[socket] Failed to delete message:', err);
        socket.emit(ServerToClient.MessageError, { error: 'Failed to delete message' });
      }
    });
}
