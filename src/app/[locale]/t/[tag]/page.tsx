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
import { getTranslations } from 'next-intl/server';
import { pageLocale } from '@/i18n/page-locale';
import { NOINDEX, noindexMetadata, renderedTitle } from '@/utils/seo/page';
import { cardAlt, cardImage } from '@/utils/seo/og';
import { hashtagFromSegment } from '@/utils/social/hashtag-segment';
import { Link } from '@/i18n/navigation';
import {
  displayNameFor,
  fetchHashtagNotes,
  fetchProfilesForViewer,
  type ViewerProfile,
} from '@/services/server/viewer/nostr-fetch';
import { plainTextForPreview, previewImage } from '@/services/server/viewer/note-preview';
import ViewerHeader from '@/components/social/viewer/ViewerHeader';
import FollowTagButton from '@/components/social/tags/FollowTagButton';
import { serverLocale } from '@/services/server/i18n/locale';
import { formatDate } from '@/utils/format/format';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { NOTE_VIEWER_PATH, noteIdentifier } from '@/services/social/note-links';
import { shortNpubLabel } from '@/utils/identity/short-npub';

export const runtime = 'nodejs';
export const revalidate = 120;

type Params = { params: Promise<{ tag: string; locale: string }> };

/**
 * Recent notes under a hashtag, from relays: out of search (`noindex,
 * follow`), like the note and profile pages; an endless set of URLs whose
 * content is other people's.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await pageLocale(params);
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
    image: cardImage(locale, path, cardAlt(t, renderedTitle(title))),
  });
}

export default async function HashtagPage({ params }: Params) {
  const { t, locale } = await serverLocale();
  const { tag } = await params;
  const clean = hashtagFromSegment(tag);

  if (!clean) {
    return (
      <Shell>
        <div className="px-5 py-20 text-center">
          <h1 className="text-lg font-semibold">{t('social.tagPage.notFound')}</h1>
          <p className="mt-2 text-sm text-lc-muted">{t('social.tagPage.notFoundHelp')}</p>
        </div>
      </Shell>
    );
  }

  const notes = await fetchHashtagNotes(clean, 30);
  const authors = await fetchProfilesForViewer([...new Set(notes.map((n) => n.pubkey))].slice(0, 30));
  const byPubkey = new Map(authors.map((profile) => [profile.pubkey, profile]));

  return (
    <Shell>
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 truncate text-2xl font-extrabold">#{clean}</h1>
          {/* NIP-51 kind 10015, so the follow is portable to other clients. */}
          <FollowTagButton tag={clean} />
        </div>
        <p className="mt-1 text-xs text-lc-muted">
          {notes.length > 0 ? t('social.tagPage.recent', { count: notes.length }) : t('social.tagPage.none')}
        </p>
      </div>

      <ul className="divide-y divide-lc-border border-t border-lc-border" data-testid="hashtag-notes">
        {notes.map((note) => {
          const profile = byPubkey.get(note.pubkey);
          const text = plainTextForPreview(note.content);
          const image = previewImage(note);
          return (
            <li key={note.id}>
              <Link href={`${NOTE_VIEWER_PATH}/${noteIdentifier(note)}`} className="block px-5 py-4 transition-colors hover:bg-white/[0.03]">
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar profile={profile} pubkey={note.pubkey} />
                  <span className="truncate text-sm font-semibold">
                    {profile ? displayNameFor(profile) : shortNpubLabel(note.pubkey)}
                  </span>
                  <time
                    className="ml-auto shrink-0 text-[10px] text-lc-muted"
                    dateTime={new Date(note.created_at * 1000).toISOString()}
                  >
                    {formatDate(locale, note.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </time>
                </div>
                <p className="line-clamp-3 text-sm text-lc-white">{text || t('social.viewer.sharedMedia')}</p>
                {image && (
                  <RemoteImage
                    src={image}
                    alt=""
                    decoding="async"
                    className="mt-2 max-h-56 w-full rounded-xl object-cover"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      <ViewerHeader />
      <div className="mx-auto max-w-2xl">{children}</div>
    </main>
  );
}

function Avatar({ profile, pubkey }: { profile?: ViewerProfile; pubkey: string }) {
  const name = profile ? displayNameFor(profile) : shortNpubLabel(pubkey);
  if (profile?.picture) {
    return (
      <RemoteImage
        src={profile.picture}
        alt=""
        decoding="async"
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lc-dark text-[10px] font-semibold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

