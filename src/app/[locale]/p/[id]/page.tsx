/**
 * Public profile viewer - `/p/<npub|nprofile|hex>`.
 *
 * The profile half of Obelisk's njump. Server-rendered for the same reason
 * as the note viewer: a shared npub should produce a preview card with the
 * person's name, picture and bio, not a blank shell.
 *
 * The body is the app's own profile component, not a second implementation.
 * This page used to be a static kind-0 card - no notes, no tabs, no
 * pagination - so the profile page was the one place you couldn't read
 * anything the person had written. Everything below the fold (who they
 * follow, what they tag, where they publish) is the same server-rendered
 * context the note viewer builds.
 */

import Container from '@/components/ui/layout/Container';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';
import { ogImage } from '@/utils/seo/og';
import { Link } from '@/i18n/navigation';
import { serverLocale } from '@/services/server/i18n/locale';
import { parseIdentifier } from '@/services/social/identifier';
import {
  displayNameFor,
  fetchAuthorForViewer,
  fetchAuthorFollows,
  fetchAuthorNotes,
  fetchAuthorRelays,
  fetchProfilesForViewer,
  topHashtags,
} from '@/services/server/viewer/nostr-fetch';
import ViewerHeader from '@/components/social/viewer/ViewerHeader';
import AuthorContext from '@/app/[locale]/notes/[id]/AuthorContext';
import ProfileViewerClient from './ProfileViewerClient';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

export const runtime = 'nodejs';
export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Someone's Nostr profile: out of search (`noindex, follow`) for the same
 * reason as a note; the card is what the page is for.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  const { id } = await params;
  const path = `/p/${id}`;
  // A 404 when the id is not a profile identifier (a note, an address, noise).
  const target = parseIdentifier(id);
  if (!target || target.kind !== 'profile') notFound();
  const profile = await fetchAuthorForViewer(target.pubkey);
  if (!profile) {
    const title = t('seo.profile.notFound');
    return noindexMetadata({ locale, path, title, image: ogImage(t, locale, { live: 'profile', id }, renderedTitle(title)) });
  }

  const name = displayNameFor(profile);
  return noindexMetadata({
    locale,
    path,
    // The root layout's template already appends "· Obelisk".
    title: name,
    description: profile.about?.trim().slice(0, 200) || t('seo.profile.onNostr', { name }),
    type: 'profile',
    image: ogImage(t, locale, { live: 'profile', id }, renderedTitle(name)),
  });
}

export default async function ProfileViewerPage({ params }: Params) {
  const { t } = await serverLocale();
  const { id } = await params;
  const target = parseIdentifier(id);
  if (!target || target.kind !== 'profile') notFound();
  const pubkey = target.pubkey;
  const profile = await fetchAuthorForViewer(pubkey);

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-lc-black px-5 text-center text-lc-white">
        <div>
          <Heading as="h1" variant="card">{t('social.profileViewer.notFound')}</Heading>
          <Text as="p" variant="muted" className="mt-2">
            {t('social.profileViewer.notFoundHelp')}
          </Text>
          <Link href="/app" className="lc-pill-primary mt-6 inline-block px-5 py-2 text-xs">
            {t('social.viewer.openInObelisk')}
          </Link>
        </div>
      </main>
    );
  }

  // The same context the note viewer builds, fetched in parallel: a profile
  // page that shows only a bio is the dead end this route started as.
  const [notes, followPubkeys, relays] = await Promise.all([
    fetchAuthorNotes(pubkey, { limit: 6 }),
    fetchAuthorFollows(pubkey, 9),
    fetchAuthorRelays(pubkey),
  ]);
  const follows = followPubkeys.length ? await fetchProfilesForViewer(followPubkeys) : [];

  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      <ViewerHeader />

      <Container width="6xl" className="grid grid-cols-1 gap-x-10 px-0 lg:grid-cols-[minmax(0,1fr)_21rem] lg:px-5">
        {/*
          The live profile: the app's component, so the tabs, the outbox
          reads and the note rendering are the same ones the app uses rather
          than a second implementation that drifts.
        */}
        <div
          className="min-h-[70vh] min-w-0 lg:border-x lg:border-lc-border"
          data-testid="profile-viewer"
        >
          <ProfileViewerClient
            pubkey={pubkey}
            initialMeta={{
              name: profile.name,
              displayName: profile.displayName,
              picture: profile.picture,
              banner: profile.banner,
              about: profile.about,
              nip05: profile.nip05,
              website: profile.website,
              lud16: profile.lud16,
            }}
          />
        </div>

        <aside
          className="min-w-0 border-t border-lc-border px-5 py-8 lg:border-t-0 lg:px-0"
          data-testid="profile-sidebar"
        >
          <div
            className="min-w-0 space-y-8 overflow-x-hidden [overflow-wrap:anywhere] lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-2"
            style={{ scrollbarGutter: 'stable' }}
          >
            <AuthorContext
              author={profile}
              notes={notes}
              hashtags={topHashtags(notes)}
              follows={follows}
              relays={relays}
            />
          </div>
        </aside>
      </Container>
    </main>
  );
}

