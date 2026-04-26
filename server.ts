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
  const { register: registerVoice } = await import('./server/handlers/voice');

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
    registerVoice(ctx, socket);

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
