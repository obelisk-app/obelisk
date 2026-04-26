// server/handlers/read-state.ts
// MarkRead / MarkMentionRead / DMRead handlers. Persist the read cursor
// then fan out to the user's other sockets so badges clear across tabs.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ClientToServer } from '../../src/lib/socket-events';
import { fanOutReadUpdate } from '../../src/lib/read-fanout';

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, state, prisma } = ctx;

  // ── Mark channel as read (via socket to avoid HTTP round-trip) ──
  socket.on(ClientToServer.MarkRead, async (data: { channelId: string; lastMessageId?: string }) => {
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
        state.pubkeySockets,
        pubkey,
        socket.id,
        'read-update',
        { recipientPubkey: pubkey, channelId: data.channelId },
        (sid, event, payload) => io.to(sid).emit(event, payload),
      );
    } catch (err) {
      console.error('[socket] Failed to mark read:', err);
    }
  });

  // ── Mark mentions as seen (flag-only clear; distinct from mark-read) ──
  // Fires as soon as the viewer opens the channel, without waiting for them
  // to scroll to the bottom. Only advances the mention cursor so future
  // `/api/unread` calls stop flagging this channel; the unread message
  // count continues to track `lastReadAt` independently.
  socket.on(ClientToServer.MarkMentionRead, async (data: { channelId: string }) => {
    if (!data?.channelId || typeof data.channelId !== 'string') return;
    try {
      await prisma.channelReadState.upsert({
        where: { channelId_pubkey: { channelId: data.channelId, pubkey } },
        create: {
          channelId: data.channelId,
          pubkey,
          lastMentionReadAt: new Date(),
        },
        update: {
          lastMentionReadAt: new Date(),
        },
      });

      fanOutReadUpdate(
        state.pubkeySockets,
        pubkey,
        socket.id,
        'mention-read-update',
        { recipientPubkey: pubkey, channelId: data.channelId },
        (sid, event, payload) => io.to(sid).emit(event, payload),
      );
    } catch (err) {
      console.error('[socket] Failed to mark mention read:', err);
    }
  });

  // ── Mark DM thread as read (via socket, mirrors /api/dm/:pubkey/read) ──
  socket.on(ClientToServer.DMRead, async (data: { pubkey: string }) => {
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
        state.pubkeySockets,
        pubkey,
        socket.id,
        'dm-read-update',
        { recipientPubkey: pubkey, pubkey: data.pubkey },
        (sid, event, payload) => io.to(sid).emit(event, payload),
      );
    } catch (err) {
      console.error('[socket] Failed to mark DM read:', err);
    }
  });
}
