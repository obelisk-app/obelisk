'use client';

import { useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useCurrentRelayUrl,
  useGroupById,
  useMessages,
  useMessagesStatus,
  useGroupMetadataEose,
  useReactions,
  useAdmins,
  useGroupCreator,
  useRelayAccess,
  useMyPubkey,
  type JsMessage,
} from '@/services/nostr-bridge';
import MentionNavigator from '@/components/chat/MentionNavigator';
import HistoryPaginationStatus from '@/components/chat/HistoryPaginationStatus';
import ForumView from '@/components/chat/ForumView';
import { useVoiceStore } from '@/store/voice';
import { useChannelHighlights } from '@/hooks/read-state/useChannelHighlights';
import { useVoiceChatPane } from '@/hooks/chat/useVoiceChatPane';
import { FileDropZone } from '@/components/chat/ComposerActions';
import { useMessageZaps } from '@/hooks/chat/useMessageZaps';
import { useChannelGamesSubscription } from '@/hooks/chat/useChannelGames';
import { type ComposerHandle } from '@/hooks/chat/useChannelComposer';
import { useTranslation } from '@/i18n/context';
import { LazyNewGameModal, LazyVoiceRoom } from '../lazy-mounts';
import { ChannelSettingsModal } from '../modals/ChannelSettingsModal';
import { ChatComposer } from './ChatComposer';
import { MembersPanel } from './MembersPanel';
import { ChannelHeader } from './channel/ChannelHeader';
import { ChannelMessageList } from './channel/ChannelMessageList';
import { VoiceChatRail } from './channel/VoiceChatRail';
import { channelEmptyStage } from './channel/channel-list-state';
import { useChannelLoadGates, useCreatorAdminClaim } from '@/hooks/app/panes/channel/useChannelPanelState';
import { useChannelViewport } from '@/hooks/app/panes/channel/useChannelViewport';

type ChatPanelProps = {
  groupId: string;
  showMembers: boolean;
  onToggleMembers: () => void;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
  onSelectGroup: (groupId: string) => void;
};

export function ChatLayout(props: ChatPanelProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatPanel {...props} />
    </div>
  );
}

function ChatPanel({
  groupId,
  showMembers,
  onToggleMembers,
  pendingMessageId,
  onConsumePendingMessageId,
  onSelectGroup,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const messages = useMessages(groupId);
  // Reply parents resolved once per batch, so a row's `parent` prop is the
  // same object across renders and the memoized rows stay quiet.
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m] as const)), [messages]);
  // Game tables live on the channel's relay and are replayed from their own
  // kind 2390 log - see src/lib/games/protocol.ts.
  useChannelGamesSubscription(groupId);
  const [newGameOpen, setNewGameOpen] = useState(false);
  // Retry-backed confidence enum - the bridge runs an internal retry
  // ladder on empty EOSE before promoting to `empty-confirmed`, so the
  // UI doesn't need its own dwell timer or auto-refresh effect. See
  // `MessagesStatus` in src/services/nostr-bridge/types.ts.
  const messagesStatus = useMessagesStatus(groupId);
  const groupMetadataEose = useGroupMetadataEose();
  const reactions = useReactions(groupId);
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const zapTotals = useMessageZaps(messageIds);
  // Raw lookup - bypasses WoT filtering. The user explicitly navigated to
  // this groupId; WoT-hiding it would cause a false "Channel not visible"
  // state in the chat pane. The sidebar still uses WoT-filtered
  // `useGroups()` for discovery, but click-through stays accessible.
  const group = useGroupById(groupId);
  const { channelMissingGrace, metadataFetchDone } = useChannelLoadGates(groupId, !!group);
  const admins = useAdmins(groupId);
  const myPubkey = useMyPubkey();
  const isAdmin = !!myPubkey && admins.includes(myPubkey);
  const groupCreator = useGroupCreator(groupId);
  const relay = useCurrentRelayUrl();
  // The compose form is gated on positive AUTH evidence so the user
  // doesn't type into a channel the relay won't accept events from. The
  // message list itself renders unconditionally - a cached or partial
  // history is more useful than an empty pane, and RelayAccessBanner
  // explains the situation in-place.
  const relayAccess = useRelayAccess(relay || null);
  const messagesVisible = relayAccess === 'ok';
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
  // of the message viewport - same data the channel-row badges read.
  const channelHighlights = useChannelHighlights(groupId, myPubkey);
  const [showSettings, setShowSettings] = useState(false);
  const voiceChatOpen = useVoiceStore((s) => s.isVoiceChatOpen);
  const setVoiceChatOpen = useVoiceStore((s) => s.setVoiceChatOpen);
  const { voiceChatWidth, onVoiceChatResize: onResize } = useVoiceChatPane(voiceChatOpen, voiceMainRef);
  const { scrollRef, loadingEarlier, reachedStart, nearHistoryTop } = useChannelViewport({
    groupId, relay, myPubkey, messages, pendingMessageId, onConsumePendingMessageId,
  });

  const textBody = (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4" data-testid={messagesVisible ? undefined : 'messages-gated-by-auth'}>
          <ChannelMessageList
            groupId={groupId}
            group={group}
            messages={messages}
            messagesById={messagesById}
            reactions={reactions}
            zapTotals={zapTotals}
            isAdmin={isAdmin}
            onReply={setReplyingTo}
            emptyStage={channelEmptyStage({ group, messagesStatus, groupMetadataEose, channelMissingGrace, metadataFetchDone })}
          />
        </div>
        {messages.length > 0 && (
          <HistoryPaginationStatus
            loading={loadingEarlier}
            reachedStart={reachedStart}
            atTop={nearHistoryTop}
            loadingLabel={t('desktop.channel.loadingEarlier')}
            endLabel={t('desktop.channel.noEarlierMessages')}
          />
        )}
        <MentionNavigator scrollRef={scrollRef} eventIds={channelHighlights.eventIds} />
      </div>

      {newGameOpen && (
        <LazyNewGameModal
          channelId={groupId}
          onClose={() => setNewGameOpen(false)}
          onPostMarker={(marker) => {
            nostrActions.sendMessage(groupId, marker, null, []).catch((err) => {
              console.error('[games] posting the table card failed', err);
            });
          }}
        />
      )}

      <ChatComposer
        ref={composerRef}
        groupId={groupId}
        group={group}
        messages={messages}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        onOpenNewGame={() => setNewGameOpen(true)}
      />
    </>
  );

  return (
    <FileDropZone
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onFiles={(files) => composerRef.current?.pickFiles(files)}
    >
      <ChannelHeader
        groupId={groupId}
        group={group}
        isAdmin={isAdmin}
        showMembers={showMembers}
        onToggleMembers={onToggleMembers}
        onOpenSettings={() => setShowSettings(true)}
      />
      {/* Channel banner intentionally hidden - re-enable once we have a proper layout. */}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {group?.kind === 'forum' ? (
            <ForumView
              groupId={groupId}
              channelName={group?.name ?? undefined}
              onSelectThread={onSelectGroup}
            />
          ) : group?.kind === 'voice' || group?.kind === 'voice-sfu' ? (
            <LazyVoiceRoom
              channelId={groupId}
              channelName={group?.name ?? undefined}
              isChatOpen={voiceChatOpen}
              onToggleChat={() => setVoiceChatOpen(!voiceChatOpen)}
              chatSlot={
                <VoiceChatRail width={voiceChatWidth} onResize={onResize} onHide={() => setVoiceChatOpen(false)}>
                  {textBody}
                </VoiceChatRail>
              }
            />
          ) : textBody}
        </div>
        {showMembers && group?.kind === 'text' && <MembersPanel groupId={groupId} />}
      </div>

      {showSettings && group && (
        <ChannelSettingsModal group={group} onClose={() => setShowSettings(false)} />
      )}
    </FileDropZone>
  );
}
