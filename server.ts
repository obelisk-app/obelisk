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
  const { authMiddleware } = await import('./server/auth-middleware');
  const { createServerContext } = await import('./server/context');
  const { bindContext } = await import('./server/api-bridge');
  const { register: registerPresence } = await import('./server/handlers/presence');
  const { register: registerRooms } = await import('./server/handlers/rooms');
  const { register: registerTyping } = await import('./server/handlers/typing');
  const { register: registerReactions } = await import('./server/handlers/reactions');
  const { register: registerReadState } = await import('./server/handlers/read-state');
  const { register: registerMessages } = await import('./server/handlers/messages');

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
    registerReactions(ctx, socket);
    registerReadState(ctx, socket);
    registerMessages(ctx, socket);

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
