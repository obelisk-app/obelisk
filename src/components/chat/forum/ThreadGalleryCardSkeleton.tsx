import { useTranslations } from 'next-intl';
import type { JsGroup } from '@/services/nostr-bridge';
import Skeleton from '@/components/ui/animations/Skeleton';

export function ThreadGalleryCardSkeleton({
  thread,
  onOpen,
}: {
  thread: JsGroup;
  onOpen: () => void;
}) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card flex flex-col overflow-hidden opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all text-left"
      data-testid="thread-gallery-card-skeleton"
      data-thread-id={thread.id}
      aria-label={thread.name ? t('chat.forum.openLoading', { name: thread.name }) : t('chat.forum.openLoadingUntitled')}
    >
      <div className="h-28 w-full bg-lc-black border-b border-lc-border" />
      <div className="p-3 space-y-2">
        <div className="text-sm font-semibold text-lc-white truncate">
          {thread.name || t('chat.forum.loadingTitle')}
        </div>
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2 w-1/2" />
      </div>
    </button>
  );
}
