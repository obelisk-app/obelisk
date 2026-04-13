import next from 'next';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { Server as SocketServer } from 'socket.io';
import { parse } from 'url';
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
// Track which socket is in which voice channel.
const voiceSockets = new Map<string, string>(); // socketId → channelId
// Track pubkey for each socketId in a voice channel (for signaling targets).
const voiceSocketPubkey = new Map<string, string>(); // socketId → pubkey
// Per-voice-channel caps on concurrent camera / screen streams.
const MAX_CAMERAS_PER_CHANNEL = 4;
const MAX_SCREENS_PER_CHANNEL = 2;
const cameraSharers = new Map<string, Set<string>>(); // channelId → pubkeys
const screenSharers = new Map<string, Set<string>>(); // channelId → pubkeys

app.prepare().then(async () => {
  // Dynamic import to let Next.js set up its module resolution first
  const { prisma } = await import('./src/lib/db-server');
  const { getAuthorProfile } = await import('./src/lib/profile-sync');
  const { extractMentionPubkeys } = await import('./src/lib/mentions');
  const { fanOutReadUpdate } = await import('./src/lib/read-fanout');
  const { resolveMemberAccess } = await import('./src/lib/channel-access');
  const { canReadChannel } = await import('./src/lib/roles');

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

  // Socket.io auth middleware — parse session cookie
  io.use(async (socket, next) => {
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return next(new Error('No cookie'));

    const sessionToken = cookie
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('session='))
      ?.split('=')[1];

    if (!sessionToken) return next(new Error('No session'));

    try {
      const session = await prisma.session.findUnique({ where: { token: sessionToken } });
      if (!session || new Date() > session.expiresAt) {
        return next(new Error('Invalid session'));
      }
      socket.data.pubkey = session.pubkey;
      next();
    } catch (err) {
      next(new Error('Auth error'));
    }
  });

  // Track pubkey → socket IDs for targeted disconnects
  const pubkeySockets = new Map<string, Set<string>>();

  io.on('connection', (socket) => {
    const pubkey: string = socket.data.pubkey;
    console.log(`[socket] Connected: ${pubkey.slice(0, 8)}...`);

    // Track socket
    if (!pubkeySockets.has(pubkey)) pubkeySockets.set(pubkey, new Set());
    pubkeySockets.get(pubkey)!.add(socket.id);

    // Presence: announce online on first socket for this pubkey
    if (pubkeySockets.get(pubkey)!.size === 1) {
      io.emit('presence-update', { pubkey, online: true });
    }

    // Presence: snapshot of currently-online pubkeys
    socket.on('presence-sync', (cb?: (pubkeys: string[]) => void) => {
      if (typeof cb === 'function') {
        cb([...pubkeySockets.keys()]);
      }
    });

    socket.on('join-channel', async (channelId: string) => {
      if (typeof channelId !== 'string' || channelId.length === 0) return;
      try {
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true, readPermission: true, readRoleIds: true },
        });
        if (!channel) return;
        if (channel.readPermission) {
          const access = await resolveMemberAccess(pubkey, channel.serverId);
          if (!canReadChannel(access.role, channel, access.customRoleIds)) return;
        }
        socket.join(`channel:${channelId}`);
      } catch (err) {
        console.error('[socket] join-channel error:', err);
      }
    });

    socket.on('leave-channel', (channelId: string) => {
      if (typeof channelId === 'string' && channelId.length > 0) {
        socket.leave(`channel:${channelId}`);
      }
    });

    socket.on('send-message', async (data: { channelId: string; content: string; replyToId?: string }) => {
      const { channelId, content, replyToId } = data;

      // Validate input
      if (!channelId || typeof channelId !== 'string') return;
      if (!content || typeof content !== 'string' || !content.trim()) return;
      if (content.length > 4000) {
        socket.emit('message-error', { error: 'Message too long (max 4000 chars)' });
        return;
      }

      try {
        // Resolve serverId from the channel
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { serverId: true, readPermission: true, readRoleIds: true },
        });
        if (!channel) {
          socket.emit('message-error', { error: 'Channel not found' });
          return;
        }
        const serverId = channel.serverId;

        // Sender must also be allowed to read (can't post where you can't see).
        if (channel.readPermission) {
          const access = await resolveMemberAccess(pubkey, serverId);
          if (!canReadChannel(access.role, channel, access.customRoleIds)) {
            socket.emit('message-error', { error: 'Channel not found' });
            return;
          }
        }

        // Check ban/mute before allowing message
        const ban = await prisma.ban.findUnique({
          where: { serverId_pubkey: { serverId, pubkey } },
        });
        if (ban) {
          socket.emit('message-error', { error: 'You are banned from this server' });
          return;
        }

        const activeMute = await prisma.mute.findFirst({
          where: { serverId, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
        });
        if (activeMute) {
          socket.emit('message-error', {
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

        io.to(`channel:${channelId}`).emit('new-message', enriched);

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
            const targetSockets = pubkeySockets.get(mentionedPubkey);
            if (!targetSockets) continue;
            // 'reply' vs 'mention' gives the client room to tailor copy/sound later.
            const notifType = mentionedPubkey === replyTargetPubkey && !mentionedPubkeys.includes(mentionedPubkey)
              ? 'reply'
              : 'mention';
            for (const sid of targetSockets) {
              io.to(sid).emit('notification', {
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
        for (const [memberPubkey, memberSocketIds] of pubkeySockets) {
          if (memberPubkey === pubkey) continue; // don't notify sender
          if (channelPubkeys.has(memberPubkey)) continue; // already in channel
          if (channel.readPermission) {
            const access = await resolveMemberAccess(memberPubkey, serverId);
            if (!canReadChannel(access.role, channel, access.customRoleIds)) continue;
          }
          for (const sid of memberSocketIds) {
            io.to(sid).emit('unread-update', {
              channelId,
              serverId,
              hasMention: mentionedSet.has(memberPubkey),
              preview: content.slice(0, 100),
            });
          }
        }
      } catch (err) {
        console.error('[socket] Failed to create message:', err);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    socket.on('edit-message', async (data: { messageId: string; channelId: string; content: string }) => {
      const { messageId, channelId, content } = data;

      if (!messageId || !channelId || !content?.trim()) return;
      if (content.length > 4000) {
        socket.emit('message-error', { error: 'Message too long (max 4000 chars)' });
        return;
      }

      try {
        const existing = await prisma.message.findUnique({
          where: { id: messageId },
          select: { authorPubkey: true, channelId: true, deletedAt: true },
        });

        if (!existing || existing.deletedAt || existing.channelId !== channelId || existing.authorPubkey !== pubkey) {
          socket.emit('message-error', { error: 'Cannot edit this message' });
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

        io.to(`channel:${channelId}`).emit('message-edited', updated);
      } catch (err) {
        console.error('[socket] Failed to edit message:', err);
        socket.emit('message-error', { error: 'Failed to edit message' });
      }
    });

    socket.on('toggle-reaction', async (data: { messageId: string; channelId: string; emoji: string }) => {
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

        io.to(`channel:${channelId}`).emit('reaction-updated', { messageId, reactions });
      } catch (err) {
        console.error('[socket] Failed to toggle reaction:', err);
      }
    });

    socket.on('delete-message', async (data: { messageId: string; channelId: string }) => {
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
          socket.emit('message-error', { error: 'Cannot delete this message' });
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
          socket.emit('message-error', { error: 'Cannot delete this message' });
          return;
        }

        await prisma.message.update({
          where: { id: messageId },
          data: { deletedAt: new Date() },
        });

        io.to(`channel:${channelId}`).emit('message-deleted', { messageId });
      } catch (err) {
        console.error('[socket] Failed to delete message:', err);
        socket.emit('message-error', { error: 'Failed to delete message' });
      }
    });

    socket.on('typing', (channelId: string) => {
      if (typeof channelId === 'string' && channelId.length > 0) {
        socket.to(`channel:${channelId}`).emit('user-typing', { pubkey, channelId });
      }
    });

    // DM typing indicator
    socket.on('dm-typing', (targetPubkey: string) => {
      if (typeof targetPubkey === 'string') {
        const targetSockets = pubkeySockets.get(targetPubkey);
        if (targetSockets) {
          for (const sid of targetSockets) {
            io.to(sid).emit('dm-user-typing', { pubkey });
          }
        }
      }
    });

    // ── Mark channel as read (via socket to avoid HTTP round-trip) ──
    socket.on('mark-read', async (data: { channelId: string; lastMessageId?: string }) => {
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
          pubkeySockets,
          pubkey,
          socket.id,
          'read-update',
          { channelId: data.channelId },
          (sid, event, payload) => io.to(sid).emit(event, payload),
        );
      } catch (err) {
        console.error('[socket] Failed to mark read:', err);
      }
    });

    // ── Mark DM thread as read (via socket, mirrors /api/dm/:pubkey/read) ──
    socket.on('dm-read', async (data: { pubkey: string }) => {
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
          pubkeySockets,
          pubkey,
          socket.id,
          'dm-read-update',
          { pubkey: data.pubkey },
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
        const pk = voiceSocketPubkey.get(sid);
        if (pk) peers.push({ socketId: sid, pubkey: pk });
      }
      return peers;
    };

    socket.on('join-voice', async (channelId: string, cb?: (res: any) => void) => {
      if (!channelId || typeof channelId !== 'string') return;
      try {
        await prisma.voiceState.upsert({
          where: { channelId_pubkey: { channelId, pubkey } },
          update: {},
          create: { channelId, pubkey },
        });
        const peers = getVoicePeers(channelId, socket.id);
        socket.join(`voice:${channelId}`);
        voiceSockets.set(socket.id, channelId);
        voiceSocketPubkey.set(socket.id, pubkey);

        // Tell existing peers a newcomer arrived.
        socket.to(`voice:${channelId}`).emit('voice-peer-joined', {
          socketId: socket.id,
          pubkey,
        });

        const participants = await prisma.voiceState.findMany({
          where: { channelId },
          select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
        });
        io.to(`voice:${channelId}`).emit('voice-state-update', { channelId, participants });

        cb?.({ selfSocketId: socket.id, peers });
      } catch (err) {
        console.error('[socket] Failed to join voice:', err);
        cb?.({ error: 'Failed to join voice channel' });
      }
    });

    socket.on('leave-voice', async (channelId: string) => {
      if (!channelId || typeof channelId !== 'string') return;
      try {
        socket.to(`voice:${channelId}`).emit('voice-peer-left', {
          socketId: socket.id,
          pubkey,
        });
        screenSharers.get(channelId)?.delete(pubkey);
        if (screenSharers.get(channelId)?.size === 0) screenSharers.delete(channelId);
        cameraSharers.get(channelId)?.delete(pubkey);
        if (cameraSharers.get(channelId)?.size === 0) cameraSharers.delete(channelId);
        voiceSockets.delete(socket.id);
        voiceSocketPubkey.delete(socket.id);
        await prisma.voiceState.deleteMany({ where: { channelId, pubkey } });
        socket.leave(`voice:${channelId}`);
        const participants = await prisma.voiceState.findMany({
          where: { channelId },
          select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
        });
        io.to(`voice:${channelId}`).emit('voice-state-update', { channelId, participants });
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
      if (voiceSockets.get(socket.id) !== channelId) return cb?.({ error: 'Not in this voice channel' });
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

    socket.on('voice-screen-claim', (channelId: string, cb?: (res: any) => void) => {
      claimSlot(
        screenSharers, channelId, MAX_SCREENS_PER_CHANNEL,
        `Screen-share limit reached (${MAX_SCREENS_PER_CHANNEL}). Please wait until someone else stops sharing.`,
        cb,
      );
    });
    socket.on('voice-screen-release', (channelId: string) => releaseSlot(screenSharers, channelId));

    socket.on('voice-camera-claim', (channelId: string, cb?: (res: any) => void) => {
      claimSlot(
        cameraSharers, channelId, MAX_CAMERAS_PER_CHANNEL,
        `Camera limit reached (${MAX_CAMERAS_PER_CHANNEL}). Please wait until someone else turns off their camera.`,
        cb,
      );
    });
    socket.on('voice-camera-release', (channelId: string) => releaseSlot(cameraSharers, channelId));

    // Moderator actions in voice: mute / turn off camera / stop screen share of a target.
    // Requires caller to be owner/admin/mod of the server that owns the channel.
    socket.on('voice-mod-action', async (
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

        const targetSocketIds = pubkeySockets.get(targetPubkey);
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
          if (voiceSockets.get(sid) !== channelId) continue;
          io.to(sid).emit(event, { reason: `A moderator ${action === 'mute' ? 'muted you' : action === 'camera-off' ? 'turned off your camera' : 'stopped your screen share'}` });
        }
        // If we forced camera/screen off, also release the slot so others can use it.
        if (action === 'camera-off') {
          cameraSharers.get(channelId)?.delete(targetPubkey);
          if (cameraSharers.get(channelId)?.size === 0) cameraSharers.delete(channelId);
        }
        if (action === 'screen-off') {
          screenSharers.get(channelId)?.delete(targetPubkey);
          if (screenSharers.get(channelId)?.size === 0) screenSharers.delete(channelId);
        }
        // Mirror mute state in DB so the UI indicator updates.
        if (action === 'mute') {
          try {
            await prisma.voiceState.update({
              where: { channelId_pubkey: { channelId, pubkey: targetPubkey } },
              data: { muted: true },
            });
            io.to(`voice:${channelId}`).emit('voice-state-update', {
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
    socket.on('voice-signal', ({ toSocketId, payload }: { toSocketId: string; payload: any }) => {
      if (!toSocketId || typeof toSocketId !== 'string' || !payload) return;
      const fromChannel = voiceSockets.get(socket.id);
      const toChannel = voiceSockets.get(toSocketId);
      // Only allow signaling between peers in the same voice channel.
      if (!fromChannel || fromChannel !== toChannel) return;
      io.to(toSocketId).emit('voice-signal', {
        fromSocketId: socket.id,
        fromPubkey: pubkey,
        payload,
      });
    });

    socket.on('voice-mute', async ({ channelId, muted }: { channelId: string; muted: boolean }) => {
      if (!channelId) return;
      try {
        await prisma.voiceState.update({
          where: { channelId_pubkey: { channelId, pubkey } },
          data: { muted },
        });
        io.to(`voice:${channelId}`).emit('voice-state-update', {
          channelId,
          participants: await prisma.voiceState.findMany({
            where: { channelId },
            select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
          }),
        });
      } catch {}
    });

    socket.on('voice-deafen', async ({ channelId, deafened }: { channelId: string; deafened: boolean }) => {
      if (!channelId) return;
      try {
        await prisma.voiceState.update({
          where: { channelId_pubkey: { channelId, pubkey } },
          data: { deafened, muted: deafened ? true : undefined },
        });
        io.to(`voice:${channelId}`).emit('voice-state-update', {
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
      const voiceChannelId = voiceSockets.get(socket.id);
      if (voiceChannelId) {
        socket.to(`voice:${voiceChannelId}`).emit('voice-peer-left', {
          socketId: socket.id,
          pubkey,
        });
      }
      if (voiceChannelId) {
        screenSharers.get(voiceChannelId)?.delete(pubkey);
        if (screenSharers.get(voiceChannelId)?.size === 0) screenSharers.delete(voiceChannelId);
        cameraSharers.get(voiceChannelId)?.delete(pubkey);
        if (cameraSharers.get(voiceChannelId)?.size === 0) cameraSharers.delete(voiceChannelId);
      }
      voiceSockets.delete(socket.id);
      voiceSocketPubkey.delete(socket.id);

      pubkeySockets.get(pubkey)?.delete(socket.id);
      if (pubkeySockets.get(pubkey)?.size === 0) {
        pubkeySockets.delete(pubkey);
        // Presence: announce offline on last socket disconnect (before DB cleanup)
        io.emit('presence-update', { pubkey, online: false });
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
              io.to(`voice:${vs.channelId}`).emit('voice-state-update', { channelId: vs.channelId, participants });
            }
          }
        } catch {}
      }
      console.log(`[socket] Disconnected: ${pubkey.slice(0, 8)}...`);
    });
  });

  // Helper: force disconnect a pubkey (called from API routes via globalThis)
  (globalThis as any).__disconnectPubkey = (targetPubkey: string, reason: string) => {
    const sockets = pubkeySockets.get(targetPubkey);
    if (sockets) {
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.emit('force-disconnect', { reason });
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
  });
});
