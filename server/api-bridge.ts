// server/api-bridge.ts
// Typed bridge between Next.js API routes and the live Socket.io server.
// Replaces the untyped `globalThis.__io`, `__disconnectPubkey`, and
// `__emitModEvent` accesses. Bound once at boot (server/index.ts) via
// `bindContext()`. API routes call `getIO()` etc. — no globalThis touching.

import type { Server as IOServer } from 'socket.io';
import type { ServerContext } from './context';

let activeContext: ServerContext | null = null;

export function bindContext(ctx: ServerContext): void {
  activeContext = ctx;
}

export function getContext(): ServerContext {
  if (!activeContext) {
    throw new Error('ServerContext not bound — server/index.ts must call bindContext at boot');
  }
  return activeContext;
}

export function getIO(): IOServer {
  return getContext().io;
}

export function disconnectPubkey(pubkey: string, reason: string): void {
  const { io, state } = getContext();
  const sockets = state.pubkeySockets.get(pubkey);
  if (!sockets) return;
  for (const socketId of sockets) {
    const sock = io.sockets.sockets.get(socketId);
    if (sock) {
      sock.emit('ForceDisconnect', { reason });
      sock.disconnect(true);
    }
  }
}

export function emitModEvent(serverId: string, event: string, payload: unknown): void {
  getIO().to(`server:${serverId}`).emit(event, payload);
}
