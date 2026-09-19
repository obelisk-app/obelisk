/**
 * Public profile viewer — `/p/<npub|nprofile|hex>`.
 *
 * The profile half of Obelisk's njump. Server-rendered for the same reason as
 * the note viewer: a shared npub should produce a preview card with the
 * person's name, picture and bio, not a blank shell.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { nip19 } from 'nostr-tools';
import { parseIdentifier } from '@/lib/social/identifier';
import {
  displayNameFor,
  fetchAuthorForViewer,
  type ViewerProfile,
} from '@/lib/server/nostr-fetch';
import ViewerHeader from '@/components/social/ViewerHeader';

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
  const profile = await resolve(id);

  if (!profile) {
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

  const name = displayNameFor(profile);
  const npub = safeNpub(profile.pubkey);

  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      <ViewerHeader />

      <div className="mx-auto max-w-2xl" data-testid="profile-viewer">
        <div
          className="h-36 bg-gradient-to-br from-lc-olive to-lc-black bg-cover bg-center"
          style={profile.banner ? { backgroundImage: `url(${profile.banner})` } : undefined}
        />
        <div className="px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {profile.picture ? (
            <img
              src={profile.picture}
              alt=""
              className="-mt-14 h-28 w-28 rounded-full border-4 border-lc-black object-cover"
            />
          ) : (
            <div className="-mt-14 flex h-28 w-28 items-center justify-center rounded-full border-4 border-lc-black bg-lc-dark text-3xl font-bold">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}

          <h1 className="mt-3 text-2xl font-extrabold">{name}</h1>
          {profile.nip05 && <p className="mt-1 text-xs text-lc-green">{profile.nip05}</p>}
          <p className="mt-1 break-all font-mono text-[10px] text-lc-muted">{npub}</p>

          {profile.about && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-lc-muted">
              {profile.about}
            </p>
          )}

          <dl className="mt-5 space-y-1 text-xs">
            {profile.website && (
              <div className="flex gap-2">
                <dt className="text-lc-muted">Website</dt>
                <dd>
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer noopener nofollow"
                    className="text-lc-green underline"
                  >
                    {profile.website}
                  </a>
                </dd>
              </div>
            )}
            {profile.lud16 && (
              <div className="flex gap-2">
                <dt className="text-lc-muted">Lightning</dt>
                <dd className="font-mono">{profile.lud16}</dd>
              </div>
            )}
          </dl>

          <div className="py-8">
            <Link href="/app" className="lc-pill-primary inline-block px-5 py-2 text-xs">
              Follow on Obelisk
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function safeNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}
