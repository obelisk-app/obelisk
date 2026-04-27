// server/auth-middleware.ts
// Socket.io connection-time auth. Parses the session cookie from the
// handshake, validates against the Session table, and attaches the
// pubkey to socket.data for downstream handlers.

import type { Socket } from 'socket.io';
import type { ServerContext } from './context';

type NextFn = (err?: Error) => void;

export function authMiddleware(ctx: ServerContext) {
  return async (socket: Socket, next: NextFn) => {
    const cookie = socket.handshake.headers.cookie;
    if (!cookie) return next(new Error('No cookie'));

    const sessionToken = cookie
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('session='))
      ?.split('=')[1];

    if (!sessionToken) return next(new Error('No session'));

    try {
      const session = await ctx.prisma.session.findUnique({ where: { token: sessionToken } });
      if (!session || new Date() > session.expiresAt) {
        return next(new Error('Invalid session'));
      }
      socket.data.pubkey = session.pubkey;
      next();
    } catch {
      next(new Error('Auth error'));
    }
  };
}
