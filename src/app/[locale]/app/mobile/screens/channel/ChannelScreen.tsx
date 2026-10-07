'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useGroups,
  useGroupById,
  useMessages,
  useMessagesStatus,
  useMyPubkey,
  useAdmins,
  useReactions,
  useCurrentRelayUrl,
  type JsMessage,
} from '@/services/nostr-bridge';
import MentionNavigator from '@/components/chat/mentions/MentionNavigator';
import HistoryPaginationStatus from '@/components/chat/timeline/HistoryPaginationStatus';
import { FileDropZone } from '@/components/chat/composer/ComposerActions';
import { type ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { useLocale, useTranslations } from 'next-intl';
import { useChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { useChannelGamesSubscription } from '@/hooks/games/channel/useChannelGames';
import { LazyNewGameModal } from '../../../mounts/lazy-mounts';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { channelHeaderLabel } from '@/utils/shell/mobile/labels';
import { ChannelSettingsSheet } from '../../sheets/channel/ChannelSettingsSheet';
import { ChannelComposer } from './ChannelComposer';
import { ChannelHeaderBar } from './ChannelHeaderBar';
import { ChannelTimeline } from './ChannelTimeline';
import { buildTimeline } from '@/utils/chat/timeline/channel-timeline';
import { useEnsureGroupMetadata, usePhoneChannelViewport, useReplyTarget } from '@/hooks/shell/mobile/screens/channel/usePhoneChannel';

export function ChannelScreen({
  groupId,
  go,
  back,
  openMsgActions,
  openProfile,
  openMembers,
}: {
  groupId: string;
  go: (s: ScreenName) => void;
  back: () => void;
  openMsgActions: (m: { id: string; pubkey: string; content: string; groupId: string; canModerate: boolean; canDeleteOwn: boolean }) => void;
  openZap: (m: { id: string; pubkey: string; content: string }) => void;
  openProfile: (pubkey: string) => void;
  openMembers: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  // Raw lookup - bypasses WoT filtering. Mirrors desktop ChatPanel: the
  // user explicitly navigated to this groupId; hiding it because a WoT
  // verdict hasn't resolved yet causes a false "Channel not visible"
  // verdict.
  const group = useGroupById(groupId);
  const groups = useGroups();
  const parentGroup = group?.parent ? groups.find((g) => g.id === group.parent) ?? null : null;
  const header = channelHeaderLabel(group, parentGroup, groupId);
  const messages = useMessages(groupId);
  // Reply parents resolved once per batch, so a row's `parent` prop is the
  // same object across renders and the memoized rows stay quiet.
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m] as const)), [messages]);
  // Game tables ride the channel's relay - see src/lib/games/protocol.ts.
  useChannelGamesSubscription(groupId);
  const [newGameOpen, setNewGameOpen] = useState(false);
  // Retry-backed confidence: bridge owns the dwell + retry ladder so
  // this surface never needs to second-guess an empty EOSE. See
  // `MessagesStatus` in src/services/nostr-bridge/types.ts.
  const messagesStatus = useMessagesStatus(groupId);
  const reactions = useReactions(groupId);
  const myPubkey = useMyPubkey();
  const relay = useCurrentRelayUrl();
  useEnsureGroupMetadata(groupId, !!group);
  const channelAdmins = useAdmins(groupId);
  const isChannelAdmin = !!myPubkey && channelAdmins.includes(myPubkey);
  // Stable per channel/role, so the memoized rows do not re-render on every
  // ChannelScreen render just because a closure was recreated.
  const onLongPressMessage = useCallback((m: JsMessage) => openMsgActions({
    id: m.id,
    pubkey: m.pubkey,
    content: m.content,
    groupId,
    canModerate: isChannelAdmin,
    canDeleteOwn: m.pubkey === myPubkey,
  }), [openMsgActions, groupId, isChannelAdmin, myPubkey]);
  const onAvatarTap = useCallback((pubkey: string) => openProfile(pubkey), [openProfile]);
  const composerRef = useRef<ComposerHandle>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { replyingTo, setReplyingTo } = useReplyTarget(groupId, messages);
  const channelHighlights = useChannelHighlights(groupId, myPubkey);
  const { messagesRef, loadingEarlier, reachedStart, nearHistoryTop } = usePhoneChannelViewport({
    groupId, relay, myPubkey, messages,
  });

  // Group consecutive messages and pre-compute day dividers.
  // The day dividers are copy: without `t` and `locale` here a language
  // switch left them in the old language until the next message arrived.
  const renderable = useMemo(() => buildTimeline(messages, t, locale), [messages, t, locale]);

  return (
    <FileDropZone
      className="screen active"
      data-screen="channel"
      onFiles={(files) => composerRef.current?.pickFiles(files)}
    >
      {newGameOpen && (
        <LazyNewGameModal
          channelId={groupId}
          onClose={() => setNewGameOpen(false)}
          onPostMarker={(marker) => {
            nostrActions.sendMessage(groupId, marker, null, []).catch((err) => {
              console.warn('[games] posting the table card failed', err);
            });
          }}
        />
      )}
      <ChannelHeaderBar
        header={header}
        back={back}
        onSearch={() => go('search')}
        isChannelAdmin={isChannelAdmin}
        onOpenSettings={() => setSettingsOpen(true)}
        openMembers={openMembers}
      />
      <div className="messages-wrap relative flex min-h-0 flex-1 flex-col">
        <div className="messages native-scroll-y" ref={messagesRef}>
          <ChannelTimeline
            items={renderable}
            messagesStatus={messagesStatus}
            messagesById={messagesById}
            reactions={reactions}
            myPubkey={myPubkey}
            isAdmin={isChannelAdmin}
            groupId={groupId}
            onLongPress={onLongPressMessage}
            onAvatar={onAvatarTap}
          />
        </div>
        {renderable.length > 0 && (
          <HistoryPaginationStatus
            loading={loadingEarlier}
            reachedStart={reachedStart}
            atTop={nearHistoryTop}
            loadingLabel={t('mobile.channel.loadingEarlier')}
            endLabel={t('mobile.channel.noEarlierMessages')}
          />
        )}
        <MentionNavigator scrollRef={messagesRef} eventIds={channelHighlights.eventIds} />
      </div>

      <ChannelComposer
        ref={composerRef}
        groupId={groupId}
        group={group}
        messages={messages}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        onOpenNewGame={() => setNewGameOpen(true)}
      />
      {settingsOpen && group && (
        <ChannelSettingsSheet
          group={group}
          close={() => setSettingsOpen(false)}
        />
      )}
    </FileDropZone>
  );
}
