import type { JsGroup } from '@/services/nostr-bridge';

export function ThreadCardSkeleton({ thread, onOpen }: { thread: JsGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card w-full text-left p-3 opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all"
      data-testid="thread-card-skeleton"
      data-thread-id={thread.id}
      aria-label={`Open ${thread.name ?? 'publication'} (still loading)`}
    >
      <div className="flex items-start gap-3">
        <div className="lc-skeleton-circle w-8 h-8 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-lc-white truncate">
            {thread.name || '(loading publication)'}
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

export function ThreadGalleryCardSkeleton({
  thread,
  onOpen,
}: {
  thread: JsGroup;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card flex flex-col overflow-hidden opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all text-left"
      data-testid="thread-gallery-card-skeleton"
      data-thread-id={thread.id}
      aria-label={`Open ${thread.name ?? 'publication'} (still loading)`}
    >
      <div className="h-28 w-full bg-lc-black border-b border-lc-border" />
      <div className="p-3 space-y-2">
        <div className="text-sm font-semibold text-lc-white truncate">
          {thread.name || '(loading publication)'}
        </div>
        <div className="lc-skeleton h-3 w-3/4" />
        <div className="lc-skeleton h-2 w-1/2" />
      </div>
    </button>
  );
}
