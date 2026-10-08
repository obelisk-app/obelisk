import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAdmins, useCurrentRelayUrl, useGroupById, useGroups, useMessages, useMessagesStatus, useReactions, type JsMessage } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { type ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { useChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { useChannelGamesSubscription } from '@/hooks/games/channel/useChannelGames';
import { buildTimeline } from '@/utils/chat/timeline/channel-timeline';
import { channelHeaderLabel } from '@/utils/shell/mobile/labels';
import { postGameMarker } from '@/services/shell/mobile/game-marker';
import { useEnsureGroupMetadata, usePhoneChannelViewport, useReplyTarget } from './usePhoneChannel';

export interface MobileMessageActionsContext {
  id: string;
  pubkey: string;
  content: string;
  groupId: string;
  canModerate: boolean;
  canDeleteOwn: boolean;
}

/**
 * The phone channel screen's view model: the channel and its header, the
 * messages as a timeline with day dividers, reactions and reply parents, the
 * reply target, the scroll viewport, the two sheets (settings, new game) and
 * the composer handle files are dropped through.
 */
export function useChannelScreen({ groupId, openMsgActions, openProfile }: {
  groupId: string;
  openMsgActions: (m: MobileMessageActionsContext) => void;
  openProfile: (pubkey: string) => void;
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
  const messages = useMessages(groupId);
  // Reply parents resolved once per batch, so a row's `parent` prop is the
  // same object across renders and the memoized rows stay quiet.
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m] as const)), [messages]);
  // Game tables ride the channel's relay - see src/lib/games/protocol.ts.
  useChannelGamesSubscription(groupId);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const { replyingTo, setReplyingTo } = useReplyTarget(groupId, messages);
  const channelHighlights = useChannelHighlights(groupId, myPubkey);
  const viewport = usePhoneChannelViewport({ groupId, relay, myPubkey, messages });

  // Group consecutive messages and pre-compute day dividers.
  // The day dividers are copy: without `t` and `locale` here a language
  // switch left them in the old language until the next message arrived.
  const timeline = useMemo(() => buildTimeline(messages, t, locale), [messages, t, locale]);

  return {
    group,
    header: channelHeaderLabel(group, parentGroup, groupId),
    messages,
    messagesById,
    messagesStatus,
    reactions,
    myPubkey,
    isChannelAdmin,
    timeline,
    onLongPressMessage,
    onAvatarTap,
    composerRef,
    dropFiles: (files: File[]) => composerRef.current?.pickFiles(files),
    replyingTo,
    setReplyingTo,
    mentionEventIds: channelHighlights.eventIds,
    ...viewport,
    newGameOpen,
    openNewGame: () => setNewGameOpen(true),
    closeNewGame: () => setNewGameOpen(false),
    postMarker: (marker: string) => postGameMarker(groupId, marker),
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
  };
}
