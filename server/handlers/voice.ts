// server/handlers/voice.ts
// Voice channel handlers — P2P signaling, mute/deafen, moderator actions
// (force mute, camera off, screen off), capacity-gated camera/screen
// sharing.

import type { Socket } from 'socket.io';
import type { ServerContext } from '../context';
import { ServerToClient, ClientToServer } from '../../src/lib/socket-events';

// Per-voice-channel caps on concurrent camera / screen streams.
const MAX_CAMERAS_PER_CHANNEL = 4;
const MAX_SCREENS_PER_CHANNEL = 2;

export function register(ctx: ServerContext, socket: Socket): void {
  const pubkey = socket.data.pubkey as string;
  const { io, prisma, state } = ctx;

  // ── Voice channel events (P2P mesh — signaling only) ─────────

  // Helper: return peers currently in a voice channel (excluding a socket).
  const getVoicePeers = (channelId: string, excludeSocketId?: string) => {
    const room = io.sockets.adapter.rooms.get(`voice:${channelId}`);
    if (!room) return [];
    const peers: Array<{ socketId: string; pubkey: string }> = [];
    for (const sid of room) {
      if (sid === excludeSocketId) continue;
      const pk = state.voiceSocketPubkey.get(sid);
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
      state.voiceSockets.set(socket.id, channelId);
      state.voiceSocketPubkey.set(socket.id, pubkey);

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
      state.screenSharers.get(channelId)?.delete(pubkey);
      if (state.screenSharers.get(channelId)?.size === 0) state.screenSharers.delete(channelId);
      state.cameraSharers.get(channelId)?.delete(pubkey);
      if (state.cameraSharers.get(channelId)?.size === 0) state.cameraSharers.delete(channelId);
      state.voiceSockets.delete(socket.id);
      state.voiceSocketPubkey.delete(socket.id);
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
    if (state.voiceSockets.get(socket.id) !== channelId) return cb?.({ error: 'Not in this voice channel' });
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
      state.screenSharers, channelId, MAX_SCREENS_PER_CHANNEL,
      `Screen-share limit reached (${MAX_SCREENS_PER_CHANNEL}). Please wait until someone else stops sharing.`,
      cb,
    );
  });
  socket.on(ClientToServer.VoiceScreenRelease, (channelId: string) => releaseSlot(state.screenSharers, channelId));

  socket.on(ClientToServer.VoiceCameraClaim, (channelId: string, cb?: (res: any) => void) => {
    claimSlot(
      state.cameraSharers, channelId, MAX_CAMERAS_PER_CHANNEL,
      `Camera limit reached (${MAX_CAMERAS_PER_CHANNEL}). Please wait until someone else turns off their camera.`,
      cb,
    );
  });
  socket.on(ClientToServer.VoiceCameraRelease, (channelId: string) => releaseSlot(state.cameraSharers, channelId));

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
      const { isInstanceOwner } = await import('../../src/lib/instance-owner');
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

      const targetSocketIds = state.pubkeySockets.get(targetPubkey);
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
        if (state.voiceSockets.get(sid) !== channelId) continue;
        io.to(sid).emit(event, { reason: `A moderator ${action === 'mute' ? 'muted you' : action === 'camera-off' ? 'turned off your camera' : 'stopped your screen share'}` });
      }
      // If we forced camera/screen off, also release the slot so others can use it.
      if (action === 'camera-off') {
        state.cameraSharers.get(channelId)?.delete(targetPubkey);
        if (state.cameraSharers.get(channelId)?.size === 0) state.cameraSharers.delete(channelId);
      }
      if (action === 'screen-off') {
        state.screenSharers.get(channelId)?.delete(targetPubkey);
        if (state.screenSharers.get(channelId)?.size === 0) state.screenSharers.delete(channelId);
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
    const fromChannel = state.voiceSockets.get(socket.id);
    const toChannel = state.voiceSockets.get(toSocketId);
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
}
