// server/index.ts
// Custom Next.js + Socket.io server entry point. Wires ServerContext into
// every handler module. Bootstrap routines (profile sync, bot poller,
// games rehydrate) start in httpServer.listen so the listener is bound
// first.

import next from 'next';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { Server as SocketServer } from 'socket.io';
import { parse } from 'url';
import { ServerToClient } from '../src/lib/socket-events';

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
  // Dynamic imports keep Next.js module resolution intact.
  const { prisma } = await import('../src/lib/db-server');
  const { authMiddleware } = await import('./auth-middleware');
  const { createServerContext } = await import('./context');
  const { bindContext } = await import('./api-bridge');
  const { register: registerPresence } = await import('./handlers/presence');
  const { register: registerRooms } = await import('./handlers/rooms');
  const { register: registerTyping } = await import('./handlers/typing');
  const { register: registerReactions } = await import('./handlers/reactions');
  const { register: registerReadState } = await import('./handlers/read-state');
  const { register: registerMessages } = await import('./handlers/messages');
  const { register: registerVoice } = await import('./handlers/voice');
  const { register: registerDisconnect } = await import('./handlers/disconnect');
  const profileSync = await import('./bootstrap/profile-sync');
  const botPoller = await import('./bootstrap/bot-poller');
  const games = await import('./bootstrap/games');

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

  // Make io accessible from API routes (legacy — 24 routes still read this).
  // New code should import from `@/server/api-bridge` instead.
  (globalThis as any).__io = io;

  const ctx = createServerContext(io, prisma);
  bindContext(ctx);

  io.use(authMiddleware(ctx));

  io.on('connection', (socket) => {
    registerPresence(ctx, socket);
    registerRooms(ctx, socket);
    registerTyping(ctx, socket);
    registerReactions(ctx, socket);
    registerReadState(ctx, socket);
    registerMessages(ctx, socket);
    registerVoice(ctx, socket);
    registerDisconnect(ctx, socket); // last — runs cleanup
  });

  // Helper: force disconnect a pubkey (called from API routes via globalThis).
  // Prefer `disconnectPubkey()` from `@/server/api-bridge` in new code.
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

  // Helper: emit moderation events. Prefer `emitModEvent()` from
  // `@/server/api-bridge` in new code.
  (globalThis as any).__emitModEvent = (event: string, data: any) => {
    io.emit(event, data);
  };

  httpServer.listen(port, hostname, async () => {
    const proto = useHttps ? 'https' : 'http';
    console.log(`> Obelisk ready on ${proto}://${hostname}:${port}`);

    profileSync.start(ctx);
    botPoller.start(ctx);
    games.start(ctx);
  });
});
