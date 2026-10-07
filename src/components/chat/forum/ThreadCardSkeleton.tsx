import { useTranslations } from 'next-intl';
import type { JsGroup } from '@/services/nostr-bridge';

export function ThreadCardSkeleton({ thread, onOpen }: { thread: JsGroup; onOpen: () => void }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card w-full text-left p-3 opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all"
      data-testid="thread-card-skeleton"
      data-thread-id={thread.id}
      aria-label={thread.name ? t('chat.forum.openLoading', { name: thread.name }) : t('chat.forum.openLoadingUntitled')}
    >
      <div className="flex items-start gap-3">
        <div className="lc-skeleton-circle w-8 h-8 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-lc-white truncate">
            {thread.name || t('chat.forum.loadingTitle')}
          </div>
          <div className="lc-skeleton h-3 w-3/4 mt-1.5" />
          <div className="flex flex-wrap gap-x-3 mt-2">
            <span className="lc-skeleton h-2 w-16 inline-block" />
            <span className="lc-skeleton h-2 w-12 inline-block" />
          </div>
        </div>
      </div>
    </button>
  );
}
