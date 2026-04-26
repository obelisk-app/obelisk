// server/handlers/presence.ts
// Tracks pubkey → socket IDs and emits PresenceUpdate when a user comes
// online (registers their first socket). Joins a `pubkey:<x>` room so API
// routes can target notifications via io.to(). Offline emission lives in
// the disconnect handler since it depends on the disconnect lifecycle.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ServerToClient, ClientToServer } from '../../src/lib/socket-events';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, state } = ctx;

  console.log(`[socket] Connected: ${pubkey.slice(0, 8)}...`);

  // Track socket
  if (!state.pubkeySockets.has(pubkey)) state.pubkeySockets.set(pubkey, new Set());
  state.pubkeySockets.get(pubkey)!.add(socket.id);

  // Join a pubkey-scoped room so API routes can target notifications
  // (e.g. `post-reply` to forum post subscribers) via io.to('pubkey:<x>').
  socket.join(`pubkey:${pubkey}`);

  // Presence: announce online on first socket for this pubkey
  if (state.pubkeySockets.get(pubkey)!.size === 1) {
    io.emit(ServerToClient.PresenceUpdate, { pubkey, online: true });
  }

  // Presence: snapshot of currently-online pubkeys
  socket.on(ClientToServer.PresenceSync, (cb?: (pubkeys: string[]) => void) => {
    if (typeof cb === 'function') {
      cb([...state.pubkeySockets.keys()]);
    }
  });
}
