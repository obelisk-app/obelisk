/**
 * Public hashtag page - `/t/<tag>`.
 *
 * Hashtags inside notes used to link to njump.me/t/<tag>, which meant every
 * rendered note in the app quietly exported its readers. They point here now,
 * and this is the page that has to justify the change: recent notes carrying
 * the tag, server-rendered so the link previews and so a crawler sees real
 * content.
 */

import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';
import { NOINDEX } from '@/constants/seo/page';
import { ogImage } from '@/utils/seo/og';
import { hashtagFromSegment } from '@/utils/social/hashtag-segment';
import { fetchHashtagNotes, fetchProfilesForViewer } from '@/services/server/viewer/nostr-fetch';
import FollowTagButton from '@/components/social/tags/FollowTagButton';
import { serverLocale } from '@/services/server/i18n/locale';
import HashtagShell from './HashtagShell';
import HashtagNoteItem from './HashtagNoteItem';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

export const runtime = 'nodejs';
export const revalidate = 120;

type Params = { params: Promise<{ tag: string }> };

/**
 * Recent notes under a hashtag, from relays: out of search (`noindex,
 * follow`), like the note and profile pages; an endless set of URLs whose
 * content is other people's.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  const { tag } = await params;
  const clean = hashtagFromSegment(tag);
  if (!clean) return { title: t('seo.tag.notFound'), robots: NOINDEX };
  const path = `/t/${encodeURIComponent(clean)}`;
  const title = `#${clean}`;
  return noindexMetadata({
    locale,
    path,
    title,
    description: t('seo.tag.description', { tag: clean }),
    image: ogImage(t, locale, { live: 'tag', id: clean }, renderedTitle(title)),
  });
}

export default async function HashtagPage({ params }: Params) {
  const { t, locale } = await serverLocale();
  const { tag } = await params;
  const clean = hashtagFromSegment(tag);

  if (!clean) {
    return (
      <HashtagShell>
        <div className="px-5 py-20 text-center">
          <Heading as="h1" variant="card">{t('social.tagPage.notFound')}</Heading>
          <Text as="p" variant="muted" className="mt-2">{t('social.tagPage.notFoundHelp')}</Text>
        </div>
      </HashtagShell>
    );
  }

  const notes = await fetchHashtagNotes(clean, 30);
  const authors = await fetchProfilesForViewer([...new Set(notes.map((n) => n.pubkey))].slice(0, 30));
  const byPubkey = new Map(authors.map((profile) => [profile.pubkey, profile]));

  return (
    <HashtagShell>
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <Heading as="h1" className="min-w-0 truncate text-2xl font-extrabold">#{clean}</Heading>
          {/* NIP-51 kind 10015, so the follow is portable to other clients. */}
          <FollowTagButton tag={clean} />
        </div>
        <Text as="p" variant="caption" className="mt-1">
          {notes.length > 0 ? t('social.tagPage.recent', { count: notes.length }) : t('social.tagPage.none')}
        </Text>
      </div>

      <ul className="divide-y divide-lc-border border-t border-lc-border" data-testid="hashtag-notes">
        {notes.map((note) => (
          <HashtagNoteItem
            key={note.id}
            note={note}
            profile={byPubkey.get(note.pubkey)}
            locale={locale}
            sharedMedia={t('social.viewer.sharedMedia')}
          />
        ))}
      </ul>
    </HashtagShell>
  );
}
