'use client';

import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import MentionNavigator from '@/components/chat/mentions/MentionNavigator';
import HistoryPaginationStatus from '@/components/chat/timeline/HistoryPaginationStatus';
import type { ChatPanelView } from '@/hooks/shell/panes/channel/useChatPanel';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { LazyNewGameModal } from '../../mounts/lazy-mounts';
import { ChannelMessageList } from './ChannelMessageList';
import { ChatComposer } from './ChatComposer';

/**
 * A channel's text: the scrolling message list with its history status and
 * mention navigator, the new-game dialog, and the composer. Shown as the
 * pane's body, or docked beside a voice room. The two refs come as their
 * own props: read off the model, they would make every read of it look
 * like a ref read to the React compiler's lint.
 */
export function ChannelTextBody({ vm, scrollRef, composerRef }: {
  vm: ChatPanelView;
  scrollRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<ComposerHandle | null>;
}) {
  const t = useTranslations();
  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4" data-testid={vm.messagesVisible ? undefined : 'messages-gated-by-auth'}>
          <ChannelMessageList
            groupId={vm.groupId}
            group={vm.group}
            messages={vm.messages}
            messagesById={vm.messagesById}
            reactions={vm.reactions}
            zapTotals={vm.zapTotals}
            isAdmin={vm.isAdmin}
            onReply={vm.setReplyingTo}
            emptyStage={vm.emptyStage}
          />
        </div>
        {vm.messages.length > 0 && (
          <HistoryPaginationStatus
            loading={vm.viewport.loadingEarlier}
            reachedStart={vm.viewport.reachedStart}
            atTop={vm.viewport.nearHistoryTop}
            loadingLabel={t('shell.desktop.channel.loadingEarlier')}
            endLabel={t('shell.desktop.channel.noEarlierMessages')}
          />
        )}
        <MentionNavigator scrollRef={scrollRef} eventIds={vm.highlightIds} />
      </div>

      {vm.newGameOpen && (
        <LazyNewGameModal
          channelId={vm.groupId}
          onClose={vm.closeNewGame}
          onPostMarker={vm.postGameMarker}
        />
      )}

      <ChatComposer
        ref={composerRef}
        groupId={vm.groupId}
        group={vm.group}
        messages={vm.messages}
        replyingTo={vm.replyingTo}
        setReplyingTo={vm.setReplyingTo}
        onOpenNewGame={vm.openNewGame}
      />
    </>
  );
}
