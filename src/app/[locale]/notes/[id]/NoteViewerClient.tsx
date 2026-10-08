'use client';

/**
 * Interactive half of the public note viewer.
 *
 * The server resolves the event so the HTML (and the link preview) is
 * complete without JS. This island re-renders it with the real components -
 * clickable mentions, media galleries, article typography - and falls back to
 * fetching client-side when the server's bounded query came up empty, which
 * happens when the relays were slow rather than when the note is gone.
 */

import Link from '@/components/ui/navigation/Link';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import NoteCard from '@/components/social/note/NoteCard';
import ArticleReader from '@/components/social/article/ArticleReader';
import type { ViewerTarget } from '@/services/social/identifier';
import { useNoteViewer } from '@/hooks/social/viewer/useNoteViewer';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';

export default function NoteViewerClient({
  target,
  initialNote,
}: {
  target: ViewerTarget | null;
  initialNote: NostrEvent | null;
}) {
  const t = useTranslations();
  const { state, note, isArticle, openProfile } = useNoteViewer({ target, initialNote });

  if (state === 'loading') {
    return (
      <div className="space-y-3 p-5" data-testid="note-viewer-loading">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (state === 'missing' || !note) {
    return (
      <div className="px-5 py-20 text-center" data-testid="note-viewer-missing">
        <Heading as="h1" variant="card">{t('social.noteNotFoundTitle')}</Heading>
        <Text as="p" variant="muted" className="mt-2">{t('social.noteNotFound')}</Text>
        <Link href="/app?s=feed" variant="button" buttonVariant="pill" size="xs" className="mt-6">
          {t('social.noteViewer.openApp')}
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="note-viewer">
      {isArticle ? (
        <ArticleReader
          note={note}
          // The reader's author button was a dead click here: this page has no
          // in-app profile pane, so send them to the public profile viewer.
          onOpenProfile={openProfile}
        />
      ) : (
        <div className="border-b border-lc-border">
          <NoteCard note={note} />
        </div>
      )}
    </div>
  );
}
