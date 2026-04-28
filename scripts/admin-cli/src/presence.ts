import { io, Socket } from 'socket.io-client';
import { ctxFromSession } from './http';

export type PresenceHandle = {
  socket: Socket;
  baseUrl: string;
  pubkey?: string;
  close: () => Promise<void>;
};

/**
 * Open a Socket.io connection using the persisted session cookie and hold it
 * open. The server broadcasts `presence-update { online: true }` on the first
 * socket for a pubkey, so this is what makes Archon appear "connected" to
 * other clients for the lifetime of the CLI process.
 */
export async function openPresence(): Promise<PresenceHandle> {
  const ctx = ctxFromSession();
  if (!ctx.cookie) throw new Error('No session cookie. Run: login --nsec-file <path>');

  const socket: Socket = io(ctx.baseUrl, {
    transports: ['websocket', 'polling'],
    extraHeaders: { Cookie: ctx.cookie },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => { cleanup(); resolve(); };
    const onError = (err: Error) => { cleanup(); reject(err); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Connection timed out after 15s')); }, 15_000);
    function cleanup() {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    }
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });

  return {
    socket,
    baseUrl: ctx.baseUrl,
    pubkey: (ctx as any).pubkey,
    async close() {
      await new Promise<void>((resolve) => {
        if (socket.disconnected) return resolve();
        socket.once('disconnect', () => resolve());
        socket.disconnect();
        setTimeout(() => resolve(), 1000);
      });
    },
  };
}
