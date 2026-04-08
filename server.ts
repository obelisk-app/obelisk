import next from 'next';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { parse } from 'url';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Dynamic import to let Next.js set up its module resolution first
  const { prisma } = await import('./src/lib/db-server');

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketServer(httpServer, {
    cors: {
      origin: dev ? [`http://${hostname}:${port}`] : [],
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
        // Check ban/mute before allowing message
        const server = await prisma.server.findFirst({ select: { id: true } });
        if (server) {
          const ban = await prisma.ban.findUnique({
            where: { serverId_pubkey: { serverId: server.id, pubkey } },
          });
          if (ban) {
            socket.emit('message-error', { error: 'You are banned from this server' });
            return;
          }

          const activeMute = await prisma.mute.findFirst({
            where: { serverId: server.id, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
          });
          if (activeMute) {
            socket.emit('message-error', {
              error: 'You are muted',
              mutedUntil: activeMute.expiresAt,
            });
            return;
          }
        }

        const message = await prisma.message.create({
          data: {
            channelId,
            authorPubkey: pubkey,
            content: content.trim(),
            replyToId: replyToId || null,
          },
        });

        io.to(`channel:${channelId}`).emit('new-message', message);
      } catch (err) {
        console.error('[socket] Failed to create message:', err);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    socket.on('typing', (channelId: string) => {
      if (typeof channelId === 'string' && channelId.length > 0) {
        socket.to(`channel:${channelId}`).emit('user-typing', { pubkey, channelId });
      }
    });

    socket.on('disconnect', () => {
      pubkeySockets.get(pubkey)?.delete(socket.id);
      if (pubkeySockets.get(pubkey)?.size === 0) pubkeySockets.delete(pubkey);
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

  httpServer.listen(port, () => {
    console.log(`> Obelisk ready on http://${hostname}:${port}`);
  });
});
