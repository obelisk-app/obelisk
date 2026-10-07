'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import FeedScreen from '@/components/social/FeedScreen';
import { useTranslations } from 'next-intl';
import { DMOptInBoundary } from '../dm/DmOptInGate';
import { canRestore } from '@/utils/shell/desktop/feed-pane';
import { ChatLayout } from '../panes/channel/ChatPanel';
import { DmPanel } from '../panes/dm/DmPanel';
import { FeedPaneActions } from '../panes/reader/ReaderPane';
import { EmptyState } from './ShellStates';
import type { View } from '@/utils/shell/desktop/view';
import type { FeedPaneControls } from '@/hooks/shell/desktop/useDesktopLayout';

type Props = {
  view: View;
  setView: (v: View) => void;
  showMembers: boolean;
  onToggleMembers: () => void;
  pendingMessageId: string | null;
  onConsumePendingMessageId: () => void;
  leaveDms: () => void;
  feed: FeedPaneControls;
  onOpenProfile: (pubkey: string) => void;
  openThread: (id: string) => void;
  openArticle: (note: NostrEvent) => void;
};

/** The main column: a group chat, a DM thread, the full-screen feed, or the empty state. */
export function DesktopMain({
  view, setView, showMembers, onToggleMembers, pendingMessageId, onConsumePendingMessageId,
  leaveDms, feed, onOpenProfile, openThread, openArticle,
}: Props) {
  const t = useTranslations();
  return (
    /*
      The rounded top-left corner normally comes from the sidebar pane
      (`rounded-tl-xl` on the channel list). The feed view has no sidebar,
      so without this `main` is the leftmost surface and its corner sits
      square against the rail while every other view is rounded.
    */
    <main
      className={`flex flex-1 flex-col overflow-hidden min-w-0 border-t border-r border-lc-border ${
        view.kind === 'feed' ? 'rounded-tl-xl border-l' : ''
      }`}
    >
      {view.kind === 'group' ? (
        /*
          Keyed by channel so a switch mounts a fresh pane. Without it the
          pane's per-channel state (the message list above all) survived the
          switch, and the first render under the new header showed the old
          channel's messages. tests/app/app/channel-switch.test.tsx.
        */
        <ChatLayout
          key={view.groupId}
          groupId={view.groupId}
          showMembers={showMembers}
          onToggleMembers={onToggleMembers}
          pendingMessageId={pendingMessageId}
          onConsumePendingMessageId={onConsumePendingMessageId}
          onSelectGroup={(gid) => setView({ kind: 'group', groupId: gid })}
        />
      ) : view.kind === 'dm' ? (
        <DMOptInBoundary surface="desktop" secondaryLabel={t('dm.optIn.continueWithout')} onSecondary={leaveDms}>
          <DmPanel peer={view.peer} onPickPeer={(p) => setView({ kind: 'dm', peer: p })} />
        </DMOptInBoundary>
      ) : view.kind === 'feed' ? (
        /*
          No title bar. It was a 56px strip carrying the word "Feed" and
          an ✕ across the full width of a desktop, above a toolbar that
          already says what you're looking at, two headers where one
          does the job. The pane controls live in that toolbar now.
        */
        <div className="flex min-h-0 flex-1 flex-col">
          <FeedScreen
            onOpenProfile={onOpenProfile}
            onOpenThread={openThread}
            onOpenArticle={openArticle}
            actions={(
              <FeedPaneActions
                mode="full"
                canRestore={canRestore(feed.feedHost, 'full')}
                onExpand={feed.expand}
                onRestore={feed.restore}
                onClose={feed.close}
              />
            )}
          />
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}
