'use client';

import { useSignerReady } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import TextButton from '@/components/ui/TextButton';

export function LoadingThreads() {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-3"
      data-testid="threads-loading"
    >
      <div className="lc-spinner" aria-hidden="true" />
      <div className="text-sm">{t('forum.loading')}</div>
    </div>
  );
}

export function EmptyForum({ onNewThread }: { onNewThread: () => void }) {
  const { t } = useTranslation();
  const ready = useSignerReady();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12">
      <div className="text-sm">{t('forum.emptyDesktop')}</div>
      {ready && (
        <TextButton
          onClick={onNewThread} className="mt-3 text-sm font-medium"
        >
          {t('forum.startFirst')}
        </TextButton>
      )}
    </div>
  );
}

export function NoMatchingThreads({
  query,
  hasTagFilter,
  onCreate,
}: {
  query: string;
  hasTagFilter: boolean;
  onCreate: () => void;
}) {
  const ready = useSignerReady();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-2"
      data-testid="forum-no-matches"
    >
      <div className="text-sm">
        No publications match{' '}
        {query ? <span className="text-lc-white">&ldquo;{query}&rdquo;</span> : 'the selected tags'}
        {query && hasTagFilter ? ' with the current tag filter' : ''}.
      </div>
      {ready && query && (
        <Button
          variant="pill"
          size="xs"
          onClick={onCreate}
          className="mt-2"
          data-testid="forum-create-from-search"
        >
          Create &ldquo;{query}&rdquo;
        </Button>
      )}
    </div>
  );
}
