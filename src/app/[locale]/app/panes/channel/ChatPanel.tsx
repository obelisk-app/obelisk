'use client';

import ForumView from '@/components/chat/forum/ForumView';
import { FileDropZone } from '@/components/chat/composer/FileDropZone';
import { useChatPanel } from '@/hooks/shell/panes/channel/useChatPanel';
import LazyVoiceRoom from '@/components/voice/room/LazyVoiceRoom';
import { ChannelSettingsModal } from '../../modals/channel-settings/ChannelSettingsModal';
import { MembersPanel } from './MembersPanel';
import { ChannelHeader } from './ChannelHeader';
import { ChannelTextBody } from './ChannelTextBody';
import { VoiceChatRail } from './VoiceChatRail';

type ChatPanelProps = {
  groupId: string;
  showMembers: boolean;
  onToggleMembers: () => void;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
  onSelectGroup: (groupId: string) => void;
};

/**
 * The desktop channel pane: the header, then the body the channel's kind
 * calls for (a publication's threads, a voice room with its chat docked
 * beside it, or the messages and composer), the members column and the
 * settings dialog. Files dropped anywhere on it go to the composer. State
 * comes from `useChatPanel`.
 */
export function ChatLayout({
  groupId,
  showMembers,
  onToggleMembers,
  pendingMessageId,
  onConsumePendingMessageId,
  onSelectGroup,
}: ChatPanelProps) {
  const { voiceMainRef, ...vm } = useChatPanel({ groupId, showMembers, pendingMessageId, onConsumePendingMessageId });
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FileDropZone
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onFiles={vm.pickFiles}
      >
        <ChannelHeader
          groupId={groupId}
          group={vm.group}
          isAdmin={vm.isAdmin}
          showMembers={showMembers}
          onToggleMembers={onToggleMembers}
          onOpenSettings={vm.openSettings}
        />
        {/* Channel banner intentionally hidden - re-enable once we have a proper layout. */}

        <div className="flex flex-1 overflow-hidden">
          {/* Measured when the voice room's chat opens, which takes half of it. */}
          <div ref={voiceMainRef} className="flex flex-1 flex-col overflow-hidden">
            {vm.body === 'forum' ? (
              <ForumView
                groupId={groupId}
                channelName={vm.group?.name ?? undefined}
                onSelectThread={onSelectGroup}
              />
            ) : vm.body === 'voice' ? (
              <LazyVoiceRoom
                channelId={groupId}
                channelName={vm.group?.name ?? undefined}
                isChatOpen={vm.voiceChat.open}
                onToggleChat={vm.voiceChat.toggle}
                chatSlot={
                  <VoiceChatRail width={vm.voiceChat.width} onResize={vm.voiceChat.onResize} onHide={vm.voiceChat.hide}>
                    <ChannelTextBody vm={vm} scrollRef={vm.viewport.scrollRef} composerRef={vm.composerRef} />
                  </VoiceChatRail>
                }
              />
            ) : <ChannelTextBody vm={vm} scrollRef={vm.viewport.scrollRef} composerRef={vm.composerRef} />}
          </div>
          {vm.showMembersColumn && <MembersPanel groupId={groupId} />}
        </div>

        {vm.showSettings && vm.group && (
          <ChannelSettingsModal group={vm.group} onClose={vm.closeSettings} />
        )}
      </FileDropZone>
    </div>
  );
}
