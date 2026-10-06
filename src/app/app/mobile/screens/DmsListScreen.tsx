'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/useAuthor';
import { ensureSocialProfiles } from '@/services/social/profiles';
import { relativeTime } from '@/utils/format/relative-time';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDirectMessages, type JsDirectMessage } from '@/services/nostr-bridge';
import DMOptInGate from '../../DMOptInGate';
import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import { useTranslation } from '@/i18n/context';
import { useDMUnreadCount } from '@/hooks/read-state/useUnreadCounts';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { avatarStyle } from '../avatar';
import { useScreenScrollMemo } from '@/hooks/app/mobile/useScreenScrollMemo';
import RemoteImage from '@/components/ui/RemoteImage';

export function MobileDmOptInScreen({
  onSecondary,
  secondaryLabel = 'Not now',
}: {
  onSecondary: () => void;
  secondaryLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="screen active" data-screen="dms-list">
      <div className="app-header">
        <h2>{t('dm.title')}</h2>
      </div>
      <DMOptInGate
        surface="mobile"
        secondaryLabel={secondaryLabel}
        onSecondary={onSecondary}
      />
    </div>
  );
}

export function DmsListScreen({
  go,
  selectPeer,
  myFollows,
}: {
  go: (s: ScreenName) => void;
  selectPeer: (peer: string) => void;
  myFollows: ReadonlyArray<string>;
}) {
  const { t } = useTranslation();
  const dms = useDirectMessages();
  const [tab, setTab] = useState<'follows' | 'others'>('follows');

  // Each row computes its own unread via `useDMUnreadCount` against the
  // persisted read-state cursor. The 24h heuristic that used to live here
  // is gone - `useReadStateStore.dmCursors` is the single source of truth
  // (with a 24h bootstrap fallback baked into the selector for first-paint).
  const peers = useMemo(() => {
    const list: Array<{ peer: string; latest: JsDirectMessage }> = [];
    for (const [peer, msgs] of Object.entries(dms)) {
      if (msgs.length === 0) continue;
      const sorted = [...msgs].sort((a, b) => b.createdAt - a.createdAt);
      list.push({ peer, latest: sorted[0] });
    }
    list.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
    return list;
  }, [dms]);

  // One batched kind-0 REQ for the whole list rather than one per row.
  const peerKey = peers.map((p) => p.peer).join(',');
  useEffect(() => {
    if (peers.length > 0) void ensureSocialProfiles(peers.map((p) => p.peer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey]);

  const followsSet = useMemo(() => new Set(myFollows), [myFollows]);
  const filtered = peers.filter((p) =>
    tab === 'follows' ? followsSet.has(p.peer) : !followsSet.has(p.peer),
  );

  const followsCount = peers.filter((p) => followsSet.has(p.peer)).length;
  const othersCount = peers.length - followsCount;

  const listRef = useRef<HTMLDivElement>(null);
  useScreenScrollMemo(`dms-list:${tab}`, listRef);

  return (
    <div className="screen active" data-screen="dms-list">
      <div className="app-header">
        <h2>{t('dm.title')}</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <MobileSigningIndicator />
          <button className="icon-btn action-search" onClick={() => go('compose-dm')} aria-label={t('common.search')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <button className="icon-btn action-create" onClick={() => go('compose-dm')} aria-label={t('dm.newMessage')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </div>

      <div className="dms-tabs native-scroll-x">
        <button className={`filter-tab ${tab === 'follows' ? 'active' : ''}`} onClick={() => setTab('follows')}>
          {t('dm.follows')} · {followsCount}
        </button>
        <button className={`filter-tab ${tab === 'others' ? 'active' : ''}`} onClick={() => setTab('others')}>
          {t('dm.others')} · {othersCount}
        </button>
      </div>

      <div className="dms-list-rows native-scroll-y" ref={listRef}>
        {filtered.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div className="empty-state-title">{t('dm.noConversations')}</div>
            <div className="empty-state-desc">{t('dm.emptyMobileDescription')}</div>
          </div>
        )}
        {filtered.map((p) => (
          <DmRow key={p.peer} peer={p.peer} latest={p.latest} youPrefix={t('dm.youPrefix')} onClick={() => selectPeer(p.peer)} />
        ))}
      </div>
    </div>
  );
}

function DmRow({
  peer,
  latest,
  youPrefix,
  onClick,
}: {
  peer: string;
  latest: JsDirectMessage;
  youPrefix: string;
  onClick: () => void;
}) {
  const { t, locale } = useTranslation();
  // `useAuthor` merges the bridge (group tier) with the social resolver -
  // the bridge alone only knows people from your NIP-29 rooms, which is why
  // DM rows showed npubs and letter avatars while the feed showed faces.
  const meta = useAuthor(peer);
  const unreadCount = useDMUnreadCount(peer);
  const name = displayNameFor(peer, meta);
  return (
    <button className={`dm-row ${unreadCount > 0 ? 'unread' : ''}`} onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, peer)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
          <span className="dm-time">{relativeTime(latest.createdAt, t, locale)}</span>
        </div>
        <div className="dm-preview">
          <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {latest.outgoing ? youPrefix : ''}{latest.content}
        </div>
      </div>
      {unreadCount > 0 && <span className="unread-dot" />}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 07 - DM thread
