'use client';

import type { ReactNode } from 'react';
import { useSignerReady } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import TextButton from '@/components/ui/buttons/TextButton';

export function LoadingThreads() {
  const t = useTranslations();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-3"
      data-testid="threads-loading"
    >
      <div className="lc-spinner" aria-hidden="true" />
      <div className="text-sm">{t('chat.forum.loading')}</div>
    </div>
  );
}

export function EmptyForum({ onNewThread }: { onNewThread: () => void }) {
  const t = useTranslations();
  const ready = useSignerReady();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12">
      <div className="text-sm">{t('chat.forum.emptyDesktop')}</div>
      {ready && (
        <TextButton
          onClick={onNewThread} className="mt-3 text-sm font-medium"
        >
          {t('chat.forum.startFirst')}
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
  const t = useTranslations();
  const ready = useSignerReady();
  const quoted = (chunks: ReactNode) => <span className="text-lc-white">{chunks}</span>;
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-2"
      data-testid="forum-no-matches"
    >
      <div className="text-sm">
        {!query
          ? t('chat.forum.noMatchTags')
          : t.rich(hasTagFilter ? 'chat.forum.noMatchQueryTags' : 'chat.forum.noMatchQuery', { query, q: quoted })}
      </div>
      {ready && query && (
        <Button
          variant="pill"
          size="xs"
          onClick={onCreate}
          className="mt-2"
          data-testid="forum-create-from-search"
        >
          {t('chat.forum.createFromSearch', { query })}
        </Button>
      )}
    </div>
  );
}
