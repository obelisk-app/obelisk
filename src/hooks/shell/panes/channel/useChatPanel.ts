'use client';

import { useMemo, useRef, useState } from 'react';
import { useCurrentRelayUrl, useGroupById, useMessages, useMessagesStatus, useGroupMetadataEose, useReactions, useAdmins, useGroupCreator, useRelayAccess, type JsMessage } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useVoiceStore } from '@/store/voice';
import { useChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { useVoiceChatPane } from '@/hooks/shell/panes/channel/useVoiceChatPane';
import { useMessageZaps } from '@/hooks/chat/zaps/useMessageZaps';
import { useChannelGamesSubscription } from '@/hooks/games/channel/useChannelGames';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { useChannelLoadGates, useCreatorAdminClaim } from '@/hooks/shell/panes/channel/useChannelPanelState';
import { useChannelViewport } from '@/hooks/shell/panes/channel/useChannelViewport';
import { channelEmptyStage } from '@/utils/chat/timeline/channel-list-state';
import { channelPaneBody, indexMessagesById } from '@/utils/shell/panes/channel/channel-pane';
import { postGameTableCard } from '@/services/shell/panes/channel/game-table-card';

/**
 * The desktop channel pane's view model: the channel and its messages,
 * reactions and zaps, the gates around the list and the composer, the reply
 * target, the voice room's docked chat, and the new-game and settings
 * dialogs.
 */
export function useChatPanel({ groupId, showMembers, pendingMessageId, onConsumePendingMessageId }: {
  groupId: string;
  showMembers: boolean;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
}) {
  const messages = useMessages(groupId);
  // Reply parents resolved once per batch, so a row's `parent` prop is the
  // same object across renders and the memoized rows stay quiet.
  const messagesById = useMemo(() => indexMessagesById(messages), [messages]);
  // Game tables live on the channel's relay and are replayed from their own
  // kind 2390 log - see src/lib/games/protocol.ts.
  useChannelGamesSubscription(groupId);
  const [newGameOpen, setNewGameOpen] = useState(false);
  // Retry-backed confidence enum: the bridge runs an internal retry ladder on
  // empty EOSE before promoting to `empty-confirmed`, so the UI doesn't need
  // its own dwell timer. See `MessagesStatus` in the bridge's types.
  const messagesStatus = useMessagesStatus(groupId);
  const groupMetadataEose = useGroupMetadataEose();
  const reactions = useReactions(groupId);
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const zapTotals = useMessageZaps(messageIds);
  // Raw lookup, bypassing WoT filtering: the user explicitly navigated to
  // this groupId, and WoT-hiding it would show a false "Channel not visible".
  // The sidebar still uses the WoT-filtered `useGroups()` for discovery.
  const group = useGroupById(groupId);
  const { channelMissingGrace, metadataFetchDone } = useChannelLoadGates(groupId, !!group);
  const admins = useAdmins(groupId);
  const myPubkey = useMyPubkey();
  const groupCreator = useGroupCreator(groupId);
  const relay = useCurrentRelayUrl();
  // The compose form is gated on positive AUTH evidence so the user doesn't
  // type into a channel the relay won't accept events from. The list itself
  // renders unconditionally: a cached or partial history is more useful than
  // an empty pane, and RelayAccessBanner explains the situation in place.
  const relayAccess = useRelayAccess(relay || null);
  const [replyingTo, setReplyingTo] = useState<JsMessage | null>(null);
  // Reset the reply target when the channel changes, in the same render.
  const [replyChannel, setReplyChannel] = useState(groupId);
  if (replyChannel !== groupId) {
    setReplyChannel(groupId);
    setReplyingTo(null);
  }
  const composerRef = useRef<ComposerHandle>(null);
  useCreatorAdminClaim({ groupId, myPubkey, groupCreator, admins, relay, relayAccess });
  const voiceMainRef = useRef<HTMLDivElement>(null);
  // Highlights drive the floating mention/reply navigator at the bottom-right
  // of the message viewport: the same data the channel-row badges read.
  const channelHighlights = useChannelHighlights(groupId, myPubkey);
  const [showSettings, setShowSettings] = useState(false);
  const voiceChatOpen = useVoiceStore((s) => s.isVoiceChatOpen);
  const setVoiceChatOpen = useVoiceStore((s) => s.setVoiceChatOpen);
  const { voiceChatWidth, onVoiceChatResize } = useVoiceChatPane(voiceChatOpen, voiceMainRef);
  const viewport = useChannelViewport({
    groupId, relay, myPubkey, messages, pendingMessageId, onConsumePendingMessageId,
  });

  return {
    groupId,
    group,
    body: channelPaneBody(group),
    showMembersColumn: showMembers && group?.kind === 'text',
    messages,
    messagesById,
    reactions,
    zapTotals,
    isAdmin: !!myPubkey && admins.includes(myPubkey),
    messagesVisible: relayAccess === 'ok',
    emptyStage: channelEmptyStage({ group, messagesStatus, groupMetadataEose, channelMissingGrace, metadataFetchDone }),
    highlightIds: channelHighlights.eventIds,
    viewport,
    /** A state setter, so stable: every memoized row receives it. */
    setReplyingTo,
    replyingTo,
    composerRef,
    voiceMainRef,
    /** Files dropped anywhere on the pane go to the composer. */
    pickFiles: (files: File[]) => composerRef.current?.pickFiles(files),
    newGameOpen,
    openNewGame: () => setNewGameOpen(true),
    closeNewGame: () => setNewGameOpen(false),
    postGameMarker: (marker: string) => postGameTableCard(groupId, marker),
    showSettings,
    openSettings: () => setShowSettings(true),
    closeSettings: () => setShowSettings(false),
    voiceChat: {
      open: voiceChatOpen,
      width: voiceChatWidth,
      onResize: onVoiceChatResize,
      toggle: () => setVoiceChatOpen(!voiceChatOpen),
      hide: () => setVoiceChatOpen(false),
    },
  };
}

export type ChatPanelModel = ReturnType<typeof useChatPanel>;
/** The model without the voice area's ref, which only the pane itself attaches. */
export type ChatPanelView = Omit<ChatPanelModel, 'voiceMainRef'>;
