import next from 'next';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { Server as SocketServer } from 'socket.io';
import { parse } from 'url';
import { ServerToClient, ClientToServer } from './src/lib/socket-events';
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// Use HTTPS in dev if certs exist (needed for NIP-07 on LAN)
const certPath = './cert.pem';
const keyPath = './key.pem';
const useHttps = dev && existsSync(certPath) && existsSync(keyPath);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// P2P mesh voice: the server only relays signaling. No media passes through.
// Per-voice-channel caps on concurrent camera / screen streams.
const MAX_CAMERAS_PER_CHANNEL = 4;
const MAX_SCREENS_PER_CHANNEL = 2;

app.prepare().then(async () => {
  // Dynamic import to let Next.js set up its module resolution first
  const { prisma } = await import('./src/lib/db-server');
  const { getAuthorProfile } = await import('./src/lib/profile-sync');
  const { extractMentionPubkeys, hasEveryoneMention } = await import('./src/lib/mentions');
  const { fanOutReadUpdate } = await import('./src/lib/read-fanout');
  const { resolveMemberAccess } = await import('./src/lib/channel-access');
  const { canReadChannel, hasRole } = await import('./src/lib/roles');
  const { isServerMember } = await import('./src/lib/mention-fanout');
  const { authMiddleware } = await import('./server/auth-middleware');
  const { createServerContext } = await import('./server/context');
  const { bindContext } = await import('./server/api-bridge');
  const { register: registerPresence } = await import('./server/handlers/presence');
  const { register: registerRooms } = await import('./server/handlers/rooms');
  const { register: registerTyping } = await import('./server/handlers/typing');

  const requestHandler = (req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  };

  const httpServer = useHttps
    ? createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, requestHandler)
    : createServer(requestHandler);

  const io = new SocketServer(httpServer, {
    cors: {
      origin: dev
        ? true
        : process.env.CORS_ORIGIN
          ? [process.env.CORS_ORIGIN]
          : [],
      credentials: true,
    },
  });

  // Make io accessible from API routes
  (globalThis as any).__io = io;

  const ctx = createServerContext(io, prisma);
  bindContext(ctx);

  io.use(authMiddleware(ctx));

  io.on('connection', (socket) => {
    const pubkey: string = socket.data.pubkey;
    registerPresence(ctx, socket);
    registerRooms(ctx, socket);
    registerTyping(ctx, socket);

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
            const targetSockets = ctx.state.pubkeySockets.get(mentionedPubkey);
            if (!targetSockets) continue;
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
            for (const sid of targetSockets) {
              io.to(sid).emit(ServerToClient.Notification, {
                recipientPubkey: mentionedPubkey,
                type: notifType,
                channelId,
                serverId,
                messageId: message.id,
                senderPubkey: pubkey,
                preview,
                createdAt: message.createdAt,
              });
            }
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
          const { isInstanceOwner } = await import('./src/lib/instance-owner');
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

    // ── Mark channel as read (via socket to avoid HTTP round-trip) ──
    socket.on(ClientToServer.MarkRead, async (data: { channelId: string; lastMessageId?: string }) => {
      if (!data?.channelId || typeof data.channelId !== 'string') return;
      try {
        await prisma.channelReadState.upsert({
          where: { channelId_pubkey: { channelId: data.channelId, pubkey } },
          create: {
            channelId: data.channelId,
            pubkey,
            lastReadAt: new Date(),
            lastReadMessageId: data.lastMessageId ?? null,
          },
          update: {
            lastReadAt: new Date(),
            lastReadMessageId: data.lastMessageId ?? null,
          },
        });

        // Fan out to sibling sockets of the same user (scenario 11 — read
        // in one tab clears the badge on another tab / device).
        fanOutReadUpdate(
          ctx.state.pubkeySockets,
          pubkey,
          socket.id,
          'read-update',
          { recipientPubkey: pubkey, channelId: data.channelId },
          (sid, event, payload) => io.to(sid).emit(event, payload),
        );
      } catch (err) {
        console.error('[socket] Failed to mark read:', err);
      }
    });

    // ── Mark mentions as seen (flag-only clear; distinct from mark-read) ──
    // Fires as soon as the viewer opens the channel, without waiting for them
    // to scroll to the bottom. Only advances the mention cursor so future
    // `/api/unread` calls stop flagging this channel; the unread message
    // count continues to track `lastReadAt` independently.
    socket.on(ClientToServer.MarkMentionRead, async (data: { channelId: string }) => {
      if (!data?.channelId || typeof data.channelId !== 'string') return;
      try {
        await prisma.channelReadState.upsert({
          where: { channelId_pubkey: { channelId: data.channelId, pubkey } },
          create: {
            channelId: data.channelId,
            pubkey,
            lastMentionReadAt: new Date(),
          },
          update: {
            lastMentionReadAt: new Date(),
          },
        });

        fanOutReadUpdate(
          ctx.state.pubkeySockets,
          pubkey,
          socket.id,
          'mention-read-update',
          { recipientPubkey: pubkey, channelId: data.channelId },
          (sid, event, payload) => io.to(sid).emit(event, payload),
        );
      } catch (err) {
        console.error('[socket] Failed to mark mention read:', err);
      }
    });

    // ── Mark DM thread as read (via socket, mirrors /api/dm/:pubkey/read) ──
    socket.on(ClientToServer.DMRead, async (data: { pubkey: string }) => {
      if (!data?.pubkey || typeof data.pubkey !== 'string') return;
      try {
        await prisma.dMReadState.upsert({
          where: { pubkey_threadPubkey: { pubkey, threadPubkey: data.pubkey } },
          create: {
            pubkey,
            threadPubkey: data.pubkey,
            lastReadAt: new Date(),
          },
          update: {
            lastReadAt: new Date(),
          },
        });

        fanOutReadUpdate(
          ctx.state.pubkeySockets,
          pubkey,
          socket.id,
          'dm-read-update',
          { recipientPubkey: pubkey, pubkey: data.pubkey },
          (sid, event, payload) => io.to(sid).emit(event, payload),
        );
      } catch (err) {
        console.error('[socket] Failed to mark DM read:', err);
      }
    });

    // ── Voice channel events (P2P mesh — signaling only) ─────────

    // Helper: return peers currently in a voice channel (excluding a socket).
    const getVoicePeers = (channelId: string, excludeSocketId?: string) => {
      const room = io.sockets.adapter.rooms.get(`voice:${channelId}`);
      if (!room) return [];
      const peers: Array<{ socketId: string; pubkey: string }> = [];
      for (const sid of room) {
        if (sid === excludeSocketId) continue;
        const pk = ctx.state.voiceSocketPubkey.get(sid);
        if (pk) peers.push({ socketId: sid, pubkey: pk });
      }
      return peers;
    };

    socket.on(ClientToServer.JoinVoice, async (channelId: string, cb?: (res: any) => void) => {
      if (!channelId || typeof channelId !== 'string') return;
      try {
        await prisma.voiceState.upsert({
          where: { channelId_pubkey: { channelId, pubkey } },
          update: {},
          create: { channelId, pubkey },
        });
        const peers = getVoicePeers(channelId, socket.id);
        socket.join(`voice:${channelId}`);
        ctx.state.voiceSockets.set(socket.id, channelId);
        ctx.state.voiceSocketPubkey.set(socket.id, pubkey);

        // Tell existing peers a newcomer arrived.
        socket.to(`voice:${channelId}`).emit(ServerToClient.VoicePeerJoined, {
          socketId: socket.id,
          pubkey,
        });

        const participants = await prisma.voiceState.findMany({
          where: { channelId },
          select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
        });
        io.to(`voice:${channelId}`).emit(ServerToClient.VoiceStateUpdate, { channelId, participants });

        cb?.({ selfSocketId: socket.id, peers });
      } catch (err) {
        console.error('[socket] Failed to join voice:', err);
        cb?.({ error: 'Failed to join voice channel' });
      }
    });

    socket.on(ClientToServer.LeaveVoice, async (channelId: string) => {
      if (!channelId || typeof channelId !== 'string') return;
      try {
        socket.to(`voice:${channelId}`).emit(ServerToClient.VoicePeerLeft, {
          socketId: socket.id,
          pubkey,
        });
        ctx.state.screenSharers.get(channelId)?.delete(pubkey);
        if (ctx.state.screenSharers.get(channelId)?.size === 0) ctx.state.screenSharers.delete(channelId);
        ctx.state.cameraSharers.get(channelId)?.delete(pubkey);
        if (ctx.state.cameraSharers.get(channelId)?.size === 0) ctx.state.cameraSharers.delete(channelId);
        ctx.state.voiceSockets.delete(socket.id);
        ctx.state.voiceSocketPubkey.delete(socket.id);
        await prisma.voiceState.deleteMany({ where: { channelId, pubkey } });
        socket.leave(`voice:${channelId}`);
        const participants = await prisma.voiceState.findMany({
          where: { channelId },
          select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
        });
        io.to(`voice:${channelId}`).emit(ServerToClient.VoiceStateUpdate, { channelId, participants });
      } catch (err) {
        console.error('[socket] Failed to leave voice:', err);
      }
    });

    // Capacity locks: at most N cameras / M screens per voice channel.
    const claimSlot = (
      map: Map<string, Set<string>>,
      channelId: string,
      max: number,
      busyMessage: string,
      cb?: (res: any) => void,
    ) => {
      if (!channelId || typeof channelId !== 'string') return cb?.({ error: 'Bad channel' });
      if (ctx.state.voiceSockets.get(socket.id) !== channelId) return cb?.({ error: 'Not in this voice channel' });
      let set = map.get(channelId);
      if (!set) { set = new Set(); map.set(channelId, set); }
      if (set.has(pubkey)) return cb?.({ ok: true });
      if (set.size >= max) return cb?.({ error: busyMessage });
      set.add(pubkey);
      cb?.({ ok: true });
    };
    const releaseSlot = (map: Map<string, Set<string>>, channelId: string) => {
      if (!channelId || typeof channelId !== 'string') return;
      const set = map.get(channelId);
      if (!set) return;
      set.delete(pubkey);
      if (set.size === 0) map.delete(channelId);
    };

    socket.on(ClientToServer.VoiceScreenClaim, (channelId: string, cb?: (res: any) => void) => {
      claimSlot(
        ctx.state.screenSharers, channelId, MAX_SCREENS_PER_CHANNEL,
        `Screen-share limit reached (${MAX_SCREENS_PER_CHANNEL}). Please wait until someone else stops sharing.`,
        cb,
      );
    });
    socket.on(ClientToServer.VoiceScreenRelease, (channelId: string) => releaseSlot(ctx.state.screenSharers, channelId));

    socket.on(ClientToServer.VoiceCameraClaim, (channelId: string, cb?: (res: any) => void) => {
      claimSlot(
        ctx.state.cameraSharers, channelId, MAX_CAMERAS_PER_CHANNEL,
        `Camera limit reached (${MAX_CAMERAS_PER_CHANNEL}). Please wait until someone else turns off their camera.`,
        cb,
      );
    });
    socket.on(ClientToServer.VoiceCameraRelease, (channelId: string) => releaseSlot(ctx.state.cameraSharers, channelId));

    // Moderator actions in voice: mute / turn off camera / stop screen share of a target.
    // Requires caller to be owner/admin/mod of the server that owns the channel.
    socket.on(ClientToServer.VoiceModAction, async (
      data: { channelId: string; targetPubkey: string; action: 'mute' | 'camera-off' | 'screen-off' },
      cb?: (res: any) => void,
    ) => {
      const { channelId, targetPubkey, action } = data || ({} as any);
      if (!channelId || !targetPubkey || !action) return cb?.({ error: 'Bad request' });
      if (targetPubkey === pubkey) return cb?.({ error: 'Cannot target yourself' });
      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId }, select: { serverId: true },
        });
        if (!channel) return cb?.({ error: 'Channel not found' });
        const server = await prisma.server.findUnique({
          where: { id: channel.serverId }, select: { ownerPubkey: true },
        });
        const isOwner = server?.ownerPubkey === pubkey;
        const { isInstanceOwner } = await import('./src/lib/instance-owner');
        let allowed = isOwner || isInstanceOwner(pubkey);
        if (!allowed) {
          const caller = await prisma.member.findUnique({
            where: { serverId_pubkey: { serverId: channel.serverId, pubkey } },
            select: { role: true },
          });
          const role = caller?.role as any;
          allowed = role === 'owner' || role === 'admin' || role === 'mod';
        }
        if (!allowed) return cb?.({ error: 'Not authorized' });

        const targetSocketIds = ctx.state.pubkeySockets.get(targetPubkey);
        if (!targetSocketIds || targetSocketIds.size === 0) {
          return cb?.({ error: 'Target is not connected' });
        }
        const event =
          action === 'mute' ? 'voice-force-mute' :
          action === 'camera-off' ? 'voice-force-camera-off' :
          action === 'screen-off' ? 'voice-force-screen-off' : null;
        if (!event) return cb?.({ error: 'Bad action' });

        // Only fire if the target is actually in this voice channel.
        for (const sid of targetSocketIds) {
          if (ctx.state.voiceSockets.get(sid) !== channelId) continue;
          io.to(sid).emit(event, { reason: `A moderator ${action === 'mute' ? 'muted you' : action === 'camera-off' ? 'turned off your camera' : 'stopped your screen share'}` });
        }
        // If we forced camera/screen off, also release the slot so others can use it.
        if (action === 'camera-off') {
          ctx.state.cameraSharers.get(channelId)?.delete(targetPubkey);
          if (ctx.state.cameraSharers.get(channelId)?.size === 0) ctx.state.cameraSharers.delete(channelId);
        }
        if (action === 'screen-off') {
          ctx.state.screenSharers.get(channelId)?.delete(targetPubkey);
          if (ctx.state.screenSharers.get(channelId)?.size === 0) ctx.state.screenSharers.delete(channelId);
        }
        // Mirror mute state in DB so the UI indicator updates.
        if (action === 'mute') {
          try {
            await prisma.voiceState.update({
              where: { channelId_pubkey: { channelId, pubkey: targetPubkey } },
              data: { muted: true },
            });
            io.to(`voice:${channelId}`).emit(ServerToClient.VoiceStateUpdate, {
              channelId,
              participants: await prisma.voiceState.findMany({
                where: { channelId },
                select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
              }),
            });
          } catch {}
        }
        cb?.({ ok: true });
      } catch (err) {
        console.error('[socket] voice-mod-action error:', err);
        cb?.({ error: 'Mod action failed' });
      }
    });

    // Signaling relay: forward SDP / ICE / track-info to a specific peer.
    socket.on(ServerToClient.VoiceSignal, ({ toSocketId, payload }: { toSocketId: string; payload: any }) => {
      if (!toSocketId || typeof toSocketId !== 'string' || !payload) return;
      const fromChannel = ctx.state.voiceSockets.get(socket.id);
      const toChannel = ctx.state.voiceSockets.get(toSocketId);
      // Only allow signaling between peers in the same voice channel.
      if (!fromChannel || fromChannel !== toChannel) return;
      io.to(toSocketId).emit(ServerToClient.VoiceSignal, {
        fromSocketId: socket.id,
        fromPubkey: pubkey,
        payload,
      });
    });

    socket.on(ClientToServer.VoiceMute, async ({ channelId, muted }: { channelId: string; muted: boolean }) => {
      if (!channelId) return;
      try {
        await prisma.voiceState.update({
          where: { channelId_pubkey: { channelId, pubkey } },
          data: { muted },
        });
        io.to(`voice:${channelId}`).emit(ServerToClient.VoiceStateUpdate, {
          channelId,
          participants: await prisma.voiceState.findMany({
            where: { channelId },
            select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
          }),
        });
      } catch {}
    });

    socket.on(ClientToServer.VoiceDeafen, async ({ channelId, deafened }: { channelId: string; deafened: boolean }) => {
      if (!channelId) return;
      try {
        await prisma.voiceState.update({
          where: { channelId_pubkey: { channelId, pubkey } },
          data: { deafened, muted: deafened ? true : undefined },
        });
        io.to(`voice:${channelId}`).emit(ServerToClient.VoiceStateUpdate, {
          channelId,
          participants: await prisma.voiceState.findMany({
            where: { channelId },
            select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
          }),
        });
      } catch {}
    });

    socket.on('disconnect', async () => {
      // Notify voice peers this socket is gone.
      const voiceChannelId = ctx.state.voiceSockets.get(socket.id);
      if (voiceChannelId) {
        socket.to(`voice:${voiceChannelId}`).emit(ServerToClient.VoicePeerLeft, {
          socketId: socket.id,
          pubkey,
        });
      }
      if (voiceChannelId) {
        ctx.state.screenSharers.get(voiceChannelId)?.delete(pubkey);
        if (ctx.state.screenSharers.get(voiceChannelId)?.size === 0) ctx.state.screenSharers.delete(voiceChannelId);
        ctx.state.cameraSharers.get(voiceChannelId)?.delete(pubkey);
        if (ctx.state.cameraSharers.get(voiceChannelId)?.size === 0) ctx.state.cameraSharers.delete(voiceChannelId);
      }
      ctx.state.voiceSockets.delete(socket.id);
      ctx.state.voiceSocketPubkey.delete(socket.id);

      ctx.state.pubkeySockets.get(pubkey)?.delete(socket.id);
      if (ctx.state.pubkeySockets.get(pubkey)?.size === 0) {
        ctx.state.pubkeySockets.delete(pubkey);
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
  });

  // Helper: force disconnect a pubkey (called from API routes via globalThis)
  (globalThis as any).__disconnectPubkey = (targetPubkey: string, reason: string) => {
    const sockets = ctx.state.pubkeySockets.get(targetPubkey);
    if (sockets) {
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.emit(ServerToClient.ForceDisconnect, { reason });
          s.disconnect(true);
        }
      }
    }
  };

  // Helper: emit moderation events
  (globalThis as any).__emitModEvent = (event: string, data: any) => {
    io.emit(event, data);
  };

  httpServer.listen(port, hostname, async () => {
    const proto = useHttps ? 'https' : 'http';
    console.log(`> Obelisk ready on ${proto}://${hostname}:${port}`);

    // Profile caching: backfill missing profiles, then refresh stale ones every 6 hours
    const { backfillMissingProfiles, refreshStaleProfiles } = await import('./src/lib/profile-sync');
    setTimeout(async () => {
      await backfillMissingProfiles().catch(console.error);
      await refreshStaleProfiles(0.25).catch(console.error); // refresh profiles older than 6h
    }, 10_000);
    setInterval(() => refreshStaleProfiles(0.25).catch(console.error), 6 * 60 * 60 * 1000);

    // Bot poller: refreshes enabled ServerBots on their configured intervals
    // and broadcasts `bot-updated` so member lists update live.
    const { startBotPoller } = await import('./src/lib/bots/poller');
    startBotPoller(io);

    // Re-arm turn timers for any in_progress games surviving a restart,
    // and either expire-now or re-schedule expiry for waiting games so no
    // stale "Unirme" cards linger across reboots.
    try {
      const { scheduleTurnTimer, scheduleWaitingExpiry, WAITING_EXPIRY_MINUTES } = await import('./src/lib/games/runtime');
      const active = await prisma.game.findMany({
        where: { status: 'in_progress' },
        select: { id: true, turnDeadline: true },
      });
      for (const g of active) {
        if (g.turnDeadline) scheduleTurnTimer(g.id, g.turnDeadline);
      }
      const waitingCutoff = new Date(Date.now() - WAITING_EXPIRY_MINUTES * 60 * 1000);
      // Anything older than the cutoff: mark cancelled in bulk (no-broadcast
      // bulk update is fine — nobody's subscribed yet at boot time).
      await prisma.game.updateMany({
        where: { status: 'waiting', createdAt: { lt: waitingCutoff } },
        data: { status: 'cancelled', finishedAt: new Date() },
      });
      const waiting = await prisma.game.findMany({
        where: { status: 'waiting' },
        select: { id: true, createdAt: true },
      });
      for (const g of waiting) scheduleWaitingExpiry(g.id, g.createdAt);
    } catch (err) {
      console.error('[games] Failed to rehydrate game timers:', err);
    }
  });
});
