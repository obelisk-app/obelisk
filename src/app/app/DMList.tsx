'use client';

/**
 * DM list sidebar — visual mirror of obelisk's DMList.tsx, dropping the
 * obelisk-API user search. Uses the bridge's reactive DM thread map +
 * NIP-02 follows to split Follows / Others.
 */

import { displayNameFor } from '@/lib/display-name';
import { useEffect, useMemo, useState } from 'react';
import {
  nostrActions,
  useDirectMessages,
  useMyFollows,
  type JsDirectMessage,
} from '@/lib/nostr-bridge';
import { useAuthor } from '@/lib/social/useAuthor';
import { ensureSocialProfiles } from '@/lib/social/profiles';
import { useDMUnreadCount } from '@/lib/read-state/selectors';
import DMComposer from './DMComposer';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n/context';

type Tab = 'follows' | 'others';

export default function DMList({
  activePeer,
  onPick,
}: {
  activePeer: string | null;
  onPick: (peer: string) => void;
}) {
  const { t } = useTranslation();
  const dms = useDirectMessages();
  const follows = useMyFollows();
  const followSet = useMemo(() => new Set(follows), [follows]);
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<Tab | null>(null);

  const peers = useMemo(() => {
    return Object.entries(dms).map(([pubkey, msgs]) => {
      const last = msgs[msgs.length - 1];
      return {
        pubkey,
        last,
        sortKey: last?.createdAt ?? 0,
      };
    }).sort((a, b) => b.sortKey - a.sortKey);
  }, [dms]);

  // Resolve every peer in one batched REQ instead of letting each row fire
  // its own — a list of thirty conversations is thirty round trips
  // otherwise. `ensureSocialProfiles` already filters to what's missing.
  const peerKey = peers.map((p) => p.pubkey).join(',');
  useEffect(() => {
    if (peers.length > 0) void ensureSocialProfiles(peers.map((p) => p.pubkey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerKey]);

  const followsThreads = useMemo(() => peers.filter((p) => followSet.has(p.pubkey)), [peers, followSet]);
  const othersThreads = useMemo(() => peers.filter((p) => !followSet.has(p.pubkey)), [peers, followSet]);

  const effectiveTab: Tab = tab ?? (followsThreads.length > 0 || othersThreads.length === 0 ? 'follows' : 'others');
  const visible = effectiveTab === 'follows' ? followsThreads : othersThreads;

  return (
    <aside
      className="relative flex h-full w-full flex-col overflow-hidden bg-lc-dark"
      data-tour="dm-list"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-lc-border px-4 shadow-sm">
        <h3 className="truncate text-sm font-bold text-lc-white">{t('dm.title')}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => alert(t('dm.clearCacheAlert'))}
            className="p-1 text-lc-muted transition-colors hover:text-red-400"
            title={t('dm.clearCacheTitle')}
            aria-label={t('dm.clearCache')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </button>
          <button
            onClick={() => setComposing((v) => !v)}
            className={`p-1 transition-colors ${composing ? 'text-lc-green' : 'text-lc-muted hover:text-lc-green'}`}
            title={t('dm.new')}
            aria-label={t('dm.new')}
            aria-pressed={composing}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </div>

      {composing && (
        <DMComposer
          onClose={() => setComposing(false)}
          onPicked={(pk) => { setComposing(false); onPick(pk); }}
        />
      )}

      {/*
        A segmented control rather than an underlined tab strip.

        The underline read as a page-level tab bar — the same affordance the
        rail and the channel list use for navigation — when this only filters
        the list underneath it. A filled pill inside a track says "one of
        these two" and takes the same room. The count moves into its own
        badge: parentheses next to a label are easy to read as part of the
        label, and this is the number that tells you which side has anything
        in it.
      */}
      <div className="shrink-0 border-b border-lc-border p-2">
        <div className="flex gap-1 rounded-xl bg-lc-black/40 p-1" role="tablist">
          {(['follows', 'others'] as const).map((tabId) => {
            const active = effectiveTab === tabId;
            const count = tabId === 'follows' ? followsThreads.length : othersThreads.length;
            return (
              <button
                key={tabId}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tabId)}
                data-testid={`dm-tab-${tabId}`}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-lc-border/70 text-lc-white shadow-sm'
                    : 'text-lc-muted hover:text-lc-white'
                }`}
              >
                <span>{tabId === 'follows' ? t('dm.follows') : t('dm.others')}</span>
                <span
                  className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
                    active ? 'bg-lc-green/20 text-lc-green' : 'bg-lc-border/60 text-lc-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Same reservation as the channel list: `FloatingUserPanel` is absolute
        over the bottom of this column too, and this scroller had none — so
        the last conversation sat permanently behind the "You" pill.
      */}
      <div className="flex-1 overflow-y-auto pb-2 md:pb-28">
        {peers.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-lc-muted">{t('dm.noConversations')}</p>
            <button
              onClick={() => setComposing(true)}
              className="mt-2 text-xs text-lc-green hover:underline"
            >
              {t('dm.startConversation')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-sm text-lc-muted">
              {effectiveTab === 'follows'
                ? t('dm.noFollows')
                : t('dm.everyoneInFollows')}
            </p>
          </div>
        ) : (
          visible.map((p) => (
            <DMRow
              key={p.pubkey}
              pubkey={p.pubkey}
              last={p.last}
              youPrefix={t('dm.youPrefix')}
              active={activePeer === p.pubkey}
              onClick={() => onPick(p.pubkey)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function DMRow({
  pubkey,
  last,
  youPrefix,
  active,
  onClick,
}: {
  pubkey: string;
  last: JsDirectMessage | undefined;
  youPrefix: string;
  active: boolean;
  onClick: () => void;
}) {
  // `useAuthor`, not the bridge's `useUserMetadata`: the bridge only queries
  // the group/profile-lookup relay tier, which holds kind 0 for people in
  // your NIP-29 rooms. A DM peer is usually someone from the wider network
  // who has no reason to have published there — which is why every row here
  // showed an npub and a letter avatar while the same person resolved fine
  // in the feed. `useAuthor` merges both tiers field by field.
  const meta = useAuthor(pubkey);
  const unread = useDMUnreadCount(pubkey);
  const display = displayNameFor(pubkey, meta);
  const preview = last
    ? (last.outgoing ? youPrefix : '') + last.content.replace(/\s+/g, ' ').slice(0, 60)
    : null;
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ' +
        (active ? 'bg-lc-border/40' : 'hover:bg-lc-border/20')
      }
    >
      <UserAvatar pubkey={pubkey} size={8} picture={meta?.picture ?? null} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={
              'truncate text-sm ' +
              (unread > 0 ? 'font-bold text-lc-white' : 'font-medium text-lc-white')
            }
          >
            {display}
          </span>
          {unread > 0 && (
            <span className="shrink-0 rounded-full bg-lc-green px-1.5 py-px text-[10px] font-bold text-lc-black">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        {preview && (
          <p
            className={
              'truncate text-xs ' + (unread > 0 ? 'text-lc-white' : 'text-lc-muted')
            }
          >
            {preview}
          </p>
        )}
      </div>
    </button>
  );
}

export { default as Avatar } from '@/components/UserAvatar';
