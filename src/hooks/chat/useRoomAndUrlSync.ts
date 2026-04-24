'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import { useChatStore } from '@/store/chat';
import { useGamesStore } from '@/store/games';

type Args = {
  socketRef: MutableRefObject<Socket | null>;
  activeServerId: string | null;
  activeChannelId: string | null;
  activePostId: string | null;
  prevChannelRef: MutableRefObject<string | null>;
  activeChannelIdRef: MutableRefObject<string | null>;
};

/**
 * Keeps three browser-facing side-effects in sync with the active
 * server/channel/post:
 *   - Mirror the active ids into `?s=&c=&p=` so a refresh lands on the same
 *     spot (the `m=` scroll anchor is owned by MessageArea).
 *   - Join/leave the channel and server Socket.io rooms as the active ids
 *     flip, plus the fullscreen-game channel coupling logic.
 */
export function useRoomAndUrlSync({
  socketRef,
  activeServerId,
  activeChannelId,
  activePostId,
  prevChannelRef,
  activeChannelIdRef,
}: Args) {
  // Keep URL query params (?s=, ?c=) in sync with active server/channel so
  // that a browser refresh lands the user back on the same spot. The ?m=
  // param (scroll anchor) is managed separately by MessageArea on scroll —
  // we clear it on channel change so the stale message id from the previous
  // channel doesn't leak into the new one.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (activeServerId) sp.set('s', activeServerId);
    else sp.delete('s');
    if (activeChannelId) {
      sp.set('c', activeChannelId);
      sp.delete('m');
    } else {
      sp.delete('c');
      sp.delete('m');
    }
    if (activePostId) sp.set('p', activePostId);
    else sp.delete('p');
    const qs = sp.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [activeServerId, activeChannelId, activePostId]);

  // Join/leave channel rooms. Mark-as-read is deliberately NOT triggered here
  // anymore — useReadTracker below decides when the channel actually becomes
  // "seen" based on visibility + focus + scroll position. Clicking into a
  // channel while backgrounded or scrolled up no longer clears its unread.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    if (prevChannelRef.current) {
      socket.emit('leave-channel', prevChannelRef.current);
    }
    if (activeChannelId) {
      socket.emit('join-channel', activeChannelId);
    }
    prevChannelRef.current = activeChannelId;
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  // When the user enters fullscreen on a game, force the active channel to
  // the game's host channel so the reused MessageArea/MessageInput renders
  // the right chat. If the user later navigates to another channel, drop
  // fullscreen and fall back to the floating dock so they can see normal
  // channel content.
  const fullscreenGameChannelId = useGamesStore((s) => {
    const id = s.fullscreenGameId;
    return id ? s.games[id]?.channelId ?? null : null;
  });
  useEffect(() => {
    if (!fullscreenGameChannelId) return;
    const current = useChatStore.getState().activeChannelId;
    if (current !== fullscreenGameChannelId) {
      useChatStore.getState().setActiveChannel(fullscreenGameChannelId);
    }
  }, [fullscreenGameChannelId]);
  useEffect(() => {
    const fsId = useGamesStore.getState().fullscreenGameId;
    if (!fsId) return;
    const g = useGamesStore.getState().games[fsId];
    if (!g) return;
    if (activeChannelId && activeChannelId !== g.channelId) {
      useGamesStore.getState().setFullscreenGame(null);
      useGamesStore.getState().setOpenGame(fsId);
      useGamesStore.getState().setMinimized(true);
    }
  }, [activeChannelId]);

  // Join the active server room so game-* broadcasts (Actividades panel
  // live updates) reach this socket while this server is the active one.
  const prevServerRef = useRef<string | null>(null);
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (prevServerRef.current) socket.emit('leave-server', prevServerRef.current);
    if (activeServerId) socket.emit('join-server', activeServerId);
    prevServerRef.current = activeServerId;
  }, [activeServerId]);
}
