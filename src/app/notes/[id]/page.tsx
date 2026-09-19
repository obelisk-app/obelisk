/**
 * Public note viewer — Obelisk's own njump.
 *
 * This is a **server component on purpose**, which is a deliberate exception
 * to the app's client-only architecture. The reason is link previews: a
 * client-rendered page hands crawlers an empty shell, so pasting a shared
 * note into any chat app produces a blank card. njump renders server-side
 * precisely so the preview works, and matching it means resolving the event
 * before the HTML goes out.
 *
 * The interactive rendering still happens on the client (`NoteViewerClient`),
 * which also re-fetches if the server's bounded query came up empty — a slow
 * relay shouldn't turn into a permanent 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { parseIdentifier } from '@/lib/social/identifier';
import {
  displayNameFor,
  fetchAuthorFollows,
  fetchAuthorForViewer,
  fetchAuthorNotes,
  fetchAuthorRelays,
  fetchEventForViewer,
  fetchProfilesForViewer,
  topHashtags,
} from '@/lib/server/nostr-fetch';
import { buildNotePreview } from '@/lib/server/note-preview';
import ObeliskIcon from '@/components/ObeliskIcon';
import NoteViewerClient from './NoteViewerClient';
import AuthorContext from './AuthorContext';
import OpenInClients from './OpenInClients';

export const runtime = 'nodejs';
/**
 * Events are immutable (or, for addressable kinds, latest-wins), so a short
 * cache keeps a popular link from re-querying relays on every crawl while
 * still picking up article edits within the minute.
 */
export const revalidate = 60;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const target = parseIdentifier(id);
  if (!target) {
    return { title: 'Note not found · Obelisk', robots: { index: false } };
  }

  const note = await fetchEventForViewer(target);
  if (!note) {
    // Don't index a page we couldn't resolve — it may resolve later, but a
    // crawler shouldn't cache the empty version as canonical.
    return { title: 'Note not found · Obelisk', robots: { index: false } };
  }

  const author = await fetchAuthorForViewer(note.pubkey);
  const preview = buildNotePreview(note, displayNameFor(author));
  const images = preview.image ? [{ url: preview.image }] : undefined;

  return {
    title: `${preview.title} · Obelisk`,
    description: preview.description,
    openGraph: {
      type: preview.isArticle ? 'article' : 'website',
      title: preview.title,
      description: preview.description,
      siteName: 'Obelisk',
      ...(images ? { images } : {}),
    },
    twitter: {
      card: preview.image ? 'summary_large_image' : 'summary',
      title: preview.title,
      description: preview.description,
      ...(preview.image ? { images: [preview.image] } : {}),
    },
  };
}

export default async function NoteViewerPage({ params }: Params) {
  const { id } = await params;
  const target = parseIdentifier(id);
  const note = target ? await fetchEventForViewer(target) : null;

  // Author context, in parallel — a bare note is a fragment, and four
  // sequential relay round-trips would be slower than the note itself.
  const [author, authorNotes, followPubkeys, relays] = note
    ? await Promise.all([
      fetchAuthorForViewer(note.pubkey),
      fetchAuthorNotes(note.pubkey, { excludeId: note.id, limit: 5 }),
      fetchAuthorFollows(note.pubkey, 12),
      fetchAuthorRelays(note.pubkey),
    ])
    : [null, [], [], { read: [], write: [] }];

  const follows = followPubkeys.length ? await fetchProfilesForViewer(followPubkeys) : [];
  // The author's own recent notes are the honest signal of what they write
  // about; nobody declares a topic list.
  const hashtags = topHashtags(note ? [note, ...authorNotes] : authorNotes);

  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      <header className="sticky top-0 z-20 border-b border-lc-border bg-lc-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="Obelisk">
            <ObeliskIcon className="h-6 w-6" />
            <span className="text-sm font-semibold">Obelisk</span>
          </Link>
          <Link href="/app" className="lc-pill-primary ml-auto px-4 py-2 text-xs">
            Open in Obelisk
          </Link>
        </div>
      </header>

      {/*
        The server-rendered fallback is what a crawler and a no-JS reader see.
        Plain on purpose — its job is to carry the text, not to look like the
        app.
      */}
      <noscript>
        {note && (
          <div className="mx-auto max-w-2xl px-5 py-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.content}</p>
          </div>
        )}
      </noscript>

      {/*
        Two columns from `lg` up: the note reads on the left at a comfortable
        measure, and everything about its author lives in a rail on the right
        rather than being buried a screen below the fold. Below `lg` the grid
        collapses and the rail simply follows the note.
      */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 px-0 lg:grid-cols-[minmax(0,1fr)_21rem] lg:px-5">
        <div className="min-w-0 lg:border-x lg:border-lc-border">
          <NoteViewerClient target={target} initialNote={note} />
        </div>

        {note && (
          <aside
            className="min-w-0 border-t border-lc-border px-5 py-8 lg:border-t-0 lg:px-0 lg:py-8"
            data-testid="note-sidebar"
          >
            {/*
              Sticky so the context stays reachable while a long article
              scrolls past. `max-h`/`overflow-y` keep a long rail from
              becoming unreachable when it is taller than the viewport.
            */}
            <div className="space-y-8 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <OpenInClients identifier={decodeURIComponent(id).replace(/^nostr:/i, '')} />
              {author && (
                <AuthorContext
                  author={author}
                  notes={authorNotes}
                  hashtags={hashtags}
                  follows={follows.slice(0, 9)}
                  relays={relays}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
