import next from 'next';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { Server as SocketServer } from 'socket.io';
import { parse } from 'url';
import * as mediasoup from 'mediasoup';
import { workerSettings, routerOptions } from './src/lib/mediasoup-config';
import { MediasoupRoom } from './src/lib/mediasoup-room';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// Use HTTPS in dev if certs exist (needed for NIP-07 on LAN)
const certPath = './cert.pem';
const keyPath = './key.pem';
const useHttps = dev && existsSync(certPath) && existsSync(keyPath);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// mediasoup worker + voice rooms
let msWorker: mediasoup.types.Worker;
const voiceRooms = new Map<string, MediasoupRoom>(); // channelId → room
// Track which socket is in which voice channel
const voiceSockets = new Map<string, string>(); // socketId → channelId

app.prepare().then(async () => {
  // Dynamic import to let Next.js set up its module resolution first
  const { prisma } = await import('./src/lib/db-server');

  // Start mediasoup worker
  msWorker = await mediasoup.createWorker(workerSettings);
  msWorker.on('died', () => {
    console.error('[mediasoup] Worker died, restarting in 2s...');
    setTimeout(async () => {
      msWorker = await mediasoup.createWorker(workerSettings);
    }, 2000);
  });
  console.log(`[mediasoup] Worker started (pid: ${msWorker.pid}, ports: ${workerSettings.rtcMinPort}-${workerSettings.rtcMaxPort})`);

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

    socket.on('join-channel', (channelId: string) => {
      if (typeof channelId === 'string' && channelId.length > 0) {
        socket.join(`channel:${channelId}`);
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
          select: { serverId: true },
        });
        if (!channel) {
          socket.emit('message-error', { error: 'Channel not found' });
          return;
        }
        const serverId = channel.serverId;

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

        io.to(`channel:${channelId}`).emit('new-message', message);

        // Extract mentions and create Mention records
        const mentionRegex = /nostr:npub1([a-f0-9]{64})/g;
        const mentionedPubkeys: string[] = [];
        let mentionMatch: RegExpExecArray | null;
        while ((mentionMatch = mentionRegex.exec(content)) !== null) {
          mentionedPubkeys.push(mentionMatch[1]);
        }

        if (mentionedPubkeys.length > 0) {
          const uniquePubkeys = [...new Set(mentionedPubkeys)];

          // Bulk-create Mention rows (skip duplicates)
          await prisma.mention.createMany({
            data: uniquePubkeys.map(pk => ({
              messageId: message.id,
              pubkey: pk,
              channelId,
            })),
            skipDuplicates: true,
          });

          // Notify mentioned users via their sockets
          const preview = content.slice(0, 100);
          for (const mentionedPubkey of uniquePubkeys) {
            if (mentionedPubkey === pubkey) continue; // don't notify self
            const targetSockets = pubkeySockets.get(mentionedPubkey);
            if (targetSockets) {
              for (const sid of targetSockets) {
                io.to(sid).emit('notification', {
                  type: 'mention',
                  channelId,
                  serverId,
                  messageId: message.id,
                  senderPubkey: pubkey,
                  preview,
                  createdAt: message.createdAt,
                });
              }
            }
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

        // Find all server members who are online but NOT in this channel
        for (const [memberPubkey, memberSocketIds] of pubkeySockets) {
          if (memberPubkey === pubkey) continue; // don't notify sender
          if (channelPubkeys.has(memberPubkey)) continue; // already in channel
          for (const sid of memberSocketIds) {
            io.to(sid).emit('unread-update', {
              channelId,
              serverId,
              hasMention: mentionedPubkeys.includes(memberPubkey),
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
          select: { authorPubkey: true, channelId: true, deletedAt: true },
        });

        if (!existing || existing.deletedAt || existing.channelId !== channelId || existing.authorPubkey !== pubkey) {
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
      } catch (err) {
        console.error('[socket] Failed to mark read:', err);
      }
    });

    // ── Voice channel events (mediasoup SFU) ─────────────────────

    socket.on('join-voice', async (channelId: string, cb?: (res: any) => void) => {
      if (!channelId || typeof channelId !== 'string') return;
      try {
        // DB state
        await prisma.voiceState.upsert({
          where: { channelId_pubkey: { channelId, pubkey } },
          update: {},
          create: { channelId, pubkey },
        });
        socket.join(`voice:${channelId}`);
        voiceSockets.set(socket.id, channelId);

        // Create or get mediasoup room
        let room = voiceRooms.get(channelId);
        if (!room) {
          const router = await msWorker.createRouter(routerOptions);
          room = new MediasoupRoom(channelId, router);
          voiceRooms.set(channelId, room);
        }
        room.addPeer(socket.id, pubkey);

        // Broadcast participant update
        const participants = await prisma.voiceState.findMany({
          where: { channelId },
          select: { pubkey: true, muted: true, deafened: true, joinedAt: true },
        });
        io.to(`voice:${channelId}`).emit('voice-state-update', { channelId, participants });

        // Return router capabilities + existing producers to the joining peer
        const existingProducers = room.getOtherProducers(socket.id);
        cb?.({ rtpCapabilities: room.rtpCapabilities, existingProducers });
      } catch (err) {
        console.error('[socket] Failed to join voice:', err);
        cb?.({ error: 'Failed to join voice channel' });
      }
    });

    socket.on('leave-voice', async (channelId: string) => {
      if (!channelId || typeof channelId !== 'string') return;
      try {
        // Clean up mediasoup peer
        const room = voiceRooms.get(channelId);
        if (room) {
          // Notify others about closed producers
          const peer = room.getPeer(socket.id);
          if (peer) {
            for (const producer of peer.producers.values()) {
              socket.to(`voice:${channelId}`).emit('producer-closed', { producerId: producer.id });
            }
          }
          room.removePeer(socket.id);
          if (room.isEmpty) {
            room.close();
            voiceRooms.delete(channelId);
          }
        }

        voiceSockets.delete(socket.id);
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

    // ── mediasoup signaling events ─────────────────────────────

    socket.on('create-transport', async (_data: unknown, cb?: (res: any) => void) => {
      const channelId = voiceSockets.get(socket.id);
      if (!channelId) return cb?.({ error: 'Not in a voice channel' });
      const room = voiceRooms.get(channelId);
      if (!room) return cb?.({ error: 'Room not found' });
      try {
        const transport = await room.createWebRtcTransport();
        const peer = room.getPeer(socket.id);
        if (!peer) return cb?.({ error: 'Peer not found' });
        peer.transports.set(transport.id, transport);
        cb?.({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err: any) {
        console.error('[mediasoup] create-transport error:', err);
        cb?.({ error: err.message });
      }
    });

    socket.on('connect-transport', async ({ transportId, dtlsParameters }: any, cb?: (res: any) => void) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      if (!peer) return cb?.({ error: 'Peer not found' });
      try {
        await peer.connectTransport(transportId, dtlsParameters);
        cb?.({ success: true });
      } catch (err: any) {
        console.error('[mediasoup] connect-transport error:', err);
        cb?.({ error: err.message });
      }
    });

    socket.on('produce', async ({ transportId, kind, rtpParameters, appData }: any, cb?: (res: any) => void) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      if (!peer || !room) return cb?.({ error: 'Peer not found' });
      try {
        const producer = await peer.createProducer(transportId, kind, rtpParameters, appData || {});
        cb?.({ id: producer.id });
        // Notify all other peers in the room
        socket.to(`voice:${channelId}`).emit('new-producer', {
          producerId: producer.id,
          pubkey,
          kind: producer.kind,
          appData: producer.appData,
        });
      } catch (err: any) {
        console.error('[mediasoup] produce error:', err);
        cb?.({ error: err.message });
      }
    });

    socket.on('consume', async ({ transportId, producerId, rtpCapabilities }: any, cb?: (res: any) => void) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      if (!peer || !room) return cb?.({ error: 'Peer not found' });
      try {
        const consumer = await peer.createConsumer(transportId, producerId, rtpCapabilities, room.router);
        if (!consumer) return cb?.({ error: 'Cannot consume' });
        cb?.({
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err: any) {
        console.error('[mediasoup] consume error:', err);
        cb?.({ error: err.message });
      }
    });

    socket.on('resume-consumer', async ({ consumerId }: any, cb?: (res: any) => void) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      const consumer = peer?.consumers.get(consumerId);
      if (consumer) { await consumer.resume(); }
      cb?.({ success: true });
    });

    socket.on('producer-pause', async ({ producerId }: any) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      const producer = peer?.producers.get(producerId);
      if (producer) { await producer.pause(); }
    });

    socket.on('producer-resume', async ({ producerId }: any) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      const producer = peer?.producers.get(producerId);
      if (producer) { await producer.resume(); }
    });

    socket.on('producer-close', async ({ producerId }: any) => {
      const channelId = voiceSockets.get(socket.id);
      const room = channelId ? voiceRooms.get(channelId) : null;
      const peer = room?.getPeer(socket.id);
      const producer = peer?.producers.get(producerId);
      if (producer) {
        producer.close();
        peer!.producers.delete(producerId);
        if (channelId) {
          socket.to(`voice:${channelId}`).emit('producer-closed', { producerId });
        }
      }
    });

    socket.on('disconnect', async () => {
      // Clean up mediasoup peer
      const voiceChannelId = voiceSockets.get(socket.id);
      if (voiceChannelId) {
        const room = voiceRooms.get(voiceChannelId);
        if (room) {
          const peer = room.getPeer(socket.id);
          if (peer) {
            for (const producer of peer.producers.values()) {
              socket.to(`voice:${voiceChannelId}`).emit('producer-closed', { producerId: producer.id });
            }
          }
          room.removePeer(socket.id);
          if (room.isEmpty) {
            room.close();
            voiceRooms.delete(voiceChannelId);
          }
        }
      }
      voiceSockets.delete(socket.id);

      pubkeySockets.get(pubkey)?.delete(socket.id);
      if (pubkeySockets.get(pubkey)?.size === 0) {
        pubkeySockets.delete(pubkey);
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
