'use client';

import MentionNavigator from '@/components/chat/mentions/MentionNavigator';
import HistoryPaginationStatus from '@/components/chat/timeline/HistoryPaginationStatus';
import { FileDropZone } from '@/components/chat/composer/FileDropZone';
import { useTranslations } from 'next-intl';
import { LazyNewGameModal } from '../../../mounts/lazy-mounts';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useChannelScreen, type MobileMessageActionsContext } from '@/hooks/shell/mobile/screens/channel/useChannelScreen';
import { ChannelSettingsSheet } from '../../sheets/channel/ChannelSettingsSheet';
import { ChannelComposer } from './ChannelComposer';
import { ChannelHeaderBar } from './ChannelHeaderBar';
import { ChannelTimeline } from './ChannelTimeline';

/**
 * The phone channel: header, the timeline with history paging and the
 * mention navigator, the composer, and the settings and new-game sheets.
 * Everything it shows comes from `useChannelScreen`.
 */
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
  openMsgActions: (m: MobileMessageActionsContext) => void;
  openZap: (m: { id: string; pubkey: string; content: string }) => void;
  openProfile: (pubkey: string) => void;
  openMembers: () => void;
}) {
  const t = useTranslations();
  const { composerRef, messagesRef, ...vm } = useChannelScreen({ groupId, openMsgActions, openProfile });

  return (
    <FileDropZone
      className="screen active"
      data-screen="channel"
      onFiles={vm.dropFiles}
    >
      {vm.newGameOpen && (
        <LazyNewGameModal
          channelId={groupId}
          onClose={vm.closeNewGame}
          onPostMarker={vm.postMarker}
        />
      )}
      <ChannelHeaderBar
        header={vm.header}
        back={back}
        onSearch={() => go('search')}
        isChannelAdmin={vm.isChannelAdmin}
        onOpenSettings={vm.openSettings}
        openMembers={openMembers}
      />
      <div className="messages-wrap relative flex min-h-0 flex-1 flex-col">
        <div className="messages native-scroll-y" ref={messagesRef}>
          <ChannelTimeline
            items={vm.timeline}
            messagesStatus={vm.messagesStatus}
            messagesById={vm.messagesById}
            reactions={vm.reactions}
            myPubkey={vm.myPubkey}
            isAdmin={vm.isChannelAdmin}
            groupId={groupId}
            onLongPress={vm.onLongPressMessage}
            onAvatar={vm.onAvatarTap}
          />
        </div>
        {vm.timeline.length > 0 && (
          <HistoryPaginationStatus
            loading={vm.loadingEarlier}
            reachedStart={vm.reachedStart}
            atTop={vm.nearHistoryTop}
            loadingLabel={t('mobile.channel.loadingEarlier')}
            endLabel={t('mobile.channel.noEarlierMessages')}
          />
        )}
        <MentionNavigator scrollRef={messagesRef} eventIds={vm.mentionEventIds} />
      </div>

      <ChannelComposer
        ref={composerRef}
        groupId={groupId}
        group={vm.group}
        messages={vm.messages}
        replyingTo={vm.replyingTo}
        setReplyingTo={vm.setReplyingTo}
        onOpenNewGame={vm.openNewGame}
      />
      {vm.settingsOpen && vm.group && (
        <ChannelSettingsSheet
          group={vm.group}
          close={vm.closeSettings}
        />
      )}
    </FileDropZone>
  );
}
