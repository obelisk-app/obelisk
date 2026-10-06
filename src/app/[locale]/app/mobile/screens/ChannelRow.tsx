'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMessages, useMyPubkey, useCurrentRelayUrl, type JsGroup } from '@/services/nostr-bridge';
import { ChannelActionSheet } from '@/components/chat/ChannelContextMenu';
import { isChannelMuted, useChannelPref } from '@/store/channel-prefs';
import { useUnreadMentionCardsForChannel } from '@/hooks/notifications/useNotificationSelectors';
import { useCachedChannelHighlights } from '@/hooks/read-state/useChannelHighlights';

// Single row in the channel list - picks the right icon for text/voice/forum
// and surfaces the live-call indicator on voice channels. The `unread` and
// `mentioned` variants are derived from the read-state cursor (per-channel
// unix-ms read marker) compared against bridge-supplied `messages.createdAt`.
type ChannelRowProps = {
  group: JsGroup;
  live: boolean;
  active?: boolean;
  onClick: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  indent?: boolean;
};

/**
 * Long-press (or right-click) a channel for the channel menu - mark read,
 * follow, mute, notification level, copy link. `display: contents` keeps the
 * wrapper out of the list's layout.
 */
export function ChannelRow(props: ChannelRowProps) {
  const relay = useCurrentRelayUrl();
  const myPubkey = useMyPubkey();
  const highlights = useCachedChannelHighlights(props.group.id, myPubkey);
  const mentionCards = useUnreadMentionCardsForChannel(relay, props.group.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const isVoice = props.group.kind === 'voice' || props.group.kind === 'voice-sfu';
  if (isVoice || !relay) return <ChannelRowBody {...props} />;
  return (
    <div
      style={{ display: 'contents' }}
      data-testid={`channel-row-menu-${props.group.id}`}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      onTouchStart={() => {
        pressFired.current = false;
        cancelPress();
        pressTimer.current = setTimeout(() => { pressFired.current = true; setMenuOpen(true); }, 500);
      }}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
      onClickCapture={(e) => {
        // The long-press already opened the menu; don't also navigate.
        if (pressFired.current) { e.stopPropagation(); e.preventDefault(); pressFired.current = false; }
      }}
    >
      <ChannelRowBody {...props} />
      {menuOpen && (
        <ChannelActionSheet
          target={{
            relay,
            channelId: props.group.id,
            name: props.group.name ?? props.group.id.slice(0, 8),
            hasUnread: highlights.unread > 0 || mentionCards > 0,
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

function ChannelRowBody({
  group,
  live,
  active,
  onClick,
  expandable,
  expanded,
  onToggleExpand,
  indent,
}: ChannelRowProps) {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const relay = useCurrentRelayUrl();
  const highlights = useCachedChannelHighlights(group.id, myPubkey);
  const pref = useChannelPref(relay, group.id);
  const muted = isChannelMuted(pref);
  // Unfollowed: its traffic stops asking for attention. Mentions still do.
  const unread = pref.unfollowed ? 0 : highlights.unread;
  // Cards survive a relay switch; loaded-message highlights don't.
  const mentionCards = useUnreadMentionCardsForChannel(relay, group.id);
  const mentionsOrReplies = Math.max(highlights.mentions + highlights.replies, mentionCards);
  const name = group.name ?? group.id.slice(0, 8);
  const quietStyle = pref.unfollowed || muted ? { opacity: 0.55 } : undefined;
  const mutedIcon = muted ? <span aria-label={t('mobile.channel.muted')} title={t('mobile.channel.muted')} style={{ fontSize: 11 }}>🔕</span> : null;
  if (group.kind === 'voice' || group.kind === 'voice-sfu') {
    return (
      <button className={`ch-row voice ${active ? 'active' : ''}`} onClick={onClick}>
        <span className="ch-icon" style={{ color: live ? 'var(--accent)' : 'var(--app-text-mute)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
        </span>
        <div className="ch-body">
          <div className="ch-row-top">
            <span className="ch-name">{name}</span>
            {live && <span className="voice-live-dot" />}
            {live && <span className="ch-meta" style={{ marginLeft: 'auto', color: 'var(--accent)' }}>{t('mobile.channel.live')}</span>}
          </div>
        </div>
      </button>
    );
  }
  const cls = ['ch-row'];
  if (active) cls.push('active');
  if (unread && unread > 0) cls.push('unread');
  if (indent) cls.push('ch-thread');
  if (group.kind === 'forum') {
    // When the forum has thread children, split into two click zones: the row
    // body navigates into the forum view (matches desktop), and the chevron
    // button toggles inline thread expansion (matches the user expectation
    // that an arrow icon means "expand"). Without children there's nothing
    // to expand, so we keep the old single-button behaviour.
    if (expandable && onToggleExpand) {
      cls.push('ch-row-split');
      return (
        <div className={cls.join(String.fromCharCode(10))} style={quietStyle}>
          <button className="ch-row-body" onClick={onClick}>
            <span className="ch-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M3 12h18M3 19h18" /></svg>
            </span>
            <span className="ch-name">{name}</span>
            {mutedIcon}
            {unread > 0 && <span className="ch-meta">{unread > 99 ? '99+' : unread}</span>}
            {mentionsOrReplies > 0 && (
              <span className="mention-pill" aria-label={t('mobile.channel.mentionsOrReplies', { count: mentionsOrReplies })}>
                {mentionsOrReplies > 99 ? '99+' : mentionsOrReplies}
              </span>
            )}
          </button>
          <button
            className="ch-chevron-btn"
            onClick={onToggleExpand}
            aria-label={t(expanded ? 'mobile.channel.collapsePublications' : 'mobile.channel.expandPublications')}
            aria-expanded={!!expanded}
          >
            <span className={`ch-chevron ${expanded ? 'expanded' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
            </span>
          </button>
        </div>
      );
    }
    return (
      <button className={cls.join(String.fromCharCode(10))} onClick={onClick} style={quietStyle}>
        <span className="ch-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M3 12h18M3 19h18" /></svg>
        </span>
        <span className="ch-name">{name}</span>
        {mutedIcon}
        {unread > 0 && <span className="ch-meta">{unread > 99 ? '99+' : unread}</span>}
        {mentionsOrReplies > 0 && (
          <span className="mention-pill" aria-label={t('mobile.channel.mentionsOrReplies', { count: mentionsOrReplies })}>
            {mentionsOrReplies > 99 ? '99+' : mentionsOrReplies}
          </span>
        )}
        <span className="ch-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
        </span>
      </button>
    );
  }
  return (
    <button className={cls.join(String.fromCharCode(10))} onClick={onClick} style={quietStyle}>
      <span className="ch-icon">#</span>
      <span className="ch-name">{name}</span>
      {mutedIcon}
      {unread > 0 && <span className="ch-meta">{unread > 99 ? '99+' : unread}</span>}
      {mentionsOrReplies > 0 && (
        <span className="mention-pill" aria-label={t('mobile.channel.mentionsOrReplies', { count: mentionsOrReplies })}>
          {mentionsOrReplies > 99 ? '99+' : mentionsOrReplies}
        </span>
      )}
    </button>
  );
}

// Renders a forum's thread children only after they have at least one message
// (mirrors desktop's ForumChildGroupNode - empty/aborted threads stay hidden
// so the inline expansion doesn't accumulate noise).
export function ForumThreadChildRow({
  group,
  active,
  onClick,
}: {
  group: JsGroup;
  active: boolean;
  onClick: () => void;
}) {
  const messages = useMessages(group.id);
  if (messages.length === 0) return null;
  return (
    <ChannelRow
      group={group}
      live={false}
      active={active}
      onClick={onClick}
      indent
    />
  );
}
