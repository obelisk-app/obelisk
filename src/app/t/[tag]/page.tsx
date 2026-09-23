/**
 * Public hashtag page — `/t/<tag>`.
 *
 * Hashtags inside notes used to link to njump.me/t/<tag>, which meant every
 * rendered note in the app quietly exported its readers. They point here now,
 * and this is the page that has to justify the change: recent notes carrying
 * the tag, server-rendered so the link previews and so a crawler sees real
 * content.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { nip19 } from 'nostr-tools';
import {
  displayNameFor,
  fetchHashtagNotes,
  fetchProfilesForViewer,
  type ViewerProfile,
} from '@/lib/server/nostr-fetch';
import { plainTextForPreview, previewImage } from '@/lib/server/note-preview';
import ViewerHeader from '@/components/social/ViewerHeader';
import { serverLocale } from '@/lib/server/locale';

export const runtime = 'nodejs';
export const revalidate = 120;

type Params = { params: Promise<{ tag: string }> };

/** Tags are lowercase on the wire; anything else finds nothing. */
function normalizeTag(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  const clean = value.trim().replace(/^#/, '').toLowerCase();
  // Same character class the composer uses when it builds `t` tags.
  return /^[\p{L}\p{N}_-]{1,80}$/u.test(clean) ? clean : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { tag } = await params;
  const clean = normalizeTag(tag);
  if (!clean) return { title: 'Tag not found', robots: { index: false } };

  const title = `#${clean}`;
  const description = `Notes tagged ${title} on Nostr, via Obelisk.`;
  return {
    title,
    description,
    openGraph: { type: 'website', title, description, siteName: 'Obelisk' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function HashtagPage({ params }: Params) {
  const { t } = await serverLocale();
  const { tag } = await params;
  const clean = normalizeTag(tag);

  if (!clean) {
    return (
      <Shell>
        <div className="px-5 py-20 text-center">
          <h1 className="text-lg font-semibold">{t('tagPage.notFound')}</h1>
          <p className="mt-2 text-sm text-lc-muted">{t('tagPage.notFoundHelp')}</p>
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
        <h1 className="text-2xl font-extrabold">#{clean}</h1>
        <p className="mt-1 text-xs text-lc-muted">
          {notes.length > 0
            ? `${notes.length} recent note${notes.length === 1 ? '' : 's'} on the public relays`
            : 'No recent notes found on the public relays.'}
        </p>
      </div>

      <ul className="divide-y divide-lc-border border-t border-lc-border" data-testid="hashtag-notes">
        {notes.map((note) => {
          const profile = byPubkey.get(note.pubkey);
          const text = plainTextForPreview(note.content);
          const image = previewImage(note);
          return (
            <li key={note.id}>
              <Link href={eventPath(note)} className="block px-5 py-4 transition-colors hover:bg-white/[0.03]">
                <div className="mb-1.5 flex items-center gap-2">
                  <Avatar profile={profile} pubkey={note.pubkey} />
                  <span className="truncate text-sm font-semibold">
                    {profile ? displayNameFor(profile) : shortNpub(note.pubkey)}
                  </span>
                  <time
                    className="ml-auto shrink-0 text-[10px] text-lc-muted"
                    dateTime={new Date(note.created_at * 1000).toISOString()}
                  >
                    {new Date(note.created_at * 1000).toLocaleDateString()}
                  </time>
                </div>
                <p className="line-clamp-3 text-sm text-lc-white">{text || 'Shared media'}</p>
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
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
  const name = profile ? displayNameFor(profile) : shortNpub(pubkey);
  if (profile?.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={profile.picture}
        alt=""
        loading="lazy"
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

function eventPath(note: { id: string; pubkey: string }): string {
  try {
    return `/notes/${nip19.neventEncode({ id: note.id, author: note.pubkey, kind: 1 })}`;
  } catch {
    return `/notes/${note.id}`;
  }
}

function shortNpub(pubkey: string): string {
  try {
    return `${nip19.npubEncode(pubkey).slice(0, 12)}…`;
  } catch {
    return `${pubkey.slice(0, 10)}…`;
  }
}
