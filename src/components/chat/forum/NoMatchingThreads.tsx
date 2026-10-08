'use client';

import Stack from '@/components/ui/layout/Stack';
import type { ReactNode } from 'react';
import { useSignerReady } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';

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
    <Stack
      gap="2" align="center" className="justify-center h-full text-center text-lc-muted py-12"
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
    </Stack>
  );
}
