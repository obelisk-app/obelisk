'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useChatStore } from '@/store/chat';
import { useNotificationStore } from '@/store/notification';
import type { InitialUrl } from './useSlugResolution';

type Args = {
  sessionChecked: boolean;
  slugResolutionDone: boolean;
  activeServerId: string | null;
  setServers: ReturnType<typeof useChatStore.getState>['setServers'];
  setActiveServer: ReturnType<typeof useChatStore.getState>['setActiveServer'];
  setChannels: ReturnType<typeof useChatStore.getState>['setChannels'];
  setActiveChannel: ReturnType<typeof useChatStore.getState>['setActiveChannel'];
  setActivePostId: ReturnType<typeof useChatStore.getState>['setActivePostId'];
  initialUrlRef: MutableRefObject<InitialUrl | null>;
  pendingHighlightRef: MutableRefObject<{ channelId: string; messageId: string } | null>;
  setInitialForumPostId: (v: string | null) => void;
};

/**
 * Fetches the default-server probe, the viewer's server list, the channel
 * tree for the active server, and handles the `popstate` → in-app navigation
 * flow. Consolidated here so the URL-driven initial-mount logic (which spans
 * three sequential fetches) lives in one place.
 */
export function useServerAndChannelLoader({
  sessionChecked,
  slugResolutionDone,
  activeServerId,
  setServers,
  setActiveServer,
  setChannels,
  setActiveChannel,
  setActivePostId,
  initialUrlRef,
  pendingHighlightRef,
  setInitialForumPostId,
}: Args) {
  const [serversLoaded, setServersLoaded] = useState(false);
  const [hasDefaultServer, setHasDefaultServer] = useState(false);
  const initialUrlAppliedRef = useRef({ server: false, channel: false });

  useEffect(() => {
    fetch('/api/servers/default')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.defaultServer) setHasDefaultServer(true);
      })
      .catch(() => {});
  }, []);

  // Fetch user's servers on mount
  useEffect(() => {
    if (!sessionChecked) return;
    // Wait for `?c=<slug>` resolution so the initial-server picker can see
    // the resolved `s` id. Without this gate, the first server in the list
    // gets selected before the resolver returns and the slug link lands on
    // the wrong server.
    if (!slugResolutionDone) return;

    const fetchServers = async () => {
      try {
        const res = await fetch('/api/servers');
        if (!res.ok) return;
        const data = await res.json();
        setServers(data.servers);
        setServersLoaded(true);
        if (data.servers.length > 0 && !activeServerId) {
          // Prefer the server encoded in the URL (?s=) on the initial mount —
          // this is what makes a browser refresh land on the same server the
          // user was viewing. Fall back to the first server otherwise.
          let chosen: string = data.servers[0].id;
          if (!initialUrlAppliedRef.current.server && initialUrlRef.current?.s) {
            const urlS = initialUrlRef.current.s;
            if (data.servers.some((s: any) => s.id === urlS)) {
              chosen = urlS;
            }
          }
          initialUrlAppliedRef.current.server = true;
          setActiveServer(chosen);
        }
      } catch (err) {
        console.error('Failed to fetch servers:', err);
        setServersLoaded(true);
      }
    };

    fetchServers();
  }, [sessionChecked, slugResolutionDone, setServers, setActiveServer]);

  // Fetch channels for the active server
  useEffect(() => {
    if (!sessionChecked || !activeServerId) return;

    const fetchChannels = async () => {
      try {
        const res = await fetch(`/api/channels?serverId=${activeServerId}`);
        if (!res.ok) return;
        const data = await res.json();

        setChannels(data.pinnedChannels, data.categories);

        // Build channel-server map for notification aggregation
        const allChs = [...data.pinnedChannels, ...data.categories.flatMap((c: any) => c.channels)];
        const map: Record<string, string> = {};
        for (const ch of allChs) map[ch.id] = activeServerId;
        const notifStore = useNotificationStore.getState();
        notifStore.setChannelServerMap({ ...notifStore.channelServerMap, ...map });

        // Choose which channel to auto-select. On the initial mount, prefer
        // the channel encoded in the URL (?c=) so refresh lands the user on
        // the exact channel they were in. Otherwise pick the first pinned
        // channel or the first channel in the first category.
        const allChans = [
          ...data.pinnedChannels,
          ...data.categories.flatMap((c: any) => c.channels),
        ];
        let chosenChannel: string | null = null;
        if (!initialUrlAppliedRef.current.channel && initialUrlRef.current?.c) {
          const urlC = initialUrlRef.current.c;
          if (allChans.some((ch: any) => ch.id === urlC)) {
            chosenChannel = urlC;
          }
        }
        // First-visit landing channel. Only applied when the viewer has never
        // entered this server before (server atomically flips the flag on this
        // same request, so the redirect runs at most once). Explicit URL ?c=
        // still wins above so shared links are honored.
        if (
          !chosenChannel
          && data.viewer?.hasEnteredChat === false
          && data.server?.landingChannelId
          && allChans.some((ch: any) => ch.id === data.server.landingChannelId)
        ) {
          chosenChannel = data.server.landingChannelId;
        }
        if (!chosenChannel) {
          const firstChannel = data.pinnedChannels[0]
            || data.categories[0]?.channels[0];
          if (firstChannel) chosenChannel = firstChannel.id;
        }
        if (chosenChannel) {
          // On initial mount, queue a highlight so MessageArea scrolls to the
          // last-viewed message once messages load for this channel. Prefer
          // the URL ?m= param; fall back to the per-channel last-seen stored
          // in localStorage by MessageArea's scroll observer.
          if (!initialUrlAppliedRef.current.channel) {
            let restoreId: string | null = initialUrlRef.current?.m ?? null;
            if (!restoreId && typeof window !== 'undefined') {
              try {
                restoreId = localStorage.getItem(`chat:lastSeen:${chosenChannel}`);
              } catch {
                restoreId = null;
              }
            }
            if (restoreId) {
              pendingHighlightRef.current = {
                channelId: chosenChannel,
                messageId: restoreId,
              };
            }
          }
          initialUrlAppliedRef.current.channel = true;
          setActiveChannel(chosenChannel);
        }
      } catch (err) {
        console.error('Failed to fetch channels:', err);
      }
    };

    fetchChannels();
  }, [sessionChecked, activeServerId, setChannels, setActiveChannel]);

  // popstate: when a rendered #channel-link pill is clicked (or browser
  // back/forward fires), re-read ?c/?m/?p and navigate in-app. The slug is
  // resolved via the same endpoint used on initial mount.
  useEffect(() => {
    if (!sessionChecked) return;
    const onPop = async () => {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const c = sp.get('c');
      const m = sp.get('m');
      const p = sp.get('p');
      if (!c) return;
      const looksLikeCuid = /^[a-z0-9]{20,32}$/i.test(c) && !c.includes('-');
      let serverId: string | null = null;
      let channelId: string | null = null;
      if (looksLikeCuid) {
        channelId = c;
      } else {
        try {
          const res = await fetch(
            `/api/channels/resolve-slug?c=${encodeURIComponent(c)}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.serverId && data?.channelId) {
              serverId = data.serverId;
              channelId = data.channelId;
            }
          }
        } catch { /* ignore */ }
      }
      if (!channelId) return;
      if (serverId && serverId !== useChatStore.getState().activeServerId) {
        setActiveServer(serverId);
      }
      if (channelId !== useChatStore.getState().activeChannelId) {
        if (m) {
          pendingHighlightRef.current = { channelId, messageId: m };
        }
        setActiveChannel(channelId);
      } else if (m) {
        // Already on the right channel — just trigger the highlight if the
        // target message is loaded; otherwise fetch ?around=.
        const msgs = useChatStore.getState().messages;
        if (msgs.some((x) => x.id === m)) {
          useChatStore.setState({ highlightedMessageId: m });
        } else {
          try {
            const r = await fetch(
              `/api/channels/${channelId}/messages?around=${encodeURIComponent(m)}`,
            );
            if (r.ok) {
              const d = await r.json();
              useChatStore.getState().setMessages(d.messages);
              useChatStore.getState().setMessageCursor(d.nextCursor ?? null, !!d.nextCursor);
              if (d.messages.some((x: any) => x.id === m)) {
                useChatStore.setState({ highlightedMessageId: m });
              }
            }
          } catch { /* ignore */ }
        }
      }
      if (p) {
        setInitialForumPostId(p);
        setActivePostId(p);
      } else {
        setActivePostId(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sessionChecked, setActiveServer, setActiveChannel, setActivePostId]);

  return { serversLoaded, hasDefaultServer };
}
