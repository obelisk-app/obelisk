'use client';

import { useState } from 'react';
import {
  useCurrentRelayUrl,
  useMessages,
  useActiveCall,
  useMyPubkey,
  type JsGroup,
} from '@/services/nostr-bridge';
import { wotColorClass } from '@/services/wot/colors';
import { useUnreadMentionCardsForChannel } from '@/hooks/notifications/useNotificationSelectors';
import { useCachedChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { ChannelContextMenu } from '@/components/chat/ChannelContextMenu';
import { isChannelMuted, useChannelPref } from '@/store/channel-prefs';
import { useTranslation } from '@/i18n/context';
import type { View } from '@/utils/shell/view';

export function GroupNode({
  group,
  depth,
  childrenByParent,
  groupsById,
  view,
  onSelect,
  distanceById,
}: {
  group: JsGroup;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Record<string, JsGroup>;
  view: View;
  onSelect: (id: string) => void;
  distanceById?: Readonly<Record<string, number | null>>;
}) {
  const { t } = useTranslation();
  const childIds = childrenByParent[group.id] ?? [];
  const active = view.kind === 'group' && view.groupId === group.id;
  const myPubkey = useMyPubkey();
  const highlights = useCachedChannelHighlights(group.id, myPubkey);
  // When the user is actively viewing the channel, the auto-mark hook is
  // about to advance the cursor - suppress the badge to avoid a brief
  // count flash. Matches the existing favicon-badge subtraction at
  // useFaviconBadge.ts.
  const showBadges = !active;
  const relay = useCurrentRelayUrl();
  const pref = useChannelPref(relay, group.id);
  const muted = isChannelMuted(pref);
  // Unfollowed: its traffic stops asking for attention. Mentions still do.
  const unread = showBadges && !pref.unfollowed ? highlights.unread : 0;
  // Mention cards stay until the message has actually been on screen
  // (`useMentionSeen`), so they show even on the active row.
  const mentionCards = useUnreadMentionCardsForChannel(relay, group.id);
  // Right-click → channel menu (mark read, follow, mute, notify, copy link).
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const mentionsOrReplies = Math.max(
    showBadges ? (highlights.mentions + highlights.replies) : 0,
    mentionCards,
  );
  // Forum containers default to expanded so newly-created threads are
  // immediately visible. Persisted per-group in localStorage so the user's
  // choice survives reloads. Non-forum groups stay always-expanded (no
  // toggle rendered) - collapsing arbitrary nesting isn't part of this UX.
  const isCollapsible = group.kind === 'forum' && childIds.length > 0;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(`obelisk-dex/forum-collapsed/${group.id}`) === '1';
  });
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== 'undefined') {
      const key = `obelisk-dex/forum-collapsed/${group.id}`;
      if (next) window.localStorage.setItem(key, '1');
      else window.localStorage.removeItem(key);
    }
  };
  return (
    <>
      <div
        style={{ paddingLeft: `${0.5 + Math.max(0, depth - 1) * 0.85}rem` }}
        className={
          'flex w-full items-center gap-1 rounded text-left text-base transition ' +
          (active
            ? 'bg-lc-olive text-lc-white'
            : 'text-lc-muted hover:bg-lc-card hover:text-lc-white') +
          ((pref.unfollowed || muted) && !active ? ' opacity-55' : '')
        }
        onContextMenu={(e) => {
          if (!relay) return;
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY });
        }}
        data-testid={`channel-row-${group.id}`}
      >
        {menuAt && relay && (
          <ChannelContextMenu
            target={{
              relay,
              channelId: group.id,
              name: group.name ?? group.id.slice(0, 12),
              hasUnread: highlights.unread > 0 || mentionCards > 0,
            }}
            x={menuAt.x}
            y={menuAt.y}
            onClose={() => setMenuAt(null)}
          />
        )}
        {depth > 0 && !isCollapsible && <span className="pl-1 text-lc-muted lc-tree-marker">↳</span>}
        <button
          onClick={() => onSelect(group.id)}
          className="flex flex-1 items-center gap-2 truncate px-1 py-1.5 text-left"
        >
          <span className="text-lc-muted">#</span>
          <span
            className={`flex-1 truncate ${unread > 0 ? 'font-semibold text-lc-white' : ''} ${distanceById ? wotColorClass(distanceById[group.id] ?? null) : ''}`}
            title={distanceById && distanceById[group.id] != null ? `WoT ${distanceById[group.id]}°` : undefined}
          >
            {group.name ?? group.id.slice(0, 12)}
          </span>
          {!group.isPublic && <span title={t('mobile.channel.private')} className="text-[10px]">🔒</span>}
          {!group.isOpen && <span title={t('desktop.channel.closed')} className="text-[10px]">⊝</span>}
          <ActiveCallBadge groupId={group.id} kind={group.kind} />
          {muted && <span title={t('channelMenu.muted')} aria-label={t('channelMenu.muted')} className="text-[11px]">🔕</span>}
          {unread > 0 && (
            <span
              aria-label={`${unread} unread message${unread === 1 ? '' : 's'}`}
              className="text-xs tabular-nums text-lc-muted"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
          {mentionsOrReplies > 0 && (
            <span
              aria-label={`${mentionsOrReplies} mention${mentionsOrReplies === 1 ? '' : 's'} or reply`}
              className="rounded-full bg-lc-green px-1.5 py-px text-[10px] font-bold text-lc-black"
            >
              {mentionsOrReplies > 99 ? '99+' : mentionsOrReplies}
            </span>
          )}
        </button>
        {isCollapsible && (
          <button
            onClick={toggleCollapsed}
            className="flex shrink-0 items-center justify-center px-2 py-1.5 text-lc-white/70 hover:text-lc-green"
            aria-label={collapsed ? 'Expand publications' : 'Collapse publications'}
            title={collapsed ? 'Expand publications' : 'Collapse publications'}
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        )}
      </div>
      {!collapsed && (group.kind === 'forum' ? (
        // Forum threads get the Discord-style L-rail treatment: wrap them in
        // .lc-forum-threads so each row's ::before/::after can paint a
        // continuous vertical rail terminating in an L-corner at the last row.
        <div className="lc-forum-threads">
          {childIds.map((cid) => {
            const child = groupsById[cid];
            if (!child) return null;
            // For forum-container children (threads), only render in the
            // sidebar once the thread has ≥ 1 message - empty/aborted threads
            // stay hidden so the sidebar doesn't accumulate noise.
            return (
              <ForumChildGroupNode
                key={cid}
                group={child}
                depth={depth + 1}
                childrenByParent={childrenByParent}
                groupsById={groupsById}
                view={view}
                onSelect={onSelect}
                distanceById={distanceById}
              />
            );
          })}
        </div>
      ) : (
        childIds.map((cid) => {
          const child = groupsById[cid];
          if (!child) return null;
          return (
            <GroupNode
              key={cid}
              group={child}
              depth={depth + 1}
              childrenByParent={childrenByParent}
              groupsById={groupsById}
              view={view}
              onSelect={onSelect}
              distanceById={distanceById}
            />
          );
        })
      ))}
    </>
  );
}

function ForumChildGroupNode(props: {
  group: JsGroup;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Record<string, JsGroup>;
  view: View;
  onSelect: (id: string) => void;
  distanceById?: Readonly<Record<string, number | null>>;
}) {
  const messages = useMessages(props.group.id);
  if (messages.length === 0) return null;
  return (
    <div className="lc-thread-row">
      <GroupNode {...props} />
    </div>
  );
}

/**
 * "LIVE" pill rendered next to a voice channel's name when the SFU has
 * published a current kind 31314 active-call announcement for it. Only
 * shown for voice / voice-sfu channels - text and forum channels can't
 * have an SFU room. Re-evaluates every 15s via {@link useActiveCall} so
 * a stale (expired) announcement fades without needing a manual refresh.
 */
function ActiveCallBadge({ groupId, kind }: { groupId: string; kind: JsGroup['kind'] }) {
  const { t } = useTranslation();
  const active = useActiveCall(groupId);
  if (kind !== 'voice' && kind !== 'voice-sfu') return null;
  if (!active) return null;
  return (
    <span
      title={t('desktop.voice.liveTitle')}
      className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-300"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
      {t('desktop.voice.live')}
    </span>
  );
}
