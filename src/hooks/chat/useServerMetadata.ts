'use client';

import { useEffect } from 'react';
import { useChatStore, type MemberInfo } from '@/store/chat';
import { shortNpub } from '@/lib/mentions';

type Args = {
  profileSynced: boolean;
  sessionChecked: boolean;
  activeServerId: string | null;
  servers: ReturnType<typeof useChatStore.getState>['servers'];
  profileCache: Map<string, { name?: string; picture?: string }>;
  setMemberList: ReturnType<typeof useChatStore.getState>['setMemberList'];
  setMyRole: ReturnType<typeof useChatStore.getState>['setMyRole'];
  setServerEmojis: ReturnType<typeof useChatStore.getState>['setServerEmojis'];
  setServerGifs: ReturnType<typeof useChatStore.getState>['setServerGifs'];
};

/**
 * Fetches the per-server sidebar metadata: members (plus profileCache seeding),
 * the viewer's role, the custom emoji map, the GIF library, and the pseudo
 * profile-cache entries for the system bot / zap bot. These effects all key
 * on the active server and behave independently, so batching them into one
 * hook keeps the call site clean without changing semantics.
 */
export function useServerMetadata({
  profileSynced,
  sessionChecked,
  activeServerId,
  servers,
  profileCache,
  setMemberList,
  setMyRole,
  setServerEmojis,
  setServerGifs,
}: Args) {
  // Fetch all member profiles for the profileCache. Any members with null
  // profile fields will be filled in automatically by the server's
  // `triggerBackgroundRefreshIfStale` on GET /api/members — no client-side
  // NDK fallback needed.
  useEffect(() => {
    if (!profileSynced || !activeServerId) return;

    const fetchMembers = async () => {
      try {
        const res = await fetch(`/api/members?serverId=${encodeURIComponent(activeServerId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const memberInfoList: MemberInfo[] = [];
        for (const member of data.members) {
          const name = member.nickname || member.displayName || undefined;
          const picture = member.picture || undefined;
          profileCache.set(member.pubkey, { name, picture });
          memberInfoList.push({
            pubkey: member.pubkey,
            displayName: name || shortNpub(member.pubkey),
            picture,
            role: member.role,
            customRoles: member.customRoles?.map((cr: { role: { id: string; name: string; color: string; icon?: string | null; priority: number } }) => cr.role),
            banner: member.banner || undefined,
            nip05: member.nip05 || undefined,
            about: member.about || undefined,
            joinedAt: member.joinedAt,
            isBot: member.isBot,
            botType: member.botType,
            statusText: member.statusText ?? null,
          });
        }
        setMemberList(memberInfoList);
      } catch {
        // Silently fail — profiles will show pubkey fallback
      }
    };

    fetchMembers();
  }, [profileSynced, activeServerId, profileCache, setMemberList]);

  // Fetch the authed user's role on the active server so the UI can gate
  // admin-only affordances (pinning, etc). API enforces auth regardless —
  // this just controls which buttons are visible.
  useEffect(() => {
    if (!sessionChecked || !activeServerId) {
      setMyRole(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/auth/me/role?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.role) setMyRole(data.role);
        else setMyRole('member');
      })
      .catch(() => {
        if (!cancelled) setMyRole('member');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionChecked, activeServerId, setMyRole]);

  // Fetch custom server emojis so `:name:` shortcodes resolve in messages
  // and reactions. Silently fall back to an empty map on error — messages
  // render the raw `:name:` text which is the intended degradation.
  useEffect(() => {
    if (!activeServerId) {
      setServerEmojis({});
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/emojis?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.emojis) return;
        const map: Record<string, string> = {};
        for (const e of data.emojis) map[e.name] = e.url;
        setServerEmojis(map);
      })
      .catch(() => {
        if (!cancelled) setServerEmojis({});
      });
    return () => {
      cancelled = true;
    };
  }, [activeServerId, setServerEmojis]);

  // Fetch the server's GIF library so the composer's GIF picker has content
  // to show. Same fail-soft pattern as emojis — on error, leave the picker
  // empty rather than blocking the UI.
  useEffect(() => {
    if (!activeServerId) {
      setServerGifs([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/gifs?serverId=${encodeURIComponent(activeServerId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.gifs) return;
        setServerGifs(data.gifs);
      })
      .catch(() => {
        if (!cancelled) setServerGifs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeServerId, setServerGifs]);

  // Seed the profileCache with the "system bot" entry (all-zero pubkey) using
  // the active server's name + icon. This makes welcome-bot / pinned-system
  // messages render with the server logo instead of a generic placeholder,
  // both for Socket.io messages and REST-loaded history.
  useEffect(() => {
    if (!activeServerId) return;
    const active = servers.find((s) => s.id === activeServerId);
    if (!active) return;
    const SYSTEM_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
    profileCache.set(SYSTEM_PUBKEY, {
      name: active.name,
      picture: active.icon || undefined,
    });
    // Zap Bot: dedicated pseudo-author for `/zap` announcements so the zapper's
    // npub isn't shown as the message author. Rendered with a ⚡ avatar.
    const ZAP_BOT_PUBKEY = '000000000000000000000000000000000000000000000000000000007a617000';
    profileCache.set(ZAP_BOT_PUBKEY, {
      name: 'Zap Bot',
      picture: '/bots/zap.svg',
    });
  }, [activeServerId, servers, profileCache]);
}
