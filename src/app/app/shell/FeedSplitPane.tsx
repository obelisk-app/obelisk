'use client';

import FeedScreen from '@/components/social/FeedScreen';
import { canRestore } from '../feed-pane';
import { FeedPaneActions } from '../panes/ReaderPane';
import { ResizablePane } from '../panes/ResizablePane';
import { FEED_PANE_KEY } from './desktop-layout';
import type { FeedPaneControls } from './useDesktopLayout';

/** The feed as a resizable column beside a group chat. */
export function FeedSplitPane({ feed, onOpenProfile }: {
  feed: FeedPaneControls;
  onOpenProfile: (pubkey: string) => void;
}) {
  return (
    <ResizablePane storageKey={FEED_PANE_KEY} defaultWidth={520} min={360} max={900} side="left" rounded={false}>
      <aside
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-l border-lc-border"
        data-testid="desktop-feed-pane"
      >
        <div className="min-h-0 flex-1">
          {/*
            No `onOpenThread` / `onOpenArticle` here on purpose: the
            feed falls back to its own modal. Handing them to the shell
            would open a third fixed-width column beside the sidebar and
            chat, and three panes don't fit, `main` collapsed and
            dragging any one handle appeared to resize all of them.
          */}
          <FeedScreen
            embedded
            onOpenProfile={onOpenProfile}
            actions={(
              <FeedPaneActions
                mode={feed.feedPane.mode}
                canRestore={canRestore(feed.feedHost, feed.feedPane.mode)}
                onExpand={feed.expand}
                onRestore={feed.restore}
                onClose={feed.close}
              />
            )}
          />
        </div>
      </aside>
    </ResizablePane>
  );
}
