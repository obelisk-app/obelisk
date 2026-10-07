'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import { ReaderPaneHeader } from '../panes/reader/ReaderPane';
import { ReaderPaneContent } from '../panes/reader/ReaderPaneContent';
import { ResizablePane } from './ResizablePane';
import { THREAD_PANE_KEY } from '@/utils/shell/desktop/desktop-layout';

type Props = {
  article: NostrEvent | null;
  threadNoteId: string | null;
  full: boolean;
  setFull: (full: boolean) => void;
  onBack: () => void;
  onOpenProfile: (pubkey: string) => void;
  pushThread: (id: string) => void;
};

/**
 * Threads and articles open in a side pane on desktop, not a modal: a modal
 * hides the list you were reading, which is the context you need while
 * following a conversation.
 */
export function ReaderPaneSlot({ article, threadNoteId, full, setFull, onBack, onOpenProfile, pushThread }: Props) {
  const t = useTranslations();
  const title = article ? t('social.article') : t('social.thread');
  return full ? (
    // Fullscreen: an absolute overlay rather than another column, so
    // widening it can't squeeze the panes underneath.
    <div className="obelisk-desktop-bg absolute inset-0 z-40 flex flex-col" data-testid="desktop-thread-pane">
      <ReaderPaneHeader
        title={title}
        full
        onToggleFull={() => setFull(false)}
        onBack={onBack}
      />
      <ReaderPaneContent article={article} threadNoteId={threadNoteId} onOpenProfile={onOpenProfile} onOpenNote={pushThread} />
    </div>
  ) : (
    <ResizablePane storageKey={THREAD_PANE_KEY} defaultWidth={520} min={360} max={900} side="left" rounded={false}>
      <aside className="flex h-full min-w-0 flex-1 flex-col overflow-hidden border-l border-lc-border" data-testid="desktop-thread-pane">
        <ReaderPaneHeader
          title={title}
          full={false}
          onToggleFull={() => setFull(true)}
          onBack={onBack}
        />
        <ReaderPaneContent article={article} threadNoteId={threadNoteId} onOpenProfile={onOpenProfile} onOpenNote={pushThread} />
      </aside>
    </ResizablePane>
  );
}
