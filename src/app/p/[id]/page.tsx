/**
 * Public profile viewer — `/p/<npub|nprofile|hex>`.
 *
 * The profile half of Obelisk's njump. Server-rendered for the same reason
 * as the note viewer: a shared npub should produce a preview card with the
 * person's name, picture and bio, not a blank shell.
 *
 * The body is the app's own profile component, not a second implementation.
 * This page used to be a static kind-0 card — no notes, no tabs, no
 * pagination — so the profile page was the one place you couldn't read
 * anything the person had written. Everything below the fold (who they
 * follow, what they tag, where they publish) is the same server-rendered
 * context the note viewer builds.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { parseIdentifier } from '@/lib/social/identifier';
import {
  displayNameFor,
  fetchAuthorForViewer,
  fetchAuthorFollows,
  fetchAuthorNotes,
  fetchAuthorRelays,
  fetchProfilesForViewer,
  topHashtags,
  type ViewerProfile,
} from '@/lib/server/nostr-fetch';
import ViewerHeader from '@/components/social/ViewerHeader';
import AuthorContext from '@/app/notes/[id]/AuthorContext';
import ProfileViewerClient from './ProfileViewerClient';

export const runtime = 'nodejs';
export const revalidate = 300;

type Params = { params: Promise<{ id: string }> };

/** kind-0 metadata only — the feed itself needs a signed-in client. */
async function resolve(id: string): Promise<ViewerProfile | null> {
  const target = parseIdentifier(id);
  if (!target || target.kind !== 'profile') return null;
  return fetchAuthorForViewer(target.pubkey);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const profile = await resolve(id);
  if (!profile) {
    return { title: 'Profile not found · Obelisk', robots: { index: false } };
  }

  const name = displayNameFor(profile);
  const description = profile.about?.trim().slice(0, 200) || `${name} on Nostr`;

  return {
    title: `${name} · Obelisk`,
    description,
    openGraph: {
      type: 'profile',
      title: name,
      description,
      siteName: 'Obelisk',
      ...(profile.picture ? { images: [{ url: profile.picture }] } : {}),
    },
    twitter: {
      card: 'summary',
      title: name,
      description,
      ...(profile.picture ? { images: [profile.picture] } : {}),
    },
  };
}

export default async function ProfileViewerPage({ params }: Params) {
  const { id } = await params;
  const target = parseIdentifier(id);
  const pubkey = target?.kind === 'profile' ? target.pubkey : null;
  const profile = pubkey ? await fetchAuthorForViewer(pubkey) : null;

  if (!pubkey || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-lc-black px-5 text-center text-lc-white">
        <div>
          <h1 className="text-lg font-semibold">Profile not found</h1>
          <p className="mt-2 text-sm text-lc-muted">
            That identifier couldn&apos;t be resolved on the public relays.
          </p>
          <Link href="/app" className="lc-pill-primary mt-6 inline-block px-5 py-2 text-xs">
            Open in Obelisk
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

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-0 lg:grid-cols-[minmax(0,1fr)_21rem] lg:px-5">
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
      </div>
    </main>
  );
}

